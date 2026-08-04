/**
 * TEMP-BAN — optional expiry on /ban add, auto-lifted by a scheduler tick.
 *
 * A temp-ban is a regular Discord ban (same as a normal /ban add) plus one
 * row in `temp_bans` recording when it should be lifted. The scheduler
 * (runTempBanTick, wired up in handlers/schedulers.ts) polls once a minute
 * for expired rows, unbans the user, and logs the auto-unban as its own
 * mod-case via logModAction — so it shows up in /records case / /history
 * exactly like a manual /unban would, just with the bot as moderator.
 *
 * The original ban itself is already a normal mod-case (via the existing
 * logModAction('ban', ..., durationMs) call in ban.ts) — durationMs on that
 * case is what makes it show as a temp-ban rather than a permanent one in
 * /history. `temp_bans` is purely internal scheduling state, not a second
 * source of truth for what happened.
 */

import { Client } from 'discord.js';
import db, { logModAction } from '../../database/db';
import { logError } from '../errorTracking/service';

// ── Schema ────────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS temp_bans (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id    TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    banned_by   TEXT NOT NULL,
    reason      TEXT,
    expires_at  INTEGER NOT NULL,
    created_at  INTEGER DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_temp_bans_guild_user ON temp_bans (guild_id, user_id);
  CREATE INDEX IF NOT EXISTS idx_temp_bans_expires ON temp_bans (expires_at);
`);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TempBanRow {
  id: number;
  guild_id: string;
  user_id: string;
  banned_by: string;
  reason: string | null;
  expires_at: number; // unix seconds
  created_at: number;
}

// ── Scheduling ────────────────────────────────────────────────────────────────

/**
 * Records that a just-issued ban should be auto-lifted at expiresAtSeconds.
 * Any existing pending temp-ban row for the same user is replaced first —
 * re-running /ban add with a new duration on an already temp-banned user
 * resets the timer rather than leaving two competing rows.
 */
export function scheduleTempBan(
  guildId: string,
  userId: string,
  bannedBy: string,
  reason: string,
  expiresAtSeconds: number,
): void {
  db.prepare('DELETE FROM temp_bans WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
  db.prepare(
    'INSERT INTO temp_bans (guild_id, user_id, banned_by, reason, expires_at) VALUES (?, ?, ?, ?, ?)',
  ).run(guildId, userId, bannedBy, reason, expiresAtSeconds);
}

/**
 * Cancels a pending auto-unban — call this whenever a temp-banned user gets
 * manually unbanned early, so the scheduler doesn't try to unban them again
 * later (harmless no-op against Discord, but would leave a confusing
 * "auto-unbanned" case in /history for someone already gone).
 */
export function clearTempBan(guildId: string, userId: string): boolean {
  const res = db.prepare('DELETE FROM temp_bans WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
  return res.changes > 0;
}

export function getTempBan(guildId: string, userId: string): TempBanRow | null {
  return (db.prepare(
    'SELECT * FROM temp_bans WHERE guild_id = ? AND user_id = ?',
  ).get(guildId, userId) as TempBanRow | undefined) ?? null;
}

export function listTempBans(guildId: string): TempBanRow[] {
  return db.prepare(
    'SELECT * FROM temp_bans WHERE guild_id = ? ORDER BY expires_at ASC',
  ).all(guildId) as TempBanRow[];
}

// ── Scheduler tick ────────────────────────────────────────────────────────────

/**
 * Called every minute by startTempBanScheduler(). Unbans anyone whose
 * temp-ban has expired and logs the auto-unban as a mod-case. A guild the
 * bot has since left, or a user Discord already dropped the ban record
 * for, is treated as already-resolved — the row is cleared either way so
 * it doesn't retry forever.
 */
export async function runTempBanTick(client: Client): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const due = db.prepare('SELECT * FROM temp_bans WHERE expires_at <= ?').all(now) as TempBanRow[];
  if (!due.length) return;

  const botId = client.user?.id;

  for (const row of due) {
    db.prepare('DELETE FROM temp_bans WHERE id = ?').run(row.id);
    try {
      const guild = await client.guilds.fetch(row.guild_id).catch(() => null);
      if (!guild) continue;
      await guild.members.unban(row.user_id, '[Temp-Ban] Duration expired').catch(() => {});
      if (botId) {
        logModAction(row.guild_id, row.user_id, botId, 'unban', '[Temp-Ban] Duration expired — auto-unbanned');
      }
      console.log(`[TempBan] Auto-unbanned ${row.user_id} in guild ${row.guild_id} (duration expired).`);
    } catch (err) {
      console.error(`[TempBan] Failed to auto-unban ${row.user_id} in guild ${row.guild_id}:`, err);
      logError('scheduler:tempban', err, { guildId: row.guild_id, userId: row.user_id });
    }
  }
}
