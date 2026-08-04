/**
 * TICKET PANEL — Database Layer
 * One table for panels, one for the categories (options) within them.
 */

import db from '../database/db';

db.exec(`
  CREATE TABLE IF NOT EXISTS panel_v2 (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id    TEXT NOT NULL,
    title       TEXT NOT NULL,
    description TEXT,
    color       TEXT DEFAULT '#5865f2',
    mode        TEXT DEFAULT 'button',
    image       TEXT,
    thumbnail   TEXT,
    footer      TEXT,
    content     TEXT,
    channel_id  TEXT,
    message_id  TEXT,
    created_at  INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS panel_v2_cat (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    panel_id        INTEGER NOT NULL,
    guild_id        TEXT NOT NULL,
    label           TEXT NOT NULL,
    emoji           TEXT,
    color           TEXT DEFAULT 'primary',
    category_id     TEXT NOT NULL,
    support_role_id TEXT,
    welcome_message TEXT,
    position        INTEGER DEFAULT 0,
    FOREIGN KEY (panel_id) REFERENCES panel_v2(id) ON DELETE CASCADE
  );
`);

// Safe migrations for installs that already have the old schema
const _m = (sql: string) => { try { db.prepare(sql).run(); } catch {} };
_m('ALTER TABLE panel_v2 ADD COLUMN image     TEXT');
_m('ALTER TABLE panel_v2 ADD COLUMN thumbnail TEXT');
_m('ALTER TABLE panel_v2 ADD COLUMN footer    TEXT');
_m('ALTER TABLE panel_v2 ADD COLUMN content   TEXT');

// ── Types ────────────────────────────────────────────────────────────────────

export interface Panel {
  id:          number;
  guild_id:    string;
  title:       string;
  description: string | null;
  color:       string;
  mode:        'button' | 'dropdown';
  channel_id:  string | null;
  message_id:  string | null;
}

export interface Category {
  id:              number;
  panel_id:        number;
  guild_id:        string;
  label:           string;
  emoji:           string | null;
  color:           'primary' | 'secondary' | 'success' | 'danger';
  category_id:     string;
  support_role_id: string | null;
  welcome_message: string | null;
  position:        number;
}

// ── Panel CRUD ───────────────────────────────────────────────────────────────

export function createPanel(data: Omit<Panel, 'id' | 'channel_id' | 'message_id'>): Panel {
  const r = db.prepare(`
    INSERT INTO panel_v2 (guild_id, title, description, color, mode)
    VALUES (?, ?, ?, ?, ?)
  `).run(data.guild_id, data.title, data.description, data.color, data.mode);
  return getPanel(r.lastInsertRowid as number)!;
}

export function getPanel(id: number): Panel | null {
  return db.prepare('SELECT * FROM panel_v2 WHERE id = ?').get(id) as Panel | null;
}

export function listPanels(guildId: string): Panel[] {
  return db.prepare('SELECT * FROM panel_v2 WHERE guild_id = ? ORDER BY id').all(guildId) as Panel[];
}

export function deletePanel(id: number): void {
  db.prepare('DELETE FROM panel_v2 WHERE id = ?').run(id);
}

export function setPanelMessage(id: number, channelId: string, messageId: string): void {
  db.prepare('UPDATE panel_v2 SET channel_id = ?, message_id = ? WHERE id = ?')
    .run(channelId, messageId, id);
}

// ── Category CRUD ────────────────────────────────────────────────────────────

export function addCategory(data: Omit<Category, 'id' | 'position'>): Category {
  const pos = (db.prepare('SELECT COUNT(*) as c FROM panel_v2_cat WHERE panel_id = ?')
    .get(data.panel_id) as any).c;
  const r = db.prepare(`
    INSERT INTO panel_v2_cat
      (panel_id, guild_id, label, emoji, color, category_id, support_role_id, welcome_message, position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(data.panel_id, data.guild_id, data.label, data.emoji, data.color,
         data.category_id, data.support_role_id, data.welcome_message, pos);
  return getCategory(r.lastInsertRowid as number)!;
}

export function getCategory(id: number): Category | null {
  return db.prepare('SELECT * FROM panel_v2_cat WHERE id = ?').get(id) as Category | null;
}

export function listCategories(panelId: number): Category[] {
  return db.prepare('SELECT * FROM panel_v2_cat WHERE panel_id = ? ORDER BY position').all(panelId) as Category[];
}

export function deleteCategory(id: number): void {
  db.prepare('DELETE FROM panel_v2_cat WHERE id = ?').run(id);
}
