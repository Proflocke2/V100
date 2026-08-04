/**
 * STATS DATABASE LAYER
 * Persistence for stat channel configurations via the existing SQLite instance.
 */

import db from '../database/db';
import { StatsConfig, StatChannel } from './StatsTypes';

// ── Tabelle initialisieren ──────────────────────────────────────────────────

export function initStatsTables(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS stats_channels (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id   TEXT    NOT NULL,
      channel_id TEXT    NOT NULL UNIQUE,
      type       TEXT    NOT NULL,
      template   TEXT    NOT NULL,
      role_id    TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_stats_guild
      ON stats_channels(guild_id);
  `);
  console.log('[Stats] Database tables initialized');
}

// ── CRUD ────────────────────────────────────────────────────────────────────

/** Load all stat channels for a guild */
export function getStatsConfig(guildId: string): StatsConfig {
  const rows = db
    .prepare('SELECT * FROM stats_channels WHERE guild_id = ? ORDER BY id ASC')
    .all(guildId) as any[];

  return {
    guildId,
    channels: rows.map(r => ({
      channelId: r.channel_id,
      type:      r.type,
      template:  r.template,
      roleId:    r.role_id ?? undefined,
    })),
    updatedAt: 0,
  };
}

/** Save a single stat channel */
export function upsertStatChannel(
  guildId: string,
  channelId: string,
  type: string,
  template: string,
  roleId?: string,
): void {
  db.prepare(`
    INSERT INTO stats_channels (guild_id, channel_id, type, template, role_id)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(channel_id) DO UPDATE SET
      type     = excluded.type,
      template = excluded.template,
      role_id  = excluded.role_id
  `).run(guildId, channelId, type, template, roleId ?? null);
}

/** Remove a single stat channel */
export function removeStatChannel(channelId: string): boolean {
  const res = db
    .prepare('DELETE FROM stats_channels WHERE channel_id = ?')
    .run(channelId);
  return res.changes > 0;
}

/** Delete all stat channels for a guild */
export function removeAllStatChannels(guildId: string): number {
  const res = db
    .prepare('DELETE FROM stats_channels WHERE guild_id = ?')
    .run(guildId);
  return res.changes;
}

/** Fetch all configured guilds (for the ready event) */
export function getAllStatsGuildIds(): string[] {
  const rows = db
    .prepare('SELECT DISTINCT guild_id FROM stats_channels')
    .all() as any[];
  return rows.map(r => r.guild_id);
}
