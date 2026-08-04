/**
 * AFK SYSTEM — users set /afk [reason] and the bot auto-replies when
 * someone mentions them. Status clears automatically when the AFK user
 * sends any message in the same guild.
 *
 * Stored in DB (not memory) so it survives restarts and works across
 * Render's free-tier cold starts without losing AFK state.
 */

import db from '../../database/db';

db.exec(`
  CREATE TABLE IF NOT EXISTS afk_status (
    guild_id TEXT NOT NULL,
    user_id  TEXT NOT NULL,
    reason   TEXT,
    set_at   INTEGER DEFAULT (unixepoch()),
    PRIMARY KEY (guild_id, user_id)
  );
`);

export interface AfkRow {
  guild_id: string; user_id: string;
  reason: string | null; set_at: number;
}

export function setAfk(guildId: string, userId: string, reason: string | null): void {
  db.prepare(
    'INSERT INTO afk_status (guild_id, user_id, reason) VALUES (?, ?, ?) ON CONFLICT(guild_id, user_id) DO UPDATE SET reason = excluded.reason, set_at = unixepoch()'
  ).run(guildId, userId, reason);
}

export function clearAfk(guildId: string, userId: string): boolean {
  return db.prepare('DELETE FROM afk_status WHERE guild_id = ? AND user_id = ?').run(guildId, userId).changes > 0;
}

export function getAfk(guildId: string, userId: string): AfkRow | null {
  return (db.prepare('SELECT * FROM afk_status WHERE guild_id = ? AND user_id = ?').get(guildId, userId) as AfkRow | undefined) ?? null;
}

/** Format elapsed time since AFK was set. */
export function elapsed(setAt: number): string {
  const s = Math.floor(Date.now() / 1000) - setAt;
  if (s < 60)   return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d`;
}
