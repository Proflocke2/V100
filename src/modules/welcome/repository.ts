/**
 * WELCOME — repository.
 *
 * Extends the existing `guilds` row with a dedicated `welcome_settings` table.
 * Added: card_image_url (custom banner image overlaid on the card, like Welcomer bot)
 */

import db from '../../database/db';

db.exec(`
  CREATE TABLE IF NOT EXISTS welcome_settings (
    guild_id              TEXT PRIMARY KEY,
    enabled               INTEGER DEFAULT 1,
    channel_id            TEXT,
    message               TEXT,
    color                 TEXT DEFAULT '#5865f2',
    use_card              INTEGER DEFAULT 1,
    background_url        TEXT,
    card_image_url        TEXT,

    dm_enabled            INTEGER DEFAULT 0,
    dm_message            TEXT,

    leave_enabled         INTEGER DEFAULT 0,
    leave_channel_id      TEXT,
    leave_message         TEXT,
    leave_color           TEXT DEFAULT '#ed4245',

    autorole_id           TEXT,
    autorole_delay_id     TEXT,
    autorole_delay_min    INTEGER DEFAULT 0,
    autorole_after_verify TEXT,

    alt_enabled           INTEGER DEFAULT 0,
    alt_min_age_days      INTEGER DEFAULT 7,
    alt_log_channel_id    TEXT,
    alt_action            TEXT DEFAULT 'log'
  );
`);

// Migration: add card_image_url if it doesn't exist yet
try {
  db.exec(`ALTER TABLE welcome_settings ADD COLUMN card_image_url TEXT`);
} catch { /* column already exists */ }

// Migration: add avatar_bg_enabled
try {
  db.exec(`ALTER TABLE welcome_settings ADD COLUMN avatar_bg_enabled INTEGER DEFAULT 0`);
} catch { /* column already exists */ }

export interface WelcomeSettings {
  guild_id: string;
  enabled: number;
  channel_id: string | null;
  message: string | null;
  color: string;
  use_card: number;
  background_url: string | null;
  card_image_url: string | null;
  /** When 1: member's avatar is used as the full-card background */
  avatar_bg_enabled: number;

  dm_enabled: number;
  dm_message: string | null;

  leave_enabled: number;
  leave_channel_id: string | null;
  leave_message: string | null;
  leave_color: string;

  autorole_id: string | null;
  autorole_delay_id: string | null;
  autorole_delay_min: number;
  autorole_after_verify: string | null;

  alt_enabled: number;
  alt_min_age_days: number;
  alt_log_channel_id: string | null;
  /** 'log' | 'kick' */
  alt_action: 'log' | 'kick';
}

export function getSettings(guildId: string): WelcomeSettings {
  let row = db.prepare('SELECT * FROM welcome_settings WHERE guild_id = ?').get(guildId) as WelcomeSettings | undefined;
  if (!row) {
    db.prepare('INSERT INTO welcome_settings (guild_id) VALUES (?)').run(guildId);
    row = db.prepare('SELECT * FROM welcome_settings WHERE guild_id = ?').get(guildId) as WelcomeSettings;
  }
  return row;
}

const WELCOME_ALLOWED_KEYS = new Set<string>(['enabled','channel_id','message','color','use_card','background_url','card_image_url','avatar_bg_enabled','dm_enabled','dm_message','leave_enabled','leave_channel_id','leave_message','leave_color','autorole_id','autorole_delay_id','autorole_delay_min','autorole_after_verify','alt_enabled','alt_min_age_days','alt_log_channel_id','alt_action']);

export function updateSettings(guildId: string, patch: Partial<WelcomeSettings>): void {
  getSettings(guildId);
  const keys = Object.keys(patch).filter(k => k !== 'guild_id' && WELCOME_ALLOWED_KEYS.has(k)) as (keyof WelcomeSettings)[];
  if (keys.length === 0) return;
  const sets = keys.map(k => `${k} = ?`).join(', ');
  const vals = keys.map(k => patch[k] ?? null);
  db.prepare(`UPDATE welcome_settings SET ${sets} WHERE guild_id = ?`).run(...vals, guildId);
}

export interface PendingRole { id: number; guild_id: string; user_id: string; role_id: string; assign_at: number; }

db.exec(`
  CREATE TABLE IF NOT EXISTS welcome_pending_roles (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id  TEXT NOT NULL,
    user_id   TEXT NOT NULL,
    role_id   TEXT NOT NULL,
    assign_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_welcome_pending_due ON welcome_pending_roles(assign_at);
`);

export function schedulePendingRole(guildId: string, userId: string, roleId: string, assignAt: number): void {
  db.prepare('INSERT INTO welcome_pending_roles (guild_id, user_id, role_id, assign_at) VALUES (?, ?, ?, ?)')
    .run(guildId, userId, roleId, assignAt);
}

export function listDuePendingRoles(now: number): PendingRole[] {
  return db.prepare('SELECT * FROM welcome_pending_roles WHERE assign_at <= ?').all(now) as PendingRole[];
}

export function deletePendingRole(id: number): void {
  db.prepare('DELETE FROM welcome_pending_roles WHERE id = ?').run(id);
}
