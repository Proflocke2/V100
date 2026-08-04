/**
 * BACKUP — snapshot service.
 *
 * createSnapshot   — serialize all guild config to JSON, save to disk + DB
 * restoreSnapshot  — re-apply a saved snapshot (INSERT OR REPLACE per row)
 * exportSnapshot   — return JSON for /backup export
 * importSnapshot   — accept uploaded JSON, persist as a new version
 *
 * File naming: snapshot-{guild}-{version}-{ts}.json — versioned + timestamped,
 * NEVER overwritten.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import db from '../../database/db';
import * as Repo from './repository';
import { latestKnownVersion } from './migrations';
import { AttachmentBuilder, EmbedBuilder, type Guild } from 'discord.js';

const BACKUP_DIR = path.join(process.cwd(), 'backups');
if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });

/**
 * Tables that store per-guild config AND content. Anything in this list is
 * included in a snapshot. Add new tables here as the bot grows.
 *
 * Deliberately EXCLUDED (ephemeral/log noise, meaningless or harmful to
 * restore): automod_log, verify_log, sessions, wordle_sessions,
 * attacksim_log, attacksim_snapshot, raidsim_messages, sim_state,
 * schema_migrations, and the snapshots table itself (self-referential).
 * Also excluded on purpose: error_log (diagnostic noise, same reasoning as
 * automod_log) and bot_config (genuinely GLOBAL, not per-guild — nothing in
 * a single-guild snapshot could meaningfully restore it).
 */
const GUILD_TABLES = [
  'guilds',
  // Ticket system — panels, categories, forms, multi-panels, settings, live
  // tickets, tags, types, and the actual transcript TEXT of every ticket.
  'panels', 'panel_v2', 'panel_v2_cat', 'panel_v2_form', 'panel_v2_multi',
  'ticket_settings', 'tickets', 'ticket_messages', 'ticket_tags', 'ticket_types',
  'ticket_activity', 'ticket_surveys',
  // Economy — balances, streaks, shop, admin log, guild-wide settings
  'economy_users', 'daily_streaks', 'shop_items', 'shop_inventory',
  'eco_guild_settings', 'eco_admin_log', 'lottery', 'lottery_tickets',
  // Security & moderation
  'security_config', 'security_incidents', 'security_lockdown_state',
  'antinuke_config', 'antinuke_whitelist', 'antinuke_incidents',
  'anti_raid_config', 'automod3_config',
  'warnings', 'warn_config', 'mod_notes', 'sticky_mutes',
  'lockdown_channels', 'user_slowmode', 'inactivity_config', 'member_activity',
  // Kick/timeout/ban/warn history feeding /history + weighted mod-action scoring
  'mod_history',
  // Per-guild command disable/enable state
  'disabled_commands',
  // Reaction roles
  'reaction_role_panels', 'reaction_role_buttons',
  // Utility — saved text content lives here too (webhooks, quotes, polls)
  'saved_webhooks',
  'giveaways',
  'reminders',
  'quoteboard_config', 'quotes',
  'polls',
  // Staff activity tracking — live counters + weekly trend history
  'staff_activity', 'staff_activity_history', 'staff_sponsors',
  // Sticky messages
  'sticky_messages',
  // Staff reports
  'staff_reports',
  // Community suggestions — the votes table has no guild_id of its own,
  // scoped via suggestions.guild_id instead (see dumpGuildData below,
  // same pattern as ticket_messages).
  'suggestions', 'suggestion_votes',
  // Birthdays
  'birthdays',
  // Welcome & verification
  'welcome_settings', 'welcome_pending_roles',
  'verification_config',
  // Levels & stats
  'users',
  'stats_config', 'stats_channels',
  // Applications & multi-panels — includes the actual submitted answer TEXT
  'multipanels', 'multipanel_options',
  'applications', 'application_answers',
] as const;

const GUILD_TABLES_SET = new Set<string>(GUILD_TABLES);
function safeTableName(table: string): string {
  if (!GUILD_TABLES_SET.has(table)) throw new Error(`[backup] Rejected unknown table: ${table}`);
  return table;
}


interface SnapshotPayload {
  schemaVersion: string;
  guildId: string;
  version: string;
  createdAt: number;
  data: Record<string, unknown[]>;
}

function nextVersion(guildId: string): string {
  const existing = Repo.listForGuild(guildId);
  if (existing.length === 0) return `${latestKnownVersion()}-1`;
  // Find highest -N suffix
  const re = /^(.+)-(\d+)$/;
  const max = existing.reduce((acc, s) => {
    const m = re.exec(s.version);
    if (!m) return acc;
    const n = parseInt(m[2], 10);
    return n > acc ? n : acc;
  }, 0);
  return `${latestKnownVersion()}-${max + 1}`;
}

function dumpGuildData(guildId: string): { data: Record<string, unknown[]>; rows: number; tables: number } {
  const out: Record<string, unknown[]> = {};
  let rows = 0;
  let tables = 0;
  for (const table of GUILD_TABLES) {
    try {
      // Skip tables that don't have a guild_id column gracefully.
      const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      if (cols.length === 0) continue;
      const hasGuild = cols.some(c => c.name === 'guild_id');
      const hasIdAsGuild = table === 'guilds';
      let r: unknown[];
      if (table === 'ticket_messages') {
        // No guild_id column of its own — scoped via tickets.guild_id instead.
        // This is where the actual ticket TRANSCRIPT TEXT lives.
        r = db.prepare(
          'SELECT * FROM ticket_messages WHERE ticket_id IN (SELECT id FROM tickets WHERE guild_id = ?)',
        ).all(guildId);
      } else if (table === 'suggestion_votes') {
        // No guild_id column of its own — scoped via suggestions.guild_id instead.
        r = db.prepare(
          'SELECT * FROM suggestion_votes WHERE suggestion_id IN (SELECT id FROM suggestions WHERE guild_id = ?)',
        ).all(guildId);
      } else if (hasGuild) r = db.prepare(`SELECT * FROM ${table} WHERE guild_id = ?`).all(guildId);
      else if (hasIdAsGuild) r = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).all(guildId);
      else r = [];
      out[table] = r;
      rows += r.length;
      tables += 1;
    } catch {
      out[table] = [];
    }
  }
  return { data: out, rows, tables };
}

export function createSnapshot(guildId: string): { version: string; file: string; rows: number; tables: number } {
  const version = nextVersion(guildId);
  const ts = Date.now();
  const filename = `snapshot-${guildId}-${version}-${ts}.json`;
  const filepath = path.join(BACKUP_DIR, filename);

  const { data, rows, tables } = dumpGuildData(guildId);
  const payload: SnapshotPayload = {
    schemaVersion: latestKnownVersion(),
    guildId,
    version,
    createdAt: ts,
    data,
  };

  writeFileSync(filepath, JSON.stringify(payload, null, 2), 'utf-8');
  Repo.recordSnapshot({
    guild_id: guildId, version, file_path: filepath,
    rows, tables,
  });
  return { version, file: filename, rows, tables };
}

export function readSnapshotPayload(filePath: string): SnapshotPayload {
  const raw = readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as SnapshotPayload;
}

export function restoreSnapshot(guildId: string, version: string): { rows: number; failed: number } {
  const meta = Repo.getByVersion(guildId, version);
  if (!meta) throw new Error(`snapshot not found: ${version}`);
  const payload = readSnapshotPayload(meta.file_path);
  return applyPayload(guildId, payload);
}

const ALLOWED_IMPORT_TABLES = new Set<string>(GUILD_TABLES);

/**
 * Ensures every table referenced in GUILD_TABLES actually exists in SQLite
 * before a restore runs. Several tables are created lazily (only when their
 * command/handler is first used) rather than in the main db.exec() block —
 * e.g. daily_streaks is created on the first /daily call, warn_config on
 * the first /warn usage, etc. If a restore runs before any of those commands
 * have been used, the INSERT would fail silently (counted as "failed to
 * load") even though the data is valid and the table just hadn't been
 * created yet. Calling this once before the restore pass guarantees they
 * all exist and the data lands correctly.
 */
function ensureRestoreTablesExist(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_streaks (
      user_id TEXT NOT NULL, guild_id TEXT NOT NULL,
      streak INTEGER DEFAULT 1, last_claim INTEGER DEFAULT 0,
      PRIMARY KEY (user_id, guild_id)
    );
    CREATE TABLE IF NOT EXISTS antinuke_config (
      guild_id TEXT PRIMARY KEY,
      enabled INTEGER DEFAULT 0,
      log_channel_id TEXT,
      channel_delete_limit INTEGER DEFAULT 3,
      role_delete_limit INTEGER DEFAULT 3,
      ban_limit INTEGER DEFAULT 5,
      webhook_limit INTEGER DEFAULT 5,
      window_seconds INTEGER DEFAULT 10,
      action TEXT DEFAULT 'ban'
    );
    CREATE TABLE IF NOT EXISTS anti_raid_config (
      guild_id TEXT PRIMARY KEY,
      enabled INTEGER DEFAULT 0,
      threshold INTEGER DEFAULT 10,
      window_seconds INTEGER DEFAULT 10,
      action TEXT DEFAULT 'kick',
      min_age_minutes INTEGER DEFAULT 0,
      log_channel_id TEXT
    );
    CREATE TABLE IF NOT EXISTS automod3_config (
      guild_id TEXT PRIMARY KEY,
      punishment_profile TEXT DEFAULT '{"1":"warn","2":"timeout_1h","3":"ban"}',
      regex_filters TEXT DEFAULT '[]',
      spam_threshold INTEGER DEFAULT 5,
      spam_window_seconds INTEGER DEFAULT 3,
      anti_mass_ping INTEGER DEFAULT 0,
      mass_ping_limit INTEGER DEFAULT 5,
      phishing_filter INTEGER DEFAULT 0,
      anti_mass_dm INTEGER DEFAULT 0,
      log_channel_id TEXT,
      exempt_roles TEXT DEFAULT '[]'
    );
    CREATE TABLE IF NOT EXISTS warn_config (
      guild_id TEXT PRIMARY KEY,
      mute_threshold INTEGER DEFAULT 3,
      mute_duration_minutes INTEGER DEFAULT 60,
      ban_threshold INTEGER DEFAULT 5,
      kick_threshold INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS member_activity (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      last_active INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS shop_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      price INTEGER NOT NULL DEFAULT 0,
      type TEXT DEFAULT 'cosmetic',
      role_id TEXT,
      duration_hours INTEGER DEFAULT 0,
      level_required INTEGER DEFAULT 0,
      category TEXT DEFAULT 'General',
      stock INTEGER DEFAULT -1,
      repeatable INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS shop_inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      item_id INTEGER NOT NULL,
      purchased_at INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS lottery (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      prize INTEGER NOT NULL,
      ticket_price INTEGER NOT NULL DEFAULT 100,
      ends_at INTEGER NOT NULL,
      ended INTEGER DEFAULT 0,
      winner_id TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS lottery_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lottery_id INTEGER NOT NULL,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      purchased_at INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS sticky_messages (
      channel_id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      content TEXT NOT NULL,
      message_id TEXT,
      enabled INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS suggestions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      status_reason TEXT,
      message_id TEXT,
      channel_id TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS suggestion_votes (
      suggestion_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      vote INTEGER NOT NULL,
      PRIMARY KEY (suggestion_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS reaction_role_panels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      channel_id TEXT,
      message_id TEXT,
      title TEXT,
      description TEXT,
      color TEXT DEFAULT '#5865f2',
      created_at INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS reaction_role_buttons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      panel_id INTEGER NOT NULL,
      guild_id TEXT NOT NULL,
      role_id TEXT NOT NULL,
      label TEXT,
      emoji TEXT,
      style TEXT DEFAULT 'primary',
      created_at INTEGER DEFAULT (unixepoch())
    );
  `);
}

export function applyPayload(guildId: string, payload: SnapshotPayload): { rows: number; failed: number } {
  if (payload.guildId !== guildId) throw new Error('snapshot belongs to a different guild');

  // Create all lazy-init tables before attempting any inserts so no row
  // is rejected just because its table hadn't been initialized yet.
  ensureRestoreTablesExist();

  let rows = 0;
  let failed = 0;

  // SECURITY FIX: build per-table column allowlists from the live schema before the
  // transaction so JSON-supplied column names are never interpolated raw into SQL.
  const tableColumns = new Map<string, Set<string>>();
  for (const table of ALLOWED_IMPORT_TABLES) {
    try {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      tableColumns.set(table, new Set(cols.map(c => c.name)));
    } catch { tableColumns.set(table, new Set()); }
  }

  const tx = db.transaction(() => {
    for (const [table, list] of Object.entries(payload.data)) {
      if (!ALLOWED_IMPORT_TABLES.has(table)) continue;
      if (!Array.isArray(list) || list.length === 0) continue;
      const allowedCols = tableColumns.get(table) ?? new Set<string>();
      for (const r of list as Record<string, unknown>[]) {
        try {
          // Only include columns that exist in the live schema — no raw JSON keys in SQL
          const cols = Object.keys(r).filter(c => allowedCols.has(c));
          if (!cols.length) { failed++; continue; }
          const placeholders = cols.map(() => '?').join(', ');
          const values = cols.map(k => r[k] as any);
          db.prepare(`INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`).run(...values);
          rows++;
        } catch { failed++; }
      }
    }
  });
  tx();
  return { rows, failed };
}

export function importSnapshotJson(guildId: string, json: string): { version: string; rows: number; tables: number } {
  let payload: SnapshotPayload;
  try {
    payload = JSON.parse(json) as SnapshotPayload;
  } catch {
    throw new Error('invalid JSON');
  }
  if (!payload || typeof payload !== 'object' || !payload.guildId || !payload.data) {
    throw new Error('invalid snapshot');
  }
  if (payload.guildId !== guildId) throw new Error('wrong-guild');

  // Persist as a new versioned snapshot in our store
  const version = nextVersion(guildId);
  const ts = Date.now();
  const filename = `snapshot-${guildId}-${version}-${ts}.imported.json`;
  const filepath = path.join(BACKUP_DIR, filename);
  payload.version = version;
  writeFileSync(filepath, JSON.stringify(payload, null, 2), 'utf-8');

  const tables = Object.keys(payload.data).length;
  const rows = Object.values(payload.data).reduce(
    (a, list) => a + (Array.isArray(list) ? list.length : 0), 0,
  );
  Repo.recordSnapshot({ guild_id: guildId, version, file_path: filepath, rows, tables });
  return { version, rows, tables };
}

export function deleteSnapshot(guildId: string, version: string): void {
  Repo.deleteByVersion(guildId, version);
  // We deliberately keep the JSON file on disk — never overwrite, never delete.
}

// ── Auto-Backup scheduler ────────────────────────────────────────────────────

function isAutoBackupDue(intervalMinutes: number, lastRunTs: number | null, now: Date): boolean {
  if (lastRunTs === null) return true; // never run before
  const elapsedMinutes = (now.getTime() / 1000 - lastRunTs) / 60;
  return elapsedMinutes >= intervalMinutes;
}

/**
 * Call this from a scheduler (every 5 min — see handlers/schedulers.ts) —
 * finer than the actual interval anyone will configure, so a 15-minute
 * setting still fires within 5 minutes of being due, not up to an hour late.
 * For every guild with auto-backup enabled and due, creates a snapshot and
 * delivers it either to a channel or by DM, per that guild's configuration.
 */
export async function runAutoBackupTick(guilds: Map<string, Guild>): Promise<void> {
  const now = new Date();
  const guildIds = Repo.getAutoBackupGuildIds();

  for (const guildId of guildIds) {
    const guild = guilds.get(guildId);
    if (!guild) continue;

    const cfg = Repo.getAutoBackupConfig(guildId);
    if (!cfg.enabled) continue;
    if (!isAutoBackupDue(cfg.intervalMinutes, cfg.lastRunTs, now)) continue;

    try {
      const snap = createSnapshot(guildId);
      const meta = Repo.getByVersion(guildId, snap.version);
      if (!meta) continue;

      const buf = Buffer.from(readFileSync(meta.file_path));
      const attachment = new AttachmentBuilder(buf, { name: `auto-backup-${guildId}-${snap.version}.json` });
      const embed = new EmbedBuilder()
        .setTitle('📦 Automatic backup')
        .setColor('#ff6b35')
        .setDescription(
          `**${guild.name}** — version \`${snap.version}\`\n` +
          `${snap.tables} tables • ${snap.rows} rows\n\nThis includes all server settings AND text content ` +
          '(ticket transcripts, tags, applications, quotes, etc). Ready to download below — no `/backup export` needed.',
        )
        .setTimestamp();

      if (cfg.delivery === 'channel' && cfg.channel) {
        const ch = guild.channels.cache.get(cfg.channel);
        if (ch && ch.isTextBased()) {
          await ch.send({ embeds: [embed], files: [attachment] }).catch(() => {});
        }
      } else if (cfg.delivery === 'dm' && cfg.recipient) {
        const member = await guild.members.fetch(cfg.recipient).catch(() => null);
        if (member) {
          await member.send({ embeds: [embed], files: [attachment] }).catch(() => {
            // DMs closed — the snapshot is still safely saved server-side (/backup list).
          });
        }
      }
    } catch (err) {
      console.error(`[AutoBackup] Failed for guild ${guildId}:`, err);
    } finally {
      // Mark as run even on delivery failure — the snapshot itself succeeded
      // and we don't want to spam retries every scheduler tick.
      Repo.setAutoBackupLastRunTs(guildId, Math.floor(now.getTime() / 1000));
    }
  }
}
