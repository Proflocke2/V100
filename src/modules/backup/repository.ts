/**
 * BACKUP — repository.
 *
 * Tracks two things in the DB:
 *   1. snapshots — metadata for each saved snapshot (the JSON itself lives on disk)
 *   2. schema_migrations — applied DB schema versions (forward-only)
 */

import db, { getGuild } from '../../database/db';

db.exec(`
  CREATE TABLE IF NOT EXISTS snapshots (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id    TEXT NOT NULL,
    version     TEXT NOT NULL,
    file_path   TEXT NOT NULL,
    rows        INTEGER NOT NULL DEFAULT 0,
    tables      INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE (guild_id, version)
  );
  CREATE INDEX IF NOT EXISTS idx_snapshots_guild ON snapshots(guild_id);

  CREATE TABLE IF NOT EXISTS schema_migrations (
    version    TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

export interface SnapshotRow {
  id: number; guild_id: string; version: string;
  file_path: string; rows: number; tables: number; created_at: number;
}

export function recordSnapshot(d: Omit<SnapshotRow, 'id' | 'created_at'>): SnapshotRow {
  db.prepare('INSERT INTO snapshots (guild_id, version, file_path, rows, tables) VALUES (?, ?, ?, ?, ?)')
    .run(d.guild_id, d.version, d.file_path, d.rows, d.tables);
  return getByVersion(d.guild_id, d.version)!;
}

export function listForGuild(guildId: string): SnapshotRow[] {
  return db.prepare('SELECT * FROM snapshots WHERE guild_id = ? ORDER BY created_at DESC').all(guildId) as SnapshotRow[];
}

export function getByVersion(guildId: string, version: string): SnapshotRow | null {
  return db.prepare('SELECT * FROM snapshots WHERE guild_id = ? AND version = ?').get(guildId, version) as SnapshotRow | null;
}

export function deleteByVersion(guildId: string, version: string): void {
  db.prepare('DELETE FROM snapshots WHERE guild_id = ? AND version = ?').run(guildId, version);
}

// ── Migrations ───────────────────────────────────────────────────────────────
export function isMigrationApplied(version: string): boolean {
  return !!db.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get(version);
}
export function markMigrationApplied(version: string): void {
  db.prepare('INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)').run(version);
}
export function listAppliedMigrations(): string[] {
  const rows = db.prepare('SELECT version FROM schema_migrations ORDER BY applied_at').all() as { version: string }[];
  return rows.map(r => r.version);
}

// ── Auto-Backup config ───────────────────────────────────────────────────────

export interface AutoBackupConfig {
  enabled: boolean;
  /** Interval in minutes — replaces the old 'daily'|'weekly' enum so any cadence (e.g. every 15 min) is possible. Minimum enforced at 15 by the command. */
  intervalMinutes: number;
  delivery: 'channel' | 'dm';
  channel: string | null;
  recipient: string | null;
  /** Unix seconds of the last successful run — elapsed-time based, not a calendar-day/week key, so sub-day intervals actually work. */
  lastRunTs: number | null;
}

export function getAutoBackupConfig(guildId: string): AutoBackupConfig {
  const g = getGuild(guildId) as {
    backup_auto_enabled: number; backup_auto_interval: string | null;
    backup_auto_delivery: string | null; backup_auto_channel: string | null;
    backup_auto_recipient: string | null;
    backup_auto_interval_minutes: number | null; backup_auto_last_run_ts: number | null;
  };

  // One-time smooth fallback for guilds configured before minute-granularity
  // existed: if the new column is still at its default AND the old
  // 'daily'/'weekly' string was explicitly 'daily', honor that as 1440min
  // instead of silently switching everyone from daily to the 10080 (weekly)
  // default the very first time this runs post-upgrade.
  let intervalMinutes = g.backup_auto_interval_minutes ?? 10080;
  if (intervalMinutes === 10080 && g.backup_auto_interval === 'daily') intervalMinutes = 1440;

  return {
    enabled:         !!g.backup_auto_enabled,
    intervalMinutes,
    delivery:        (g.backup_auto_delivery ?? 'channel') as 'channel' | 'dm',
    channel:         g.backup_auto_channel ?? null,
    recipient:       g.backup_auto_recipient ?? null,
    lastRunTs:       g.backup_auto_last_run_ts ?? null,
  };
}

/** Internal scheduler bookkeeping only — never exposed through a command directly. */
export function setAutoBackupLastRunTs(guildId: string, unixSeconds: number): void {
  db.prepare('UPDATE guilds SET backup_auto_last_run_ts = ? WHERE id = ?').run(unixSeconds, guildId);
}

/** Every guild with auto-backup switched on — the scheduler only needs to look at these. */
export function getAutoBackupGuildIds(): string[] {
  const rows = db.prepare('SELECT id FROM guilds WHERE backup_auto_enabled = 1').all() as Array<{ id: string }>;
  return rows.map(r => r.id);
}
