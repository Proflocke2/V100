/**
 * STICKY MUTE — prevents evading a mute by leaving and rejoining.
 *
 * When a muted user leaves the server and comes back:
 *   1. Timeout is immediately restored (remaining time)
 *   2. Mute role is reassigned (if configured)
 *   3. The DB entry stays until the mute expires
 *
 * DB table: sticky_mutes
 *   guild_id, user_id, expires_at (unix timestamp, 0 = permanent)
 */

import { GuildMember } from 'discord.js';
import db from '../../database/db';

// ── Schema ─────────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS sticky_mutes (
    guild_id    TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    expires_at  INTEGER NOT NULL,
    reason      TEXT,
    muted_by    TEXT,
    muted_at    INTEGER DEFAULT (unixepoch()),
    PRIMARY KEY (guild_id, user_id)
  );
`);

// ── CRUD ───────────────────────────────────────────────────────────────────────

export interface StickyMuteRecord {
  guild_id:   string;
  user_id:    string;
  expires_at: number;
  reason:     string | null;
  muted_by:   string | null;
  muted_at:   number;
}

export function addStickyMute(
  guildId: string,
  userId: string,
  expiresAt: number,
  reason: string | null,
  mutedBy: string | null,
): void {
  db.prepare(`
    INSERT INTO sticky_mutes (guild_id, user_id, expires_at, reason, muted_by)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (guild_id, user_id) DO UPDATE SET
      expires_at = excluded.expires_at,
      reason     = excluded.reason,
      muted_by   = excluded.muted_by,
      muted_at   = unixepoch()
  `).run(guildId, userId, expiresAt, reason, mutedBy);
}

export function removeStickyMute(guildId: string, userId: string): void {
  db.prepare('DELETE FROM sticky_mutes WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
}

export function getStickyMute(guildId: string, userId: string): StickyMuteRecord | null {
  return db.prepare('SELECT * FROM sticky_mutes WHERE guild_id = ? AND user_id = ?')
    .get(guildId, userId) as StickyMuteRecord | null;
}

export function listStickyMutes(guildId: string): StickyMuteRecord[] {
  return db.prepare('SELECT * FROM sticky_mutes WHERE guild_id = ? ORDER BY muted_at DESC')
    .all(guildId) as StickyMuteRecord[];
}

/** Cleanup expired mutes (call periodically) */
export function cleanExpiredMutes(): void {
  const now = Math.floor(Date.now() / 1000);
  db.prepare('DELETE FROM sticky_mutes WHERE expires_at > 0 AND expires_at <= ?').run(now);
}

// ── Rejoin handler ─────────────────────────────────────────────────────────────

export async function handleStickyMuteOnJoin(member: GuildMember): Promise<void> {
  const record = getStickyMute(member.guild.id, member.id);
  if (!record) return;

  const now = Math.floor(Date.now() / 1000);

  // Check if the mute has expired
  if (record.expires_at > 0 && record.expires_at <= now) {
    removeStickyMute(member.guild.id, member.id);
    return;
  }

  const reason = `[Sticky Mute] ${record.reason ?? 'Mute restored after rejoin'}`;

  // Restore Discord Timeout (if not permanent)
  if (record.expires_at > 0) {
    const remainingMs = (record.expires_at - now) * 1000;
    if (remainingMs > 0 && remainingMs <= 28 * 24 * 60 * 60 * 1000) {
      await member.timeout(remainingMs, reason).catch(() => {});
    }
  } else {
    // Permanent sticky mute — apply maximum timeout (28 days) repeatedly
    // (Discord doesn't support indefinite timeout; best effort)
    const maxTimeout = 28 * 24 * 60 * 60 * 1000;
    await member.timeout(maxTimeout, reason).catch(() => {});
  }

  // Also apply mute role if configured in the guild
  const muteRoleId = (db.prepare('SELECT mute_role FROM guilds WHERE id = ?').get(member.guild.id) as any)?.mute_role;
  if (muteRoleId) {
    await member.roles.add(muteRoleId, reason).catch(() => {});
  }

  console.log(`[StickyMute] Reapplied mute for ${member.user.tag} in ${member.guild.name}`);
}
