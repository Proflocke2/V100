/**
 * TICKETS — repository layer.
 *
 * Owns ALL SQL for the ticket system.
 *
 * Tables:
 *   panel_v2            – panel meta (title, color, mode, image, thumbnail, footer, content)
 *   panel_v2_cat        – categories on a panel (label, button_text, emoji, role, …)
 *   panel_v2_form       – up to 5 form questions per panel
 *   panel_v2_multi      – aggregated panels (max 5)
 *   ticket_types        – reusable category templates
 *   ticket_settings     – per-guild config (incl. autoclose, support hours, survey, branding)
 *   tickets             – open/closed ticket records
 *   ticket_messages     – mirrored messages (transcripts)
 *   ticket_tags         – saved response snippets (unlimited per guild)
 *   ticket_activity     – event log for statistics
 *   ticket_surveys      – exit survey responses
 */

import db from '../../database/db';
import {
  PanelConfig, TicketCategory, ModalField, MultiPanelConfig,
  TicketRecord, TicketSystemSettings, TicketStatus,
  PanelMode, CategoryColor, FieldStyle, TranscriptFormat,
  TicketTag, TicketActivity, ActivityEvent, SurveyResponse,
} from './types';

// Re-export types so callers can import from one place
export type {
  PanelConfig as Panel,
  TicketCategory as Category,
  ModalField as FormQuestion,
  MultiPanelConfig as MultiPanel,
  TicketRecord,
  TicketSystemSettings as TicketSettings,
  TicketTag,
  TicketActivity,
  SurveyResponse,
};
export { TicketStatus, PanelMode, CategoryColor, FieldStyle, TranscriptFormat, ActivityEvent };

// ── Robust migration helper ───────────────────────────────────────────────────

const TICKET_REPO_ALLOWED_TABLES = new Set<string>(['panel_v2','panel_v2_cat','panel_v2_form','panel_v2_multi','ticket_settings','tickets','ticket_tags','ticket_types','ticket_activity','ticket_surveys']);
function hasColumn(table: string, column: string): boolean {
  if (!TICKET_REPO_ALLOWED_TABLES.has(table)) return false;
  const info = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return info.some(c => c.name === column);
}

function addColumnIfMissing(table: string, column: string, definition: string): void {
  if (!hasColumn(table, column)) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
    console.log(`[Tickets] Migration: added column "${column}" to "${table}"`);
  }
}

// ── Schema ────────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS panel_v2 (
    id          INTEGER PRIMARY KEY,
    guild_id    TEXT    NOT NULL,
    title       TEXT    NOT NULL,
    description TEXT,
    color       TEXT    DEFAULT '#5865f2',
    mode        TEXT    DEFAULT 'auto',
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
    guild_id        TEXT    NOT NULL,
    label           TEXT    NOT NULL,
    button_text     TEXT,
    emoji           TEXT,
    color           TEXT    DEFAULT 'primary',
    category_id     TEXT    NOT NULL,
    support_role_id TEXT,
    welcome_message TEXT,
    position        INTEGER DEFAULT 0,
    FOREIGN KEY (panel_id) REFERENCES panel_v2(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS panel_v2_form (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    panel_id    INTEGER NOT NULL,
    position    INTEGER NOT NULL,
    label       TEXT    NOT NULL,
    placeholder TEXT,
    style       TEXT    DEFAULT 'short',
    required    INTEGER DEFAULT 1,
    min_length  INTEGER DEFAULT 0,
    max_length  INTEGER DEFAULT 1000,
    FOREIGN KEY (panel_id) REFERENCES panel_v2(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS panel_v2_multi (
    id          INTEGER PRIMARY KEY,
    guild_id    TEXT    NOT NULL,
    name        TEXT    NOT NULL,
    title       TEXT    NOT NULL,
    description TEXT,
    color       TEXT    DEFAULT '#5865f2',
    image       TEXT,
    thumbnail   TEXT,
    footer      TEXT,
    content     TEXT,
    panel_ids   TEXT    NOT NULL DEFAULT '[]',
    mode        TEXT    NOT NULL DEFAULT 'dropdown',
    channel_id  TEXT,
    message_id  TEXT,
    created_at  INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS ticket_types (
    custom_id       TEXT NOT NULL,
    guild_id        TEXT NOT NULL,
    label           TEXT NOT NULL,
    emoji           TEXT,
    color           TEXT DEFAULT 'primary',
    category_id     TEXT NOT NULL,
    support_role_id TEXT,
    welcome_message TEXT,
    PRIMARY KEY (guild_id, custom_id)
  );

  CREATE TABLE IF NOT EXISTS ticket_settings (
    guild_id              TEXT    PRIMARY KEY,
    log_channel_id        TEXT,
    archive_channel_id    TEXT,
    transcript_format     TEXT    DEFAULT 'html',
    cooldown_seconds      INTEGER DEFAULT 60,
    max_open              INTEGER DEFAULT 3,
    name_pattern          TEXT    DEFAULT 'ticket-{category}-{username}-{id}',
    dm_on_close           INTEGER DEFAULT 1,
    remove_branding       INTEGER DEFAULT 0,
    autoclose_enabled     INTEGER DEFAULT 0,
    autoclose_hours       INTEGER DEFAULT 24,
    support_hours_enabled INTEGER DEFAULT 0,
    support_hours_start   TEXT,
    support_hours_end     TEXT,
    survey_enabled        INTEGER DEFAULT 0,
    admin_role_id           TEXT,   -- bypasses staff checks everywhere, same as Administrator perm
    fallback_staff_role_id  TEXT    -- used when a ticket's category has no support_role_id of its own
  );

  CREATE TABLE IF NOT EXISTS tickets (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id         TEXT    NOT NULL,
    channel_id       TEXT    NOT NULL UNIQUE,
    user_id          TEXT    NOT NULL,
    panel_id         INTEGER,
    category_id      INTEGER,
    number           INTEGER NOT NULL,
    status           TEXT    DEFAULT 'open',
    claimed_by       TEXT,
    close_reason     TEXT,
    last_activity_at INTEGER DEFAULT (unixepoch()),
    created_at       INTEGER DEFAULT (unixepoch()),
    closed_at        INTEGER,
    last_ticket_at   INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS ticket_messages (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL,
    user_id   TEXT    NOT NULL,
    username  TEXT    NOT NULL,
    content   TEXT    NOT NULL,
    timestamp INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (ticket_id) REFERENCES tickets(id)
  );

  CREATE TABLE IF NOT EXISTS ticket_tags (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id   TEXT    NOT NULL,
    name       TEXT    NOT NULL,
    content    TEXT    NOT NULL,
    created_by TEXT    NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    UNIQUE(guild_id, name)
  );

  CREATE TABLE IF NOT EXISTS ticket_activity (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id   TEXT    NOT NULL,
    ticket_id  INTEGER NOT NULL,
    user_id    TEXT    NOT NULL,
    event      TEXT    NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (ticket_id) REFERENCES tickets(id)
  );

  CREATE TABLE IF NOT EXISTS ticket_surveys (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id    INTEGER NOT NULL,
    guild_id     TEXT    NOT NULL,
    user_id      TEXT    NOT NULL,
    rating       INTEGER NOT NULL,
    feedback     TEXT,
    submitted_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (ticket_id) REFERENCES tickets(id)
  );

  CREATE INDEX IF NOT EXISTS idx_panel_v2_guild        ON panel_v2(guild_id);
  CREATE INDEX IF NOT EXISTS idx_panel_v2_cat_pid      ON panel_v2_cat(panel_id);
  CREATE INDEX IF NOT EXISTS idx_panel_v2_form_p       ON panel_v2_form(panel_id);
  CREATE INDEX IF NOT EXISTS idx_tickets_channel       ON tickets(channel_id);
  CREATE INDEX IF NOT EXISTS idx_tickets_guild_usr     ON tickets(guild_id, user_id, status);
  CREATE INDEX IF NOT EXISTS idx_tags_guild            ON ticket_tags(guild_id);
  CREATE INDEX IF NOT EXISTS idx_activity_guild        ON ticket_activity(guild_id);
  CREATE INDEX IF NOT EXISTS idx_activity_ticket       ON ticket_activity(ticket_id);
  CREATE INDEX IF NOT EXISTS idx_surveys_guild         ON ticket_surveys(guild_id);
`);

// ── Migrations (PRAGMA-based — never silently fails) ──────────────────────────

// panel_v2 optional columns
addColumnIfMissing('panel_v2', 'image',      'TEXT');
addColumnIfMissing('panel_v2', 'thumbnail',  'TEXT');
addColumnIfMissing('panel_v2', 'footer',     'TEXT');
addColumnIfMissing('panel_v2', 'content',    'TEXT');
addColumnIfMissing('panel_v2', 'channel_id', 'TEXT');
addColumnIfMissing('panel_v2', 'message_id', 'TEXT');

// panel_v2_cat optional columns
addColumnIfMissing('panel_v2_cat', 'emoji',           'TEXT');
addColumnIfMissing('panel_v2_cat', 'welcome_message', 'TEXT');
addColumnIfMissing('panel_v2_cat', 'button_text',     'TEXT');

// ticket_settings optional columns
addColumnIfMissing('ticket_settings', 'dm_on_close',           'INTEGER DEFAULT 1');
addColumnIfMissing('ticket_settings', 'remove_branding',       'INTEGER DEFAULT 0');
addColumnIfMissing('ticket_settings', 'archive_channel_id',    'TEXT');
addColumnIfMissing('ticket_settings', 'autoclose_enabled',     'INTEGER DEFAULT 0');
addColumnIfMissing('ticket_settings', 'autoclose_hours',       'INTEGER DEFAULT 24');
addColumnIfMissing('ticket_settings', 'support_hours_enabled', 'INTEGER DEFAULT 0');
addColumnIfMissing('ticket_settings', 'support_hours_start',   'TEXT');
addColumnIfMissing('ticket_settings', 'support_hours_end',     'TEXT');
addColumnIfMissing('ticket_settings', 'survey_enabled',        'INTEGER DEFAULT 0');
addColumnIfMissing('ticket_settings', 'admin_role_id',          'TEXT');
addColumnIfMissing('ticket_settings', 'fallback_staff_role_id', 'TEXT');

// One-time upgrade: guilds that never customized name_pattern (still holding
// the exact old factory default) get switched to the new category-aware
// default. Anyone who already set their own pattern is left untouched —
// this only touches rows provably still at the untouched old default.
try {
  db.prepare("UPDATE ticket_settings SET name_pattern = 'ticket-{category}-{username}-{id}' WHERE name_pattern = 'ticket-{username}-{id}'").run();
} catch {}

// tickets optional columns
addColumnIfMissing('tickets', 'close_reason',     'TEXT');
addColumnIfMissing('tickets', 'category_id',      'INTEGER');
addColumnIfMissing('tickets', 'last_activity_at', 'INTEGER DEFAULT (unixepoch())');

// panel_v2_multi optional columns (added in v2.1)
addColumnIfMissing('panel_v2_multi', 'image',     'TEXT');
addColumnIfMissing('panel_v2_multi', 'thumbnail', 'TEXT');
addColumnIfMissing('panel_v2_multi', 'footer',    'TEXT');
addColumnIfMissing('panel_v2_multi', 'content',   'TEXT');
addColumnIfMissing('panel_v2_multi', 'mode',      "TEXT NOT NULL DEFAULT 'dropdown'");

// Index on last_activity_at — must be created AFTER the column is guaranteed to exist
db.exec(`CREATE INDEX IF NOT EXISTS idx_tickets_activity_at ON tickets(last_activity_at, status);`);

// ── Panel CRUD ────────────────────────────────────────────────────────────────

export function createPanel(d: {
  guild_id: string; title: string; description: string | null;
  color: string; mode: PanelMode;
  image?: string | null; thumbnail?: string | null;
  footer?: string | null; content?: string | null;
}): PanelConfig {
  const nextId = ((db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS next FROM panel_v2').get() as any).next) as number;
  db.prepare(`
    INSERT INTO panel_v2 (id, guild_id, title, description, color, mode, image, thumbnail, footer, content)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    nextId, d.guild_id, d.title, d.description, d.color, d.mode,
    d.image ?? null, d.thumbnail ?? null, d.footer ?? null, d.content ?? null,
  );
  return getPanel(nextId)!;
}

export function getPanel(id: number): PanelConfig | null {
  return db.prepare('SELECT * FROM panel_v2 WHERE id = ?').get(id) as PanelConfig | null;
}

export function listPanels(guildId: string): PanelConfig[] {
  return db.prepare('SELECT * FROM panel_v2 WHERE guild_id = ? ORDER BY id').all(guildId) as PanelConfig[];
}

export function updatePanel(
  id: number,
  patch: Partial<Pick<PanelConfig, 'title' | 'description' | 'color' | 'mode' | 'image' | 'thumbnail' | 'footer' | 'content'>>,
): PanelConfig | null {
  const allowed: (keyof typeof patch)[] = ['title', 'description', 'color', 'mode', 'image', 'thumbnail', 'footer', 'content'];
  const keys = allowed.filter(k => k in patch);
  if (keys.length === 0) return getPanel(id);
  const sets = keys.map(k => `${k} = ?`).join(', ');
  const vals = keys.map(k => (patch as any)[k] ?? null);
  db.prepare(`UPDATE panel_v2 SET ${sets} WHERE id = ?`).run(...vals, id);
  return getPanel(id);
}

export function updatePanelMessage(id: number, channelId: string | null, messageId: string | null): void {
  db.prepare('UPDATE panel_v2 SET channel_id = ?, message_id = ? WHERE id = ?').run(channelId, messageId, id);
}

export function deletePanel(id: number): void {
  db.prepare('DELETE FROM panel_v2 WHERE id = ?').run(id);
}

// ── Category CRUD ─────────────────────────────────────────────────────────────

export function addCategory(d: {
  panel_id: number; guild_id: string; label: string;
  button_text?: string | null; emoji?: string | null;
  color: CategoryColor; category_id: string;
  support_role_id: string | null; welcome_message?: string | null;
}): TicketCategory {
  const pos = (db.prepare('SELECT COUNT(*) c FROM panel_v2_cat WHERE panel_id = ?')
    .get(d.panel_id) as { c: number }).c;

  const r = db.prepare(`
    INSERT INTO panel_v2_cat
      (panel_id, guild_id, label, button_text, emoji, color, category_id, support_role_id, welcome_message, position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    d.panel_id, d.guild_id, d.label, d.button_text ?? null,
    d.emoji ?? null, d.color, d.category_id,
    d.support_role_id, d.welcome_message ?? null, pos,
  );
  return getCategory(r.lastInsertRowid as number)!;
}

export function getCategory(id: number): TicketCategory | null {
  return db.prepare('SELECT * FROM panel_v2_cat WHERE id = ?').get(id) as TicketCategory | null;
}

export function listCategories(panelId: number): TicketCategory[] {
  return db.prepare('SELECT * FROM panel_v2_cat WHERE panel_id = ? ORDER BY position, id')
    .all(panelId) as TicketCategory[];
}

export function updateCategory(id: number, patch: Partial<Pick<TicketCategory, 'welcome_message' | 'label' | 'button_text' | 'emoji' | 'color' | 'support_role_id' | 'category_id'>>): void {
  // SECURITY FIX: explicit allowlist prevents SQL injection via Object.keys()
  const ALLOWED: ReadonlySet<string> = new Set(['welcome_message', 'label', 'button_text', 'emoji', 'color', 'support_role_id', 'category_id']);
  const keys = Object.keys(patch).filter(k => ALLOWED.has(k) && (patch as any)[k] !== undefined);
  if (!keys.length) return;
  const sets = keys.map(k => `${k} = ?`).join(', ');
  const vals = keys.map(k => (patch as any)[k] ?? null);
  db.prepare(`UPDATE panel_v2_cat SET ${sets} WHERE id = ?`).run(...vals, id);
}

export function deleteCategory(id: number): void {
  db.prepare('DELETE FROM panel_v2_cat WHERE id = ?').run(id);
}

// ── Form CRUD ─────────────────────────────────────────────────────────────────

export function addFormQuestion(d: Omit<ModalField, 'id' | 'position'>): ModalField {
  const pos = (db.prepare('SELECT COUNT(*) c FROM panel_v2_form WHERE panel_id = ?')
    .get(d.panel_id) as { c: number }).c;
  const r = db.prepare(`
    INSERT INTO panel_v2_form (panel_id, position, label, placeholder, style, required, min_length, max_length)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(d.panel_id, pos, d.label, d.placeholder, d.style, d.required ? 1 : 0, d.min_length, d.max_length);
  return db.prepare('SELECT * FROM panel_v2_form WHERE id = ?').get(r.lastInsertRowid) as ModalField;
}

export function listFormQuestions(panelId: number): ModalField[] {
  return db.prepare('SELECT * FROM panel_v2_form WHERE panel_id = ? ORDER BY position, id')
    .all(panelId) as ModalField[];
}

export function clearFormQuestions(panelId: number): void {
  db.prepare('DELETE FROM panel_v2_form WHERE panel_id = ?').run(panelId);
}

// ── Per-category form questions ────────────────────────────────────────────────
// Migration: add category_id column to panel_v2_form
addColumnIfMissing('panel_v2_form', 'category_id', 'INTEGER');

// Create a separate index for category-level lookups
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_panel_v2_form_cat ON panel_v2_form(category_id);
`);

/**
 * Add a form question scoped to a specific category (overrides panel-level questions).
 * category_id = null → panel-level question (existing behaviour).
 */
export function addCategoryFormQuestion(
  d: Omit<ModalField, 'id' | 'position'> & { category_id: number },
): ModalField {
  const pos = (db.prepare('SELECT COUNT(*) c FROM panel_v2_form WHERE category_id = ?')
    .get(d.category_id) as { c: number }).c;
  const r = db.prepare(`
    INSERT INTO panel_v2_form (panel_id, category_id, position, label, placeholder, style, required, min_length, max_length)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(d.panel_id, d.category_id, pos, d.label, d.placeholder ?? null, d.style, d.required ? 1 : 0, d.min_length, d.max_length);
  return db.prepare('SELECT * FROM panel_v2_form WHERE id = ?').get(r.lastInsertRowid) as ModalField;
}

export function listCategoryFormQuestions(categoryId: number): ModalField[] {
  return db.prepare('SELECT * FROM panel_v2_form WHERE category_id = ? ORDER BY position, id')
    .all(categoryId) as ModalField[];
}

export function clearCategoryFormQuestions(categoryId: number): void {
  db.prepare('DELETE FROM panel_v2_form WHERE category_id = ?').run(categoryId);
}

/**
 * Returns the questions to show for a given category.
 * Priority: category-level questions → panel-level questions → empty (default single-question modal)
 */
export function resolveFormQuestions(panelId: number, categoryId: number): ModalField[] {
  const catQs = listCategoryFormQuestions(categoryId);
  if (catQs.length > 0) return catQs;
  return listFormQuestions(panelId);
}

// ── Multi-Panel CRUD ──────────────────────────────────────────────────────────

export function createMultiPanel(d: {
  guild_id: string; name: string; title: string;
  description: string | null; color: string;
  image?: string | null; thumbnail?: string | null;
  footer?: string | null; content?: string | null;
}): MultiPanelConfig {
  const nextId = ((db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS next FROM panel_v2_multi').get() as any).next) as number;
  db.prepare(`
    INSERT INTO panel_v2_multi (id, guild_id, name, title, description, color, image, thumbnail, footer, content, panel_ids)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]')
  `).run(nextId, d.guild_id, d.name, d.title, d.description, d.color,
         d.image ?? null, d.thumbnail ?? null, d.footer ?? null, d.content ?? null);
  return getMultiPanel(nextId)!;
}

export function updateMultiPanel(
  id: number,
  patch: Partial<Pick<MultiPanelConfig, 'title' | 'description' | 'color' | 'image' | 'thumbnail' | 'footer' | 'content' | 'name' | 'mode'>>,
): MultiPanelConfig | null {
  const allowed: (keyof typeof patch)[] = ['title', 'description', 'color', 'image', 'thumbnail', 'footer', 'content', 'name', 'mode'];
  const keys = allowed.filter(k => k in patch);
  if (keys.length === 0) return getMultiPanel(id);
  const sets = keys.map(k => `${k} = ?`).join(', ');
  const vals = keys.map(k => (patch as any)[k] ?? null);
  db.prepare(`UPDATE panel_v2_multi SET ${sets} WHERE id = ?`).run(...vals, id);
  return getMultiPanel(id);
}

export function getMultiPanel(id: number): MultiPanelConfig | null {
  return db.prepare('SELECT * FROM panel_v2_multi WHERE id = ?').get(id) as MultiPanelConfig | null;
}

export function listMultiPanels(guildId: string): MultiPanelConfig[] {
  return db.prepare('SELECT * FROM panel_v2_multi WHERE guild_id = ? ORDER BY id')
    .all(guildId) as MultiPanelConfig[];
}

export function updateMultiPanelPanels(id: number, panelIds: number[]): void {
  db.prepare('UPDATE panel_v2_multi SET panel_ids = ? WHERE id = ?').run(JSON.stringify(panelIds), id);
}

export function updateMultiPanelMessage(id: number, channelId: string | null, messageId: string | null): void {
  db.prepare('UPDATE panel_v2_multi SET channel_id = ?, message_id = ? WHERE id = ?')
    .run(channelId, messageId, id);
}

export function deleteMultiPanel(id: number): void {
  db.prepare('DELETE FROM panel_v2_multi WHERE id = ?').run(id);
}

// ── Settings ──────────────────────────────────────────────────────────────────

function coerceSettings(row: any): TicketSystemSettings {
  return {
    ...row,
    dm_on_close:           Boolean(row.dm_on_close),
    remove_branding:       Boolean(row.remove_branding),
    autoclose_enabled:     Boolean(row.autoclose_enabled),
    support_hours_enabled: Boolean(row.support_hours_enabled),
    survey_enabled:        Boolean(row.survey_enabled),
  };
}

export function getSettings(guildId: string): TicketSystemSettings {
  let row = db.prepare('SELECT * FROM ticket_settings WHERE guild_id = ?').get(guildId) as any;
  if (!row) {
    db.prepare('INSERT INTO ticket_settings (guild_id) VALUES (?)').run(guildId);
    row = db.prepare('SELECT * FROM ticket_settings WHERE guild_id = ?').get(guildId);
  }
  return coerceSettings(row);
}

export function updateSettings(guildId: string, patch: Partial<TicketSystemSettings>): void {
  getSettings(guildId);
  // SECURITY FIX: explicit allowlist prevents SQL injection via Object.keys()
  //
  // BUG FIX: this list previously used names that don't match any real
  // column ('support_role_id', 'category_id', 'max_open_per_user',
  // 'naming_pattern') while missing real ones ('archive_channel_id',
  // 'max_open', 'name_pattern') — every wizard save of those three settings
  // was silently discarded. Rebuilt directly from the ticket_settings
  // schema / TicketSystemSettings interface so nothing can drift again.
  const ALLOWED: ReadonlySet<string> = new Set([
    'log_channel_id', 'archive_channel_id', 'transcript_format',
    'cooldown_seconds', 'max_open', 'name_pattern',
    'dm_on_close', 'remove_branding',
    'autoclose_enabled', 'autoclose_hours',
    'support_hours_enabled', 'support_hours_start', 'support_hours_end',
    'survey_enabled', 'admin_role_id', 'fallback_staff_role_id',
  ]);
  const keys = (Object.keys(patch) as (keyof TicketSystemSettings)[])
    .filter(k => k !== 'guild_id' && ALLOWED.has(k));
  if (keys.length === 0) return;
  const sets = keys.map(k => `${k} = ?`).join(', ');
  const vals = keys.map(k => {
    const v = (patch as any)[k];
    return typeof v === 'boolean' ? (v ? 1 : 0) : (v ?? null);
  });
  db.prepare(`UPDATE ticket_settings SET ${sets} WHERE guild_id = ?`).run(...vals, guildId);
}

// ── Ticket lifecycle ──────────────────────────────────────────────────────────

export function nextTicketNumber(guildId: string): number {
  const row = db.prepare('SELECT MAX(number) m FROM tickets WHERE guild_id = ?')
    .get(guildId) as { m: number | null };
  return (row.m ?? 0) + 1;
}

/**
 * FIX: Atomic ticket insert.
 * nextTicketNumber() + INSERT are now wrapped in a transaction so that two
 * concurrent ticket creates in the same guild cannot race and produce the
 * same ticket number. SQLite serialises writes, so the transaction guarantees
 * the MAX(number) read and the INSERT see the same state.
 */
export function insertTicket(d: {
  guild_id: string; channel_id: string; user_id: string;
  panel_id: number | null; category_id: number | null; number: number;
}): TicketRecord {
  const doInsert = db.transaction(() => {
    // Re-derive the ticket number inside the transaction for true atomicity.
    const row = db.prepare('SELECT MAX(number) m FROM tickets WHERE guild_id = ?')
      .get(d.guild_id) as { m: number | null };
    const atomicNum = (row.m ?? 0) + 1;

    db.prepare(`
      INSERT INTO tickets (guild_id, channel_id, user_id, panel_id, category_id, number, status, last_activity_at)
      VALUES (?, ?, ?, ?, ?, ?, 'open', unixepoch())
    `).run(d.guild_id, d.channel_id, d.user_id, d.panel_id, d.category_id, atomicNum);

    return db.prepare('SELECT * FROM tickets WHERE channel_id = ?').get(d.channel_id) as TicketRecord;
  });
  return doInsert();
}

export function getTicketByChannel(channelId: string): TicketRecord | null {
  return db.prepare('SELECT * FROM tickets WHERE channel_id = ?').get(channelId) as TicketRecord | null;
}

export function getTicket(id: number): TicketRecord | null {
  return db.prepare('SELECT * FROM tickets WHERE id = ?').get(id) as TicketRecord | null;
}

export function countOpenTickets(guildId: string, userId: string): number {
  return (db.prepare(
    `SELECT COUNT(*) c FROM tickets WHERE guild_id = ? AND user_id = ? AND status = 'open'`,
  ).get(guildId, userId) as { c: number }).c;
}

export function setTicketStatus(id: number, status: TicketStatus, reason?: string): void {
  if (status === TicketStatus.Closed) {
    db.prepare(`UPDATE tickets SET status='closed', closed_at=unixepoch(), close_reason=? WHERE id=?`)
      .run(reason ?? null, id);
  } else {
    db.prepare(`UPDATE tickets SET status='open', closed_at=NULL, close_reason=NULL WHERE id=?`).run(id);
  }
}

export function setTicketClaim(id: number, userId: string | null): void {
  db.prepare('UPDATE tickets SET claimed_by = ? WHERE id = ?').run(userId, id);
}

export function touchTicketActivity(channelId: string): void {
  db.prepare(`UPDATE tickets SET last_activity_at = unixepoch() WHERE channel_id = ? AND status = 'open'`)
    .run(channelId);
}

/** Returns all open tickets that have been inactive for >= `hours` hours. */
export function findInactiveTickets(hours: number): TicketRecord[] {
  const threshold = Math.floor(Date.now() / 1000) - hours * 3600;
  return db.prepare(
    `SELECT * FROM tickets WHERE status = 'open' AND last_activity_at <= ?`,
  ).all(threshold) as TicketRecord[];
}

/** Returns inactive tickets for a specific guild only. */
export function findInactiveTicketsForGuild(guildId: string, hours: number): TicketRecord[] {
  const threshold = Math.floor(Date.now() / 1000) - hours * 3600;
  return db.prepare(
    `SELECT * FROM tickets WHERE guild_id = ? AND status = 'open' AND last_activity_at <= ?`,
  ).all(guildId, threshold) as TicketRecord[];
}

export function getTicketMessages(ticketId: number): Array<{
  user_id: string; username: string; content: string; timestamp: number;
}> {
  return db.prepare(
    'SELECT user_id, username, content, timestamp FROM ticket_messages WHERE ticket_id = ? ORDER BY timestamp',
  ).all(ticketId) as any[];
}

export function logTicketMessage(ticketId: number, userId: string, username: string, content: string): void {
  db.prepare('INSERT INTO ticket_messages (ticket_id, user_id, username, content) VALUES (?, ?, ?, ?)')
    .run(ticketId, userId, username, content);
}

// ── Ticket Types (reusable category templates) ────────────────────────────────

export interface TicketType {
  custom_id:       string;
  guild_id:        string;
  label:           string;
  emoji:           string | null;
  color:           string;
  category_id:     string;
  support_role_id: string | null;
  welcome_message: string | null;
}

export function upsertTicketType(d: TicketType): void {
  db.prepare(`
    INSERT INTO ticket_types (custom_id, guild_id, label, emoji, color, category_id, support_role_id, welcome_message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(guild_id, custom_id) DO UPDATE SET
      label = excluded.label, emoji = excluded.emoji, color = excluded.color,
      category_id = excluded.category_id, support_role_id = excluded.support_role_id,
      welcome_message = excluded.welcome_message
  `).run(d.custom_id, d.guild_id, d.label, d.emoji, d.color,
         d.category_id, d.support_role_id, d.welcome_message);
}

export function getTicketType(guildId: string, customId: string): TicketType | null {
  return db.prepare('SELECT * FROM ticket_types WHERE guild_id = ? AND custom_id = ?')
    .get(guildId, customId) as TicketType | null;
}

export function listTicketTypes(guildId: string): TicketType[] {
  return db.prepare('SELECT * FROM ticket_types WHERE guild_id = ? ORDER BY custom_id')
    .all(guildId) as TicketType[];
}

export function deleteTicketType(guildId: string, customId: string): boolean {
  return db.prepare('DELETE FROM ticket_types WHERE guild_id = ? AND custom_id = ?')
    .run(guildId, customId).changes > 0;
}

// ── Tags ──────────────────────────────────────────────────────────────────────

export function createTag(d: { guild_id: string; name: string; content: string; created_by: string }): TicketTag | null {
  try {
    const r = db.prepare(`
      INSERT INTO ticket_tags (guild_id, name, content, created_by) VALUES (?, ?, ?, ?)
    `).run(d.guild_id, d.name.toLowerCase(), d.content, d.created_by);
    return db.prepare('SELECT * FROM ticket_tags WHERE id = ?').get(r.lastInsertRowid) as TicketTag;
  } catch {
    return null; // UNIQUE constraint = duplicate name
  }
}

export function updateTag(guildId: string, name: string, content: string): boolean {
  return db.prepare('UPDATE ticket_tags SET content = ? WHERE guild_id = ? AND name = ?')
    .run(content, guildId, name.toLowerCase()).changes > 0;
}

export function getTag(guildId: string, name: string): TicketTag | null {
  return db.prepare('SELECT * FROM ticket_tags WHERE guild_id = ? AND name = ?')
    .get(guildId, name.toLowerCase()) as TicketTag | null;
}

export function listTags(guildId: string): TicketTag[] {
  return db.prepare('SELECT * FROM ticket_tags WHERE guild_id = ? ORDER BY name')
    .all(guildId) as TicketTag[];
}

export function deleteTag(guildId: string, name: string): boolean {
  return db.prepare('DELETE FROM ticket_tags WHERE guild_id = ? AND name = ?')
    .run(guildId, name.toLowerCase()).changes > 0;
}

export function searchTags(guildId: string, query: string): TicketTag[] {
  return db.prepare(`SELECT * FROM ticket_tags WHERE guild_id = ? AND name LIKE ? ORDER BY name LIMIT 25`)
    .all(guildId, `%${query.toLowerCase()}%`) as TicketTag[];
}

// ── Activity log (for statistics) ────────────────────────────────────────────

export function logActivity(d: { guild_id: string; ticket_id: number; user_id: string; event: ActivityEvent }): void {
  db.prepare('INSERT INTO ticket_activity (guild_id, ticket_id, user_id, event) VALUES (?, ?, ?, ?)')
    .run(d.guild_id, d.ticket_id, d.user_id, d.event);
}

export interface TicketStats {
  total:         number;
  open:          number;
  closed:        number;
  avg_close_time: number | null;  // seconds
  today:         number;
  this_week:     number;
  this_month:    number;
}

export function getGuildStats(guildId: string): TicketStats {
  const now     = Math.floor(Date.now() / 1000);
  const dayAgo  = now - 86400;
  const weekAgo = now - 7 * 86400;
  const monAgo  = now - 30 * 86400;

  const totals = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status='open'   THEN 1 ELSE 0 END) as open,
      SUM(CASE WHEN status='closed' THEN 1 ELSE 0 END) as closed,
      AVG(CASE WHEN closed_at IS NOT NULL THEN (closed_at - created_at) ELSE NULL END) as avg_close_time
    FROM tickets WHERE guild_id = ?
  `).get(guildId) as any;

  const today     = (db.prepare(`SELECT COUNT(*) c FROM tickets WHERE guild_id = ? AND created_at >= ?`).get(guildId, dayAgo)  as any).c;
  const this_week = (db.prepare(`SELECT COUNT(*) c FROM tickets WHERE guild_id = ? AND created_at >= ?`).get(guildId, weekAgo) as any).c;
  const this_month = (db.prepare(`SELECT COUNT(*) c FROM tickets WHERE guild_id = ? AND created_at >= ?`).get(guildId, monAgo) as any).c;

  return {
    total:          totals.total ?? 0,
    open:           totals.open ?? 0,
    closed:         totals.closed ?? 0,
    avg_close_time: totals.avg_close_time ?? null,
    today,
    this_week,
    this_month,
  };
}

export interface StaffStats {
  user_id:  string;
  claimed:  number;
  closed:   number;
}

export function getStaffStats(guildId: string, limit = 10): StaffStats[] {
  return db.prepare(`
    SELECT
      user_id,
      SUM(CASE WHEN event = 'claimed'   THEN 1 ELSE 0 END) as claimed,
      SUM(CASE WHEN event = 'closed'    THEN 1 ELSE 0 END) as closed
    FROM ticket_activity
    WHERE guild_id = ?
    GROUP BY user_id
    ORDER BY (claimed + closed) DESC
    LIMIT ?
  `).all(guildId, limit) as StaffStats[];
}

// ── Survey responses ──────────────────────────────────────────────────────────

export function insertSurvey(d: { ticket_id: number; guild_id: string; user_id: string; rating: number; feedback: string | null }): void {
  // Only one response per ticket (ignore duplicates)
  db.prepare(`
    INSERT OR IGNORE INTO ticket_surveys (ticket_id, guild_id, user_id, rating, feedback)
    VALUES (?, ?, ?, ?, ?)
  `).run(d.ticket_id, d.guild_id, d.user_id, d.rating, d.feedback);
}

export interface SurveyStats {
  total:       number;
  avg_rating:  number | null;
  rating_1:    number;
  rating_2:    number;
  rating_3:    number;
  rating_4:    number;
  rating_5:    number;
}

export function getSurveyStats(guildId: string): SurveyStats {
  const row = db.prepare(`
    SELECT
      COUNT(*) as total,
      AVG(rating) as avg_rating,
      SUM(CASE WHEN rating=1 THEN 1 ELSE 0 END) as rating_1,
      SUM(CASE WHEN rating=2 THEN 1 ELSE 0 END) as rating_2,
      SUM(CASE WHEN rating=3 THEN 1 ELSE 0 END) as rating_3,
      SUM(CASE WHEN rating=4 THEN 1 ELSE 0 END) as rating_4,
      SUM(CASE WHEN rating=5 THEN 1 ELSE 0 END) as rating_5
    FROM ticket_surveys WHERE guild_id = ?
  `).get(guildId) as any;

  return {
    total:      row.total ?? 0,
    avg_rating: row.avg_rating ?? null,
    rating_1:   row.rating_1 ?? 0,
    rating_2:   row.rating_2 ?? 0,
    rating_3:   row.rating_3 ?? 0,
    rating_4:   row.rating_4 ?? 0,
    rating_5:   row.rating_5 ?? 0,
  };
}
