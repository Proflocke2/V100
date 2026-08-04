import { CompatDatabase } from './sqlite-compat';
import path from 'path';

const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'bot.db');
const db = new CompatDatabase(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
// RAM efficiency: keep SQLite's own page cache small and force temp b-trees/sorts
// to spill to disk instead of RAM — this bot's queries are small/simple (per-guild
// lookups), so there's no real performance cost to a tight cache on a 512MB host.
db.pragma('cache_size = -2000'); // negative = KB, so ~2MB page cache cap
db.pragma('temp_store = FILE');

db.exec(`
  CREATE TABLE IF NOT EXISTS guilds (
    id TEXT PRIMARY KEY,
    prefix TEXT DEFAULT '!',
    mod_log_channel TEXT,
    welcome_channel TEXT,
    welcome_message TEXT,
    welcome_embed INTEGER DEFAULT 1,
    welcome_color TEXT DEFAULT '#5865f2',
    welcome_role TEXT,
    automod_enabled INTEGER DEFAULT 0,
    automod_antilink INTEGER DEFAULT 0,
    automod_antispam INTEGER DEFAULT 0,
    automod_badwords TEXT DEFAULT '[]',
    log_channel TEXT,
    mute_role TEXT,
    level_enabled INTEGER DEFAULT 1,
    level_channel TEXT,
    level_roles TEXT DEFAULT '{}',
    language TEXT DEFAULT 'en',
    embed_color TEXT DEFAULT '#5865f2',
    automod_antiinvite INTEGER DEFAULT 0,
    automod_anticaps INTEGER DEFAULT 0,
    gambling_cooldown_ms INTEGER DEFAULT 15000,
    gambling_disclaimer INTEGER DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT UNIQUE NOT NULL,
    user_id TEXT NOT NULL,
    panel_id INTEGER,
    number INTEGER NOT NULL,
    status TEXT DEFAULT 'open',
    claimed_by TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    closed_at INTEGER,
    last_ticket_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS ticket_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS panels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    name TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#5865f2',
    emoji TEXT DEFAULT '🎫',
    button_text TEXT DEFAULT 'Open Ticket',
    category_id TEXT,
    support_roles TEXT DEFAULT '[]',
    message_id TEXT,
    channel_id TEXT,
    created_at INTEGER DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS users (
    id TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 0,
    messages INTEGER DEFAULT 0,
    last_xp INTEGER DEFAULT 0,
    seasonal_xp INTEGER DEFAULT 0,
    seasonal_level INTEGER DEFAULT 0,
    PRIMARY KEY (id, guild_id)
  );
  CREATE TABLE IF NOT EXISTS warnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    case_number INTEGER,
    created_at INTEGER DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    questions TEXT NOT NULL,
    accept_role TEXT,
    review_channel TEXT,
    dm_message TEXT,
    button_label TEXT DEFAULT 'Apply Now',
    active INTEGER DEFAULT 1,
    max_concurrent INTEGER DEFAULT 0,
    reapply_cooldown_days INTEGER DEFAULT 0,
    accepted_channel TEXT,
    denied_channel TEXT,
    created_at INTEGER DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS application_answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    answers TEXT NOT NULL,
    status TEXT,
    reviewed_by TEXT,
    reviewed_at INTEGER,
    review_reason TEXT,
    created_at INTEGER DEFAULT (unixepoch()),
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS giveaways (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT UNIQUE,
    prize TEXT NOT NULL,
    winners INTEGER DEFAULT 1,
    host_id TEXT NOT NULL,
    ends_at INTEGER NOT NULL,
    ended INTEGER DEFAULT 0,
    participants TEXT DEFAULT '[]',
    winner_ids TEXT DEFAULT '[]'
  );
  CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message TEXT NOT NULL,
    remind_at INTEGER NOT NULL,
    done INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expired INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS automod_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS verification_config (
    guild_id TEXT PRIMARY KEY,
    enabled INTEGER DEFAULT 0,
    unverified_role_id TEXT,
    verified_role_id TEXT NOT NULL,
    verification_channel_id TEXT NOT NULL,
    log_channel_id TEXT,
    message TEXT DEFAULT 'Click below to verify',
    button_label TEXT DEFAULT 'Verify',
    created_at INTEGER DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS stats_config (
    guild_id TEXT PRIMARY KEY,
    mode TEXT NOT NULL,
    members_channel TEXT,
    bots_channel TEXT,
    boosts_channel TEXT,
    embed_channel TEXT,
    embed_message_id TEXT
  );
  CREATE TABLE IF NOT EXISTS multipanels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    panel_id TEXT UNIQUE NOT NULL,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT,
    name TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#5865f2',
    option_ids TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS multipanel_options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    option_id TEXT UNIQUE NOT NULL,
    label TEXT NOT NULL,
    description TEXT,
    category_id TEXT NOT NULL,
    support_roles TEXT NOT NULL,
    welcome_message TEXT,
    emoji TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_multipanels_guild ON multipanels(guild_id);
  CREATE INDEX IF NOT EXISTS idx_multipanels_channel ON multipanels(channel_id);

  -- ── Staff Activity Tracking ──────────────────────────────────────────────
  -- One row per (guild, staff member). Weekly counters reset every Monday
  -- 00:00 UTC; total counters are cumulative and never reset.
  CREATE TABLE IF NOT EXISTS staff_activity (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    weekly_tickets INTEGER NOT NULL DEFAULT 0,
    total_tickets INTEGER NOT NULL DEFAULT 0,
    weekly_sponsors INTEGER NOT NULL DEFAULT 0,
    total_sponsors INTEGER NOT NULL DEFAULT 0,
    weekly_mod_actions INTEGER NOT NULL DEFAULT 0,
    total_mod_actions INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER DEFAULT (unixepoch()),
    PRIMARY KEY (guild_id, user_id)
  );
  -- One row per weekly reset, per staff member — a permanent trend record
  -- that survives resetWeeklyCounters() wiping the live weekly_* counters.
  -- Written by Repo.snapshotWeek() right before the reset runs.
  CREATE TABLE IF NOT EXISTS staff_activity_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    week_key TEXT NOT NULL,
    tickets INTEGER NOT NULL DEFAULT 0,
    sponsors INTEGER NOT NULL DEFAULT 0,
    mod_actions INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_staff_activity_history_guild_user ON staff_activity_history(guild_id, user_id);
  -- One row per registered sponsor/giveaway donation, for a simple history log.
  CREATE TABLE IF NOT EXISTS staff_sponsors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    donation TEXT NOT NULL,
    registered_by TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_staff_activity_guild ON staff_activity(guild_id);
  CREATE INDEX IF NOT EXISTS idx_staff_sponsors_guild ON staff_sponsors(guild_id);

  -- ── Sticky Messages ──────────────────────────────────────────────────────
  -- One row per (guild, channel). The message is re-posted at the bottom of
  -- the channel after every new human message.
  CREATE TABLE IF NOT EXISTS sticky_messages (
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    content TEXT NOT NULL,
    message_id TEXT,
    created_by TEXT NOT NULL,
    updated_at INTEGER DEFAULT (unixepoch()),
    PRIMARY KEY (guild_id, channel_id)
  );
  CREATE INDEX IF NOT EXISTS idx_sticky_messages_guild ON sticky_messages(guild_id);

  -- ── Staff Reports ────────────────────────────────────────────────────────
  -- Every submitted /report-staff report, kept as a durable audit trail even
  -- if the message in the log channel is later deleted.
  CREATE TABLE IF NOT EXISTS disabled_commands (
    guild_id TEXT NOT NULL,
    command_name TEXT NOT NULL,
    disabled_by TEXT,
    disabled_at INTEGER DEFAULT (unixepoch()),
    PRIMARY KEY (guild_id, command_name)
  );
  CREATE TABLE IF NOT EXISTS mod_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    action TEXT NOT NULL,
    reason TEXT,
    duration_ms INTEGER,
    case_number INTEGER,
    note TEXT,
    created_at INTEGER DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_mod_history_guild_user ON mod_history(guild_id, user_id);
  CREATE INDEX IF NOT EXISTS idx_mod_history_guild_case ON mod_history(guild_id, case_number);
  CREATE TABLE IF NOT EXISTS staff_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    reporter_id TEXT NOT NULL,
    accused_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_staff_reports_guild ON staff_reports(guild_id);

  -- ── Suggestions (/suggest) ────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    author_id TEXT NOT NULL,
    content TEXT NOT NULL,
    message_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',   -- 'pending' | 'approved' | 'denied'
    decided_by TEXT,
    decision_reason TEXT,
    upvotes INTEGER NOT NULL DEFAULT 0,
    downvotes INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER DEFAULT (unixepoch()),
    decided_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_suggestions_guild_status ON suggestions(guild_id, status);
  -- One row per (suggestion, user) — the PRIMARY KEY is what makes a second
  -- vote from the same user physically impossible at the DB level, not just
  -- a client-side button-disable (Discord buttons can be clicked from
  -- multiple devices/clients at once, so this needs to be a real constraint).
  CREATE TABLE IF NOT EXISTS suggestion_votes (
    suggestion_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    vote_type TEXT NOT NULL, -- 'up' | 'down'
    PRIMARY KEY (suggestion_id, user_id)
  );

  -- ── Error tracking (self-built, no Sentry/Winston — see modules/errorTracking) ─
  CREATE TABLE IF NOT EXISTS error_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT,
    source TEXT NOT NULL,
    message TEXT NOT NULL,
    stack TEXT,
    user_id TEXT,
    created_at INTEGER DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_error_log_created ON error_log(created_at);
  CREATE INDEX IF NOT EXISTS idx_error_log_source ON error_log(source);

  -- Single-row global (NOT per-guild) config table. Currently only holds
  -- where critical-error live alerts get posted, but kept generic ("bot_config",
  -- not "error_config") since more global-only settings will likely land here
  -- eventually rather than each getting their own one-off table.
  CREATE TABLE IF NOT EXISTS bot_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    error_log_channel TEXT,
    error_log_guild TEXT
  );
  INSERT OR IGNORE INTO bot_config (id) VALUES (1);

  -- ── Birthdays (/birthday) ─────────────────────────────────────────────────
  -- Scoped per-guild on purpose — birthdays only matter within the server
  -- they're used in, not shared globally across every server the bot is in.
  -- PRIMARY KEY (guild_id, user_id) still guarantees at most one birthday
  -- per person PER SERVER, and /birthday set simply overwrites it (see
  -- repository.ts's INSERT OR REPLACE) so changing it is just re-running the command.
  CREATE TABLE IF NOT EXISTS birthdays (
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    birth_month INTEGER NOT NULL,
    birth_day INTEGER NOT NULL,
    birth_year INTEGER,          -- optional, only ever used for "turns N" in the greeting — see dateUtils/service comments on why this is never displayed as a raw date
    last_greeted_key TEXT,       -- 'YYYY-MM-DD' of the last day we greeted them — prevents double-greets across restarts on the same day
    PRIMARY KEY (guild_id, user_id)
  );

  -- Per-channel opt-outs for specific automod/security checks — e.g. a
  -- channel where spamming or caps-lock is explicitly allowed. Checked by
  -- ALL THREE message-scanning systems in this project (legacy automod in
  -- events/messageCreate.ts, automod3Handler.ts, and securityEngine.ts) via
  -- the shared modules/moderation/channelExceptions.ts helper, using a
  -- canonical feature name so disabling e.g. 'antispam' for a channel
  -- silences spam detection everywhere, not just in one of the three.
  CREATE TABLE IF NOT EXISTS automod_channel_exceptions (
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    feature TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    PRIMARY KEY (guild_id, channel_id, feature)
  );
  CREATE INDEX IF NOT EXISTS idx_automod_exceptions_channel ON automod_channel_exceptions(guild_id, channel_id);

  -- Who changed which setting, when. Not exhaustive across every single
  -- config write in the bot (that would touch dozens of files) — scoped to
  -- the security-sensitive and structural changes admins most want a paper
  -- trail for: security/anti-nuke toggles & thresholds, channel exceptions,
  -- command disable/enable, welcome toggles, reaction-role panel structure.
  CREATE TABLE IF NOT EXISTS config_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    detail TEXT,
    created_at INTEGER DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_config_audit_guild ON config_audit_log(guild_id, created_at);
`);

export default db;

export function getGuild(id: string) {
  let guild = db.prepare('SELECT * FROM guilds WHERE id = ?').get(id) as any;
  if (!guild) {
    db.prepare('INSERT OR IGNORE INTO guilds (id) VALUES (?)').run(id);
    guild = db.prepare('SELECT * FROM guilds WHERE id = ?').get(id);
  }
  return guild;
}

const ALLOWED_GUILD_KEYS = new Set([
  'prefix', 'mod_log_channel', 'welcome_channel', 'welcome_message',
  'welcome_embed', 'welcome_color', 'welcome_role', 'automod_enabled',
  'automod_antilink', 'automod_antispam', 'automod_badwords', 'log_channel',
  'mute_role', 'level_enabled', 'level_channel', 'level_roles', 'language',
  'embed_color', 'automod_antiinvite', 'automod_anticaps',
  'gambling_cooldown_ms', 'gambling_disclaimer',
  'staff_tracking_tickets_enabled', 'staff_tracking_sponsors_enabled',
  'staff_leaderboard_enabled', 'staff_leaderboard_interval', 'staff_leaderboard_channel',
  'staff_quota_enabled', 'staff_quota_min_tickets', 'staff_quota_role',
  'staff_quota_reminder_day', 'staff_quota_reminder_hour',
  'staff_last_reset_week', 'staff_last_reminder_week', 'staff_last_leaderboard_period',
  'staff_mod_actions_enabled', 'staff_leaderboard_metric', 'staff_quota_fallback_channel',
  'backup_auto_enabled', 'backup_auto_interval', 'backup_auto_delivery',
  'backup_auto_channel', 'backup_auto_recipient', 'backup_auto_interval_minutes', 'backup_auto_last_run_ts',
  'report_staff_role', 'report_log_channel', 'report_viewer_role',
  'suggestions_enabled', 'suggestions_channel', 'suggestions_viewer_role', 'suggestions_anonymous',
  'suggestions_vote_role',
  'birthday_enabled', 'birthday_channel', 'birthday_role', 'birthday_ping_hour',
  'voice_xp_enabled', 'lucky_drops_enabled', 'activity_callout_enabled', 'activity_callout_channel',
  'server_backup_auto_enabled', 'server_backup_auto_interval_minutes', 'server_backup_auto_delivery',
  'server_backup_auto_channel', 'server_backup_auto_recipient', 'server_backup_auto_last_run_ts',
  'server_backup_messages_enabled', 'server_backup_messages_retention_days',
  'changelog_staff_channel', 'changelog_member_channel',
  'seasonal_enabled', 'seasonal_auto_reset_days', 'seasonal_last_reset_ts', 'seasonal_label',
  'level_lb_channel', 'level_lb_interval', 'level_lb_post_day', 'level_lb_post_hour', 'level_lb_last_post_ts',
] as const);

export type GuildKey = typeof ALLOWED_GUILD_KEYS extends Set<infer T> ? T : never;

export function setGuildValue(guildId: string, key: GuildKey, value: unknown): void {
  if (!(ALLOWED_GUILD_KEYS as Set<string>).has(key)) {
    throw new Error(`[DB] Unerlaubter guild key: "${key}"`);
  }
  getGuild(guildId);
  db.prepare(`UPDATE guilds SET ${key} = ? WHERE id = ?`).run(value as any, guildId);
}

export function getUser(userId: string, guildId: string) {
  let user = db.prepare('SELECT * FROM users WHERE id = ? AND guild_id = ?').get(userId, guildId) as any;
  if (!user) {
    db.prepare('INSERT OR IGNORE INTO users (id, guild_id, xp, level, messages, last_xp) VALUES (?, ?, ?, ?, ?, ?)').run(userId, guildId, 0, 0, 0, 0);
    user = db.prepare('SELECT * FROM users WHERE id = ? AND guild_id = ?').get(userId, guildId);
  }
  return user;
}

// ── Per-guild command disable/enable ─────────────────────────────────────────

export function isCommandDisabled(guildId: string, commandName: string): boolean {
  const row = db.prepare(
    'SELECT 1 FROM disabled_commands WHERE guild_id = ? AND command_name = ?',
  ).get(guildId, commandName);
  return !!row;
}

export function disableCommand(guildId: string, commandName: string, disabledBy: string): void {
  db.prepare(
    'INSERT OR REPLACE INTO disabled_commands (guild_id, command_name, disabled_by, disabled_at) VALUES (?, ?, ?, unixepoch())',
  ).run(guildId, commandName, disabledBy);
}

export function enableCommand(guildId: string, commandName: string): boolean {
  const res = db.prepare(
    'DELETE FROM disabled_commands WHERE guild_id = ? AND command_name = ?',
  ).run(guildId, commandName);
  return res.changes > 0;
}

export function listDisabledCommands(guildId: string): string[] {
  const rows = db.prepare(
    'SELECT command_name FROM disabled_commands WHERE guild_id = ? ORDER BY command_name',
  ).all(guildId) as { command_name: string }[];
  return rows.map(r => r.command_name);
}

// ── Moderation history (kick / timeout — warns already live in `warnings`) ───

export type ModAction = 'kick' | 'timeout' | 'ban' | 'warn' | 'unban' | 'unmute' | 'note';

/**
 * Logs a moderation action and assigns it a per-guild sequential case
 * number (Case #1, #2, ...) — returned so callers can show it in their
 * reply ("⚠️ Warned <user> — Case #14"). See /modcase for the searchable
 * case browser this feeds.
 */
export function logModAction(
  guildId: string,
  userId: string,
  moderatorId: string,
  action: ModAction,
  reason: string,
  durationMs?: number,
): number {
  // NOTE: prepared statements here are intentionally NOT cached at module
  // scope — the sqlite-compat layer finalizes every statement after its
  // single use (see sqlite-compat.ts), so a cached statement would only
  // work once and then throw "Statement already finalized" on every call
  // after the first. Always prepare fresh, same as everywhere else in this file.
  const caseNumber = (db.prepare('SELECT COALESCE(MAX(case_number), 0) + 1 AS next FROM mod_history WHERE guild_id = ?').get(guildId) as { next: number }).next;
  db.prepare(
    'INSERT INTO mod_history (guild_id, user_id, moderator_id, action, reason, duration_ms, case_number) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(guildId, userId, moderatorId, action, reason, durationMs ?? null, caseNumber);
  return caseNumber;
}

export interface ModHistoryRow {
  id: number;
  case_number: number | null;
  user_id: string;
  action: ModAction;
  moderator_id: string;
  reason: string;
  note: string | null;
  duration_ms: number | null;
  created_at: number;
}

export function getModHistory(guildId: string, userId: string): ModHistoryRow[] {
  return db.prepare(
    'SELECT id, case_number, user_id, action, moderator_id, reason, note, duration_ms, created_at FROM mod_history WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC',
  ).all(guildId, userId) as ModHistoryRow[];
}

/** Single case lookup by its per-guild case_number (what /modcase view shows). */
export function getModCase(guildId: string, caseNumber: number): ModHistoryRow | null {
  return (db.prepare(
    'SELECT id, case_number, user_id, action, moderator_id, reason, note, duration_ms, created_at FROM mod_history WHERE guild_id = ? AND case_number = ?',
  ).get(guildId, caseNumber) as ModHistoryRow | undefined) ?? null;
}

export interface ModCaseSearchFilters {
  moderatorId?: string;
  action?: ModAction;
  userId?: string;
  since?: number;   // unix seconds
  until?: number;   // unix seconds
  limit?: number;   // default 20, capped at 50
}

/** Filtered, paginated case search — backs /modcase list. */
export function searchModCases(guildId: string, filters: ModCaseSearchFilters): ModHistoryRow[] {
  const clauses: string[] = ['guild_id = ?'];
  const params: (string | number)[] = [guildId];

  if (filters.moderatorId) { clauses.push('moderator_id = ?'); params.push(filters.moderatorId); }
  if (filters.action)      { clauses.push('action = ?');       params.push(filters.action); }
  if (filters.userId)      { clauses.push('user_id = ?');      params.push(filters.userId); }
  if (filters.since)       { clauses.push('created_at >= ?');  params.push(filters.since); }
  if (filters.until)       { clauses.push('created_at <= ?');  params.push(filters.until); }

  const limit = Math.min(filters.limit ?? 20, 50);
  params.push(limit);

  return db.prepare(
    `SELECT id, case_number, user_id, action, moderator_id, reason, note, duration_ms, created_at
     FROM mod_history WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC LIMIT ?`,
  ).all(...params) as ModHistoryRow[];
}

/** Total count matching the same filters as searchModCases — for "showing 20 of 143" footers. */
export function countModCases(guildId: string, filters: Omit<ModCaseSearchFilters, 'limit'>): number {
  const clauses: string[] = ['guild_id = ?'];
  const params: (string | number)[] = [guildId];

  if (filters.moderatorId) { clauses.push('moderator_id = ?'); params.push(filters.moderatorId); }
  if (filters.action)      { clauses.push('action = ?');       params.push(filters.action); }
  if (filters.userId)      { clauses.push('user_id = ?');      params.push(filters.userId); }
  if (filters.since)       { clauses.push('created_at >= ?');  params.push(filters.since); }
  if (filters.until)       { clauses.push('created_at <= ?');  params.push(filters.until); }

  return (db.prepare(`SELECT COUNT(*) AS c FROM mod_history WHERE ${clauses.join(' AND ')}`).get(...params) as { c: number }).c;
}

/** Appends/overwrites a moderator follow-up note on a case (kept separate from the original `reason`). */
export function setModCaseNote(guildId: string, caseNumber: number, note: string | null): boolean {
  const result = db.prepare('UPDATE mod_history SET note = ? WHERE guild_id = ? AND case_number = ?').run(note, guildId, caseNumber);
  return result.changes > 0;
}

/** Deletes a case (e.g. logged in error). Used by /modcase delete, admin-only. */
export function deleteModCase(guildId: string, caseNumber: number): boolean {
  const result = db.prepare('DELETE FROM mod_history WHERE guild_id = ? AND case_number = ?').run(guildId, caseNumber);
  return result.changes > 0;
}

export function nextTicketNumber(guildId: string) {
  const row = db.prepare('SELECT MAX(number) as max FROM tickets WHERE guild_id = ?').get(guildId) as any;
  return (row?.max ?? 0) + 1;
}

export function initializeVerification() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS verify_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        details TEXT,
        timestamp INTEGER DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS idx_verify_log_guild ON verify_log(guild_id);
      CREATE INDEX IF NOT EXISTS idx_verify_log_user ON verify_log(user_id);
    `);
    console.log('[DB] Verification tables initialized successfully');
  } catch (err) {
    console.error('[DB] Failed to initialize verification tables:', err);
  }
}

const DB_TS_ALLOWED_TABLES = new Set<string>(['guilds', 'staff_activity']);
function hasCol(table: string, col: string): boolean {
  if (!DB_TS_ALLOWED_TABLES.has(table)) return false;
  const info = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return info.some((c: any) => c.name === col);
}

// staff_activity: existing installs created the table before weekly_mod_actions/
// total_mod_actions existed — CREATE TABLE IF NOT EXISTS won't retrofit columns
// onto an already-existing table, so ALTER them in explicitly (no-op on fresh installs).
const STAFF_ACTIVITY_TABLE_COLUMNS: Array<[string, string]> = [
  ['weekly_mod_actions', 'INTEGER NOT NULL DEFAULT 0'],
  ['total_mod_actions',  'INTEGER NOT NULL DEFAULT 0'],
];
for (const [col, def] of STAFF_ACTIVITY_TABLE_COLUMNS) {
  if (!hasCol('staff_activity', col)) {
    try { db.prepare(`ALTER TABLE staff_activity ADD COLUMN ${col} ${def}`).run(); } catch {}
  }
}

if (!hasCol('guilds', 'automod_antiinvite')) {
  try { db.prepare('ALTER TABLE guilds ADD COLUMN automod_antiinvite INTEGER DEFAULT 0').run(); } catch {}
}

if (!hasCol('warnings', 'case_number')) {
  try { db.prepare('ALTER TABLE warnings ADD COLUMN case_number INTEGER').run(); } catch {}
}

// mod_history: case_number (per-guild sequential ID, e.g. "Case #12") and
// note (moderator follow-up context, separate from the original reason) —
// added for /modcase. Existing rows get backfilled in created_at order per
// guild so history from before this feature still gets real case numbers
// instead of showing up as blank/uncased.
if (!hasCol('mod_history', 'case_number')) {
  try { db.prepare('ALTER TABLE mod_history ADD COLUMN case_number INTEGER').run(); } catch {}
}
if (!hasCol('mod_history', 'note')) {
  try { db.prepare('ALTER TABLE mod_history ADD COLUMN note TEXT').run(); } catch {}
}
(function backfillModHistoryCaseNumbers() {
  try {
    const guildIds = db.prepare('SELECT DISTINCT guild_id FROM mod_history WHERE case_number IS NULL').all() as Array<{ guild_id: string }>;
    if (guildIds.length === 0) return;
    const selectUnnumbered = db.prepare('SELECT id FROM mod_history WHERE guild_id = ? AND case_number IS NULL ORDER BY created_at ASC, id ASC');
    const maxCase = db.prepare('SELECT COALESCE(MAX(case_number), 0) AS m FROM mod_history WHERE guild_id = ?');
    const setCase = db.prepare('UPDATE mod_history SET case_number = ? WHERE id = ?');
    let totalBackfilled = 0;
    for (const { guild_id } of guildIds) {
      let next = (maxCase.get(guild_id) as { m: number }).m + 1;
      const rows = selectUnnumbered.all(guild_id) as Array<{ id: number }>;
      for (const row of rows) {
        setCase.run(next, row.id);
        next++;
        totalBackfilled++;
      }
    }
    if (totalBackfilled > 0) console.log(`[mod_history] Backfilled case numbers for ${totalBackfilled} pre-existing entries across ${guildIds.length} guild(s).`);
  } catch (err) {
    console.error('[mod_history] Case-number backfill failed (existing entries will show without a case number until next boot):', err);
  }
})();
if (!hasCol('guilds', 'automod_anticaps')) {
  try { db.prepare('ALTER TABLE guilds ADD COLUMN automod_anticaps INTEGER DEFAULT 0').run(); }  catch {}
}

// ── Staff Activity Tracking config (all default OFF except ticket counting) ─
const STAFF_ACTIVITY_COLUMNS: Array<[string, string]> = [
  ['staff_tracking_tickets_enabled',  "INTEGER DEFAULT 1"],   // count closed tickets per staff member
  ['staff_tracking_sponsors_enabled', "INTEGER DEFAULT 1"],   // count registered giveaway sponsors
  ['staff_leaderboard_enabled',       "INTEGER DEFAULT 0"],   // /team-activity leaderboard + auto-post
  ['staff_leaderboard_interval',      "TEXT DEFAULT 'manual'"], // 'weekly' | 'monthly' | 'manual'
  ['staff_leaderboard_channel',       "TEXT"],                // channel for auto-posted leaderboards
  ['staff_quota_enabled',             "INTEGER DEFAULT 0"],   // weekly minimum ticket goal + reminder
  ['staff_quota_min_tickets',         "INTEGER DEFAULT 5"],
  ['staff_quota_role',                "TEXT"],                // role that marks "team members" to check
  ['staff_quota_reminder_day',        "INTEGER DEFAULT 6"],   // 0=Sunday..6=Saturday (UTC)
  ['staff_quota_reminder_hour',       "INTEGER DEFAULT 18"],  // 0-23 UTC
  ['staff_last_reset_week',           "TEXT"],                // ISO week guard, e.g. '2026-W28'
  ['staff_last_reminder_week',        "TEXT"],                // ISO week guard for quota reminders
  ['staff_last_leaderboard_period',   "TEXT"],                // ISO week/month guard for auto-post
  ['staff_mod_actions_enabled',       "INTEGER DEFAULT 0"],   // count kick/timeout/warn/ban per staff member
  ['staff_leaderboard_metric',        "TEXT DEFAULT 'combined'"], // 'tickets' | 'sponsors' | 'mod_actions' | 'combined'
  ['staff_quota_fallback_channel',    "TEXT"],                // where to post "DM failed" summaries for quota reminders
];
for (const [col, def] of STAFF_ACTIVITY_COLUMNS) {
  if (!hasCol('guilds', col)) {
    try { db.prepare(`ALTER TABLE guilds ADD COLUMN ${col} ${def}`).run(); } catch {}
  }
}

// ── Auto-Backup config ───────────────────────────────────────────────────────
const AUTO_BACKUP_COLUMNS: Array<[string, string]> = [
  ['backup_auto_enabled',   "INTEGER DEFAULT 0"],
  ['backup_auto_interval',  "TEXT DEFAULT 'weekly'"], // legacy 'daily' | 'weekly' — superseded by backup_auto_interval_minutes, kept for one-time migration fallback
  ['backup_auto_delivery',  "TEXT DEFAULT 'channel'"], // 'channel' | 'dm'
  ['backup_auto_channel',   "TEXT"],                   // channel id, used when delivery = channel
  ['backup_auto_recipient', "TEXT"],                   // user id, used when delivery = dm
  ['backup_auto_last_run',  "TEXT"],                   // legacy day/week guard — superseded by backup_auto_last_run_ts
  ['backup_auto_interval_minutes', "INTEGER DEFAULT 10080"], // custom interval in minutes (10080 = weekly); minimum enforced at 15 in the command
  ['backup_auto_last_run_ts',      "INTEGER"],                // unix seconds of the last successful auto-backup — elapsed-time based, not a calendar-day/week key, so sub-day intervals work
];
for (const [col, def] of AUTO_BACKUP_COLUMNS) {
  if (!hasCol('guilds', col)) {
    try { db.prepare(`ALTER TABLE guilds ADD COLUMN ${col} ${def}`).run(); } catch {}
  }
}

// ── Report-Staff config ──────────────────────────────────────────────────────
const REPORT_STAFF_COLUMNS: Array<[string, string]> = [
  ['report_staff_role',  "TEXT"], // role whose members appear in the /report-staff select menu
  ['report_log_channel', "TEXT"], // private channel the finished report gets posted to
  ['report_viewer_role', "TEXT"], // "High Staff/Admin" role allowed to see that channel
];
for (const [col, def] of REPORT_STAFF_COLUMNS) {
  if (!hasCol('guilds', col)) {
    try { db.prepare(`ALTER TABLE guilds ADD COLUMN ${col} ${def}`).run(); } catch {}
  }
}

// ── Suggestions config ────────────────────────────────────────────────────────
const SUGGESTIONS_COLUMNS: Array<[string, string]> = [
  ['suggestions_enabled',     "INTEGER DEFAULT 0"], // /suggest submit refuses to work until this is on
  ['suggestions_channel',     "TEXT"],               // where suggestion embeds get posted
  ['suggestions_viewer_role', "TEXT"],               // role allowed to approve/deny — null = nobody can decide, only vote
  ['suggestions_vote_role',   "TEXT"],               // role allowed to VOTE (👍/👎) — null = everyone may vote
  ['suggestions_anonymous',   "INTEGER DEFAULT 0"],  // hide the author's name on posted suggestions
];
for (const [col, def] of SUGGESTIONS_COLUMNS) {
  if (!hasCol('guilds', col)) {
    try { db.prepare(`ALTER TABLE guilds ADD COLUMN ${col} ${def}`).run(); } catch {}
  }
}

// ── Birthday config ────────────────────────────────────────────────────────
const BIRTHDAY_COLUMNS: Array<[string, string]> = [
  ['birthday_enabled',   "INTEGER DEFAULT 0"], // scheduler skips the guild entirely until this is on
  ['birthday_channel',   "TEXT"],               // where the daily greeting gets posted
  ['birthday_role',      "TEXT"],               // optional — given for the day, removed the next tick. null = no role feature
  ['birthday_ping_hour', "INTEGER DEFAULT 9"],  // UTC hour the daily check fires at
];
for (const [col, def] of BIRTHDAY_COLUMNS) {
  if (!hasCol('guilds', col)) {
    try { db.prepare(`ALTER TABLE guilds ADD COLUMN ${col} ${def}`).run(); } catch {}
  }
}

// ── Engagement config (voice-XP / lucky-drops / activity-callout) ───────────
// All default ON — these are meant to work out of the box the moment a
// guild has leveling enabled, not require a separate opt-in. Admins can
// turn any of them off individually via /eco-config activity.
const ENGAGEMENT_COLUMNS: Array<[string, string]> = [
  ['voice_xp_enabled',          "INTEGER DEFAULT 1"], // separate from level_enabled so voice-xp can be disabled without disabling chat leveling
  ['lucky_drops_enabled',       "INTEGER DEFAULT 1"],
  ['activity_callout_enabled',  "INTEGER DEFAULT 1"],
  ['activity_callout_channel',  "TEXT"],               // null = falls back to level_channel, then skipped if that's also unset
];
for (const [col, def] of ENGAGEMENT_COLUMNS) {
  if (!hasCol('guilds', col)) {
    try { db.prepare(`ALTER TABLE guilds ADD COLUMN ${col} ${def}`).run(); } catch {}
  }
}

// ── Changelog config ──────────────────────────────────────────────────────
const CHANGELOG_COLUMNS: Array<[string, string]> = [
  ['changelog_staff_channel',  "TEXT"], // where /changelog post sends the staff (technical) version — null = don't auto-post
  ['changelog_member_channel', "TEXT"], // where it sends the member (public) version
];
for (const [col, def] of CHANGELOG_COLUMNS) {
  if (!hasCol('guilds', col)) {
    try { db.prepare(`ALTER TABLE guilds ADD COLUMN ${col} ${def}`).run(); } catch {}
  }
}


// ── Applications table migrations ────────────────────────────────────────────
for (const [col, def] of [
  ['max_concurrent',       'INTEGER DEFAULT 0'],
  ['reapply_cooldown_days','INTEGER DEFAULT 0'],
  ['accepted_channel',      'TEXT'],
  ['denied_channel',        'TEXT'],
] as [string, string][]) {
  if (!hasCol('applications', col)) {
    try { db.prepare(`ALTER TABLE applications ADD COLUMN ${col} ${def}`).run(); } catch {}
  }
}

// ── Users table migrations ───────────────────────────────────────────────────
for (const [col, def] of [['seasonal_xp', 'INTEGER DEFAULT 0'], ['seasonal_level', 'INTEGER DEFAULT 0']] as [string, string][]) {
  if (!hasCol('users', col)) {
    try { db.prepare(`ALTER TABLE users ADD COLUMN ${col} ${def}`).run(); } catch {}
  }
}

// ── Level Leaderboard auto-post config ────────────────────────────────────────
const LEVEL_LB_COLUMNS: Array<[string, string]> = [
  ['level_lb_channel',         "TEXT"],                    // where scheduled leaderboards are posted
  ['level_lb_interval',        "TEXT DEFAULT 'manual'"],   // 'manual'|'daily'|'weekly'|'monthly'
  ['level_lb_post_day',        "INTEGER DEFAULT 1"],        // 0=Mon…6=Sun (for weekly)
  ['level_lb_post_hour',       "INTEGER DEFAULT 9"],        // UTC hour
  ['level_lb_last_post_ts',    "INTEGER"],                  // unix-second of last successful auto-post
];
for (const [col, def] of LEVEL_LB_COLUMNS) {
  if (!hasCol('guilds', col)) {
    try { db.prepare(`ALTER TABLE guilds ADD COLUMN ${col} ${def}`).run(); } catch {}
  }
}

// ── Seasonal level config ─────────────────────────────────────────────────────
const SEASONAL_COLUMNS: Array<[string, string]> = [
  ['seasonal_enabled',          "INTEGER DEFAULT 0"],
  ['seasonal_auto_reset_days',  "INTEGER DEFAULT 0"], // 0 = manual only
  ['seasonal_last_reset_ts',    "INTEGER"],
  ['seasonal_label',            "TEXT DEFAULT 'Season'"], // displayed in leaderboard header
];
for (const [col, def] of SEASONAL_COLUMNS) {
  if (!hasCol('guilds', col)) {
    try { db.prepare(`ALTER TABLE guilds ADD COLUMN ${col} ${def}`).run(); } catch {}
  }
}

// ── Server-Backup config ─────────────────────────────────────────────────────
// Deliberately separate from the existing backup_auto_* columns (§/backup):
// that command backs up the BOT's own state (configs, economy, tickets,
// mod-history, etc — see modules/backup/service.ts's GUILD_TABLES). This is
// the SERVER's own live Discord structure — roles, channels, permissions,
// current ban list, and (opt-in) raw chat message content. Two genuinely
// different kinds of data, kept in entirely separate tables/modules on
// purpose (modules/serverBackup/*), not just separate columns.
//
// server_backup_messages_enabled defaults OFF, unlike everything else this
// session — logging the content of every message in every channel is a
// meaningfully bigger privacy footprint than XP/economy features, so it
// requires an explicit admin opt-in rather than being on by default.
const SERVER_BACKUP_COLUMNS: Array<[string, string]> = [
  ['server_backup_auto_enabled',            "INTEGER DEFAULT 0"],
  ['server_backup_auto_interval_minutes',   "INTEGER DEFAULT 10080"], // weekly default
  ['server_backup_auto_delivery',           "TEXT DEFAULT 'channel'"],
  ['server_backup_auto_channel',            "TEXT"],
  ['server_backup_auto_recipient',          "TEXT"],
  ['server_backup_auto_last_run_ts',        "INTEGER"],
  ['server_backup_messages_enabled',        "INTEGER DEFAULT 0"], // opt-in, see comment above
  ['server_backup_messages_retention_days', "INTEGER DEFAULT 90"], // 0 = keep forever
];
for (const [col, def] of SERVER_BACKUP_COLUMNS) {
  if (!hasCol('guilds', col)) {
    try { db.prepare(`ALTER TABLE guilds ADD COLUMN ${col} ${def}`).run(); } catch {}
  }
}

// ── Migration: rebuild tickets table without the old FK on panel_id ─────────
// The old schema had FOREIGN KEY (panel_id) REFERENCES panels(id) which conflicts
// with the v2 panel system (panel_v2 IDs). SQLite cannot DROP CONSTRAINTS, so we
// recreate the table using the rename-copy-drop pattern if the old FK still exists.
(function migrateTicketsTable() {
  try {
    // Detect old FK by checking PRAGMA foreign_key_list — if panel_id → panels exists, migrate.
    const fkList = db.prepare(`PRAGMA foreign_key_list(tickets)`).all() as Array<{ table: string; from: string }>;
    const hasOldPanelFk = fkList.some(fk => fk.from === 'panel_id' && fk.table === 'panels');
    if (!hasOldPanelFk) return; // Already clean — nothing to do.

    console.log('[DB] Migrating tickets table: removing legacy panel_id FK…');

    // Temporarily disable FK enforcement so we can manipulate the table safely.
    db.pragma('foreign_keys = OFF');

    db.exec(`
      -- Step 1: rename the old table
      ALTER TABLE tickets RENAME TO tickets_old_fk;

      -- Step 2: create new table without the FK
      CREATE TABLE tickets (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id         TEXT    NOT NULL,
        channel_id       TEXT    UNIQUE NOT NULL,
        user_id          TEXT    NOT NULL,
        panel_id         INTEGER,
        category_id      INTEGER,
        number           INTEGER NOT NULL,
        status           TEXT    DEFAULT 'open',
        claimed_by       TEXT,
        close_reason     TEXT,
        last_activity_at INTEGER DEFAULT (unixepoch()),
        created_at       INTEGER DEFAULT (unixepoch()),
        closed_at        INTEGER
      );

      -- Step 3: copy all existing rows (NULL-safe for new columns)
      INSERT INTO tickets
        (id, guild_id, channel_id, user_id, panel_id, category_id, number, status, claimed_by, close_reason, last_activity_at, created_at, closed_at)
      SELECT
        id, guild_id, channel_id, user_id, panel_id, NULL, number, status, claimed_by, NULL, created_at, created_at, closed_at
      FROM tickets_old_fk;

      -- Step 4: restore indexes
      CREATE INDEX IF NOT EXISTS idx_tickets_channel      ON tickets(channel_id);
      CREATE INDEX IF NOT EXISTS idx_tickets_guild_usr    ON tickets(guild_id, user_id, status);
      CREATE INDEX IF NOT EXISTS idx_tickets_activity_at  ON tickets(last_activity_at, status);

      -- Step 5: drop old table
      DROP TABLE tickets_old_fk;
    `);

    db.pragma('foreign_keys = ON');
    console.log('[DB] tickets table migrated successfully.');
  } catch (err) {
    db.pragma('foreign_keys = ON');
    console.error('[DB] tickets migration failed (non-fatal, will retry on next start):', err);
  }
})();

// ── Migration: birthdays table — revert global-per-user back to per-guild ───
// A brief earlier revision of this feature made birthdays global (one row
// per user_id, shared across every server the bot is in). That was the
// wrong call — birthdays should stay scoped to the server they're set in.
// If a local bot.db still has that global schema (detected by the ABSENCE
// of a guild_id column on birthdays), drop both tables and let the
// CREATE TABLE IF NOT EXISTS above recreate the per-guild version.
// Whatever few birthdays were set during that window are lost — acceptable,
// since that revision never left development.
(function revertBirthdaysToPerGuild() {
  try {
    const cols = db.prepare(`PRAGMA table_info(birthdays)`).all() as Array<{ name: string }>;
    if (cols.length === 0) return; // table doesn't exist yet at all — nothing to revert
    const hasGuildCol = cols.some(c => c.name === 'guild_id');
    if (hasGuildCol) return; // already per-guild — nothing to do

    console.log('[DB] Reverting birthdays table to per-guild schema…');
    db.exec(`
      DROP TABLE IF EXISTS birthdays;
      DROP TABLE IF EXISTS birthday_greetings;
      CREATE TABLE birthdays (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        birth_month INTEGER NOT NULL,
        birth_day INTEGER NOT NULL,
        birth_year INTEGER,
        last_greeted_key TEXT,
        PRIMARY KEY (guild_id, user_id)
      );
    `);
    console.log('[DB] birthdays table reverted to per-guild.');
  } catch (err) {
    console.error('[DB] birthdays revert failed (non-fatal, will retry on next start):', err);
  }
})();

