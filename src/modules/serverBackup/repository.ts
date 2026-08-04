/**
 * SERVER-BACKUP — repository.
 *
 * Snapshot metadata for the LIVE Discord structure (roles/channels/bans) —
 * deliberately its own table (`server_backup_snapshots`), never mixed with
 * the bot-state snapshots table (`snapshots`) that /backup uses. Same
 * versioned-file-on-disk pattern (JSON never overwritten), separate
 * directory (`server-backups/`) so the two systems can't collide on
 * filenames or get confused for one another.
 */

import db, { getGuild } from '../../database/db';

db.exec(`
  CREATE TABLE IF NOT EXISTS server_backup_snapshots (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id    TEXT NOT NULL,
    version     TEXT NOT NULL,
    file_path   TEXT NOT NULL,
    roles       INTEGER NOT NULL DEFAULT 0,
    channels    INTEGER NOT NULL DEFAULT 0,
    bans        INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE (guild_id, version)
  );
  CREATE INDEX IF NOT EXISTS idx_server_backup_snapshots_guild ON server_backup_snapshots(guild_id);
`);

export interface ServerSnapshotRow {
  id: number; guild_id: string; version: string; file_path: string;
  roles: number; channels: number; bans: number; created_at: number;
}

export function recordSnapshot(d: Omit<ServerSnapshotRow, 'id' | 'created_at'>): ServerSnapshotRow {
  db.prepare(
    'INSERT INTO server_backup_snapshots (guild_id, version, file_path, roles, channels, bans) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(d.guild_id, d.version, d.file_path, d.roles, d.channels, d.bans);
  return getByVersion(d.guild_id, d.version)!;
}

export function listForGuild(guildId: string): ServerSnapshotRow[] {
  return db.prepare('SELECT * FROM server_backup_snapshots WHERE guild_id = ? ORDER BY created_at DESC').all(guildId) as ServerSnapshotRow[];
}

export function getByVersion(guildId: string, version: string): ServerSnapshotRow | null {
  return (db.prepare('SELECT * FROM server_backup_snapshots WHERE guild_id = ? AND version = ?').get(guildId, version) as ServerSnapshotRow | undefined) ?? null;
}

export function deleteByVersion(guildId: string, version: string): void {
  db.prepare('DELETE FROM server_backup_snapshots WHERE guild_id = ? AND version = ?').run(guildId, version);
}

function nextVersion(guildId: string): string {
  const existing = listForGuild(guildId);
  if (existing.length === 0) return 'srv-1';
  const re = /^srv-(\d+)$/;
  const max = existing.reduce((acc, s) => {
    const m = re.exec(s.version);
    if (!m) return acc;
    const n = parseInt(m[1], 10);
    return n > acc ? n : acc;
  }, 0);
  return `srv-${max + 1}`;
}
export { nextVersion };

// ── Auto server-backup config ────────────────────────────────────────────────

export interface AutoServerBackupConfig {
  enabled: boolean;
  intervalMinutes: number;
  delivery: 'channel' | 'dm';
  channel: string | null;
  recipient: string | null;
  lastRunTs: number | null;
}

export function getAutoServerBackupConfig(guildId: string): AutoServerBackupConfig {
  const g = getGuild(guildId) as {
    server_backup_auto_enabled: number;
    server_backup_auto_interval_minutes: number | null;
    server_backup_auto_delivery: string | null;
    server_backup_auto_channel: string | null;
    server_backup_auto_recipient: string | null;
    server_backup_auto_last_run_ts: number | null;
  };
  return {
    enabled:         !!g.server_backup_auto_enabled,
    intervalMinutes: g.server_backup_auto_interval_minutes ?? 10080,
    delivery:        (g.server_backup_auto_delivery ?? 'channel') as 'channel' | 'dm',
    channel:         g.server_backup_auto_channel ?? null,
    recipient:       g.server_backup_auto_recipient ?? null,
    lastRunTs:       g.server_backup_auto_last_run_ts ?? null,
  };
}

export function setAutoServerBackupLastRunTs(guildId: string, unixSeconds: number): void {
  db.prepare('UPDATE guilds SET server_backup_auto_last_run_ts = ? WHERE id = ?').run(unixSeconds, guildId);
}

export function getAutoServerBackupGuildIds(): string[] {
  const rows = db.prepare('SELECT id FROM guilds WHERE server_backup_auto_enabled = 1').all() as Array<{ id: string }>;
  return rows.map(r => r.id);
}
