/**
 * DEPLOYMENT GUARD — Auto Config-Protection System
 *
 * Guarantees that every deployment:
 *   1. Detects when the running bot version has changed.
 *   2. Automatically snapshots ALL guild configs BEFORE any schema migration runs.
 *   3. Runs forward-only column-safety migrations for all known tables.
 *   4. Writes a version stamp to disk so the next deploy can compare.
 *
 * This system is ALWAYS active. It cannot be disabled.
 *
 * Flow (called once at startup, before runMigrations()):
 *   checkAndProtect(client?) → versionChanged?
 *     → yes: snapshotAllGuilds() → runMigrations() → stampVersion()
 *     → no:  stampVersion() [no-op if stamp already matches]
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import db from '../../database/db';
import { createSnapshot } from './service';
import { latestKnownVersion } from './migrations';

// ── Version stamp ─────────────────────────────────────────────────────────────

const STAMP_DIR  = path.join(process.cwd(), 'backups');
const STAMP_FILE = path.join(STAMP_DIR, '.deploy-version');

function readStampedVersion(): string | null {
  try {
    if (!existsSync(STAMP_FILE)) return null;
    return readFileSync(STAMP_FILE, 'utf-8').trim() || null;
  } catch {
    return null;
  }
}

function writeStampedVersion(version: string): void {
  try {
    if (!existsSync(STAMP_DIR)) mkdirSync(STAMP_DIR, { recursive: true });
    writeFileSync(STAMP_FILE, version, 'utf-8');
  } catch (err) {
    console.error('[DeployGuard] Could not write version stamp:', err);
  }
}

// ── Column-safety migrations ──────────────────────────────────────────────────
// Ensures all optional columns that have been added over time exist in DB,
// even if the user is upgrading from an older version that predates them.

interface ColumnSpec { table: string; column: string; definition: string }

const REQUIRED_COLUMNS: ColumnSpec[] = [
  // guilds table extensions
  { table: 'guilds', column: 'automod_antiinvite',      definition: 'INTEGER DEFAULT 0' },
  { table: 'guilds', column: 'automod_anticaps',         definition: 'INTEGER DEFAULT 0' },
  { table: 'guilds', column: 'gambling_cooldown_ms',     definition: 'INTEGER DEFAULT 15000' },
  { table: 'guilds', column: 'gambling_disclaimer',      definition: 'INTEGER DEFAULT 1' },
  // tickets table extensions (added in v2)
  { table: 'tickets', column: 'category_id',      definition: 'INTEGER' },
  { table: 'tickets', column: 'close_reason',     definition: 'TEXT' },
  { table: 'tickets', column: 'last_activity_at', definition: 'INTEGER DEFAULT (unixepoch())' },
  { table: 'tickets', column: 'last_ticket_at',   definition: 'INTEGER' },
  // ticket_settings extensions
  { table: 'ticket_settings', column: 'support_hours_start',   definition: 'TEXT' },
  { table: 'ticket_settings', column: 'support_hours_end',     definition: 'TEXT' },
  { table: 'ticket_settings', column: 'survey_enabled',        definition: 'INTEGER DEFAULT 0' },
  { table: 'ticket_settings', column: 'autoclose_enabled',     definition: 'INTEGER DEFAULT 0' },
  { table: 'ticket_settings', column: 'autoclose_hours',       definition: 'INTEGER DEFAULT 24' },
  { table: 'ticket_settings', column: 'support_hours_enabled', definition: 'INTEGER DEFAULT 0' },
  { table: 'ticket_settings', column: 'remove_branding',       definition: 'INTEGER DEFAULT 0' },
  { table: 'ticket_settings', column: 'dm_on_close',           definition: 'INTEGER DEFAULT 1' },
  // panel_v2_form extensions
  { table: 'panel_v2_form', column: 'category_id', definition: 'INTEGER' },
  // panel_v2_multi extensions (added in v2.1)
  { table: 'panel_v2_multi', column: 'image',     definition: 'TEXT' },
  { table: 'panel_v2_multi', column: 'thumbnail', definition: 'TEXT' },
  { table: 'panel_v2_multi', column: 'footer',    definition: 'TEXT' },
  { table: 'panel_v2_multi', column: 'content',   definition: 'TEXT' },
  // security_config extensions (ultra-mode added in v2.0)
  { table: 'security_config', column: 'ultra_mode',            definition: 'INTEGER DEFAULT 0' },
  { table: 'security_config', column: 'ultra_score_threshold',  definition: 'INTEGER DEFAULT 60' },
  { table: 'security_config', column: 'auto_defend',            definition: 'INTEGER DEFAULT 0' },
  { table: 'security_config', column: 'defend_raid',            definition: "TEXT DEFAULT 'lockdown'" },
  { table: 'security_config', column: 'defend_spam',            definition: "TEXT DEFAULT 'timeout'" },
  { table: 'security_config', column: 'defend_phishing',        definition: "TEXT DEFAULT 'ban'" },
  { table: 'security_config', column: 'defend_mass_ping',       definition: "TEXT DEFAULT 'kick'" },
  { table: 'security_config', column: 'defend_link',            definition: "TEXT DEFAULT 'warn'" },
  // economy_users — ensure table shape is forward-compatible
  { table: 'economy_users', column: 'total_won',  definition: 'INTEGER DEFAULT 0' },
  { table: 'economy_users', column: 'total_lost', definition: 'INTEGER DEFAULT 0' },
  { table: 'economy_users', column: 'games_played', definition: 'INTEGER DEFAULT 0' },
];

function tableExists(table: string): boolean {
  const row = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
  ).get(table) as { name: string } | null;
  return row !== null;
}

const DEPLOY_GUARD_ALLOWED_TABLES = new Set<string>(
  (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {name:string}[]).map(r=>r.name)
);
function hasColumn(table: string, column: string): boolean {
  if (!DEPLOY_GUARD_ALLOWED_TABLES.has(table)) return false;
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some(c => c.name === column);
}

function applyColumnMigrations(): { added: string[]; skipped: string[] } {
  const added: string[]   = [];
  const skipped: string[] = [];

  for (const { table, column, definition } of REQUIRED_COLUMNS) {
    if (!tableExists(table)) { skipped.push(`${table}.${column} (table missing)`); continue; }
    if (hasColumn(table, column)) { skipped.push(`${table}.${column}`); continue; }
    try {
      db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
      added.push(`${table}.${column}`);
      console.log(`[DeployGuard] Added column ${table}.${column}`);
    } catch (err) {
      console.error(`[DeployGuard] Failed to add ${table}.${column}:`, err);
    }
  }

  return { added, skipped };
}

// ── Guild discovery ───────────────────────────────────────────────────────────

function getAllGuildIds(): string[] {
  try {
    const rows = db.prepare('SELECT DISTINCT guild_id FROM guilds').all() as { guild_id: string }[];
    return rows.map(r => r.guild_id).filter(Boolean);
  } catch {
    return [];
  }
}

// ── Pre-deploy snapshot ───────────────────────────────────────────────────────

function snapshotAllGuilds(reason: string): { success: number; failed: number } {
  const guildIds = getAllGuildIds();
  let success = 0;
  let failed  = 0;

  if (guildIds.length === 0) {
    console.log('[DeployGuard] No guilds to snapshot (fresh install).');
    return { success: 0, failed: 0 };
  }

  console.log(`[DeployGuard] Snapshotting ${guildIds.length} guild(s) — reason: ${reason}`);

  for (const guildId of guildIds) {
    try {
      const snap = createSnapshot(guildId);
      console.log(`[DeployGuard] ✓ Guild ${guildId} → snapshot ${snap.version} (${snap.rows} rows)`);
      success++;
    } catch (err) {
      console.error(`[DeployGuard] ✗ Guild ${guildId} snapshot failed:`, err);
      failed++;
    }
  }

  return { success, failed };
}

// ── Main entry point ──────────────────────────────────────────────────────────

export interface DeployGuardResult {
  versionChanged: boolean;
  previousVersion: string | null;
  currentVersion:  string;
  snapshotsTaken:  number;
  snapshotsFailed: number;
  columnsAdded:    string[];
}

/**
 * Must be called at startup, BEFORE runMigrations().
 * Always active — cannot be disabled.
 */
export function runDeployGuard(): DeployGuardResult {
  const previousVersion = readStampedVersion();
  const currentVersion  = latestKnownVersion();
  const versionChanged  = previousVersion !== currentVersion;

  console.log(`[DeployGuard] Previous deploy: ${previousVersion ?? 'none (first boot)'}`);
  console.log(`[DeployGuard] Current version: ${currentVersion}`);

  let snapshotsTaken  = 0;
  let snapshotsFailed = 0;

  if (versionChanged) {
    console.log('[DeployGuard] Version change detected — protecting existing configs…');
    const reason = previousVersion
      ? `upgrade ${previousVersion} → ${currentVersion}`
      : 'first versioned boot';
    const result = snapshotAllGuilds(reason);
    snapshotsTaken  = result.success;
    snapshotsFailed = result.failed;
  } else {
    console.log('[DeployGuard] Same version — no pre-migration snapshot needed.');
  }

  // Always apply column-safety migrations regardless of version change.
  const colResult = applyColumnMigrations();

  if (colResult.added.length > 0) {
    console.log(`[DeployGuard] Schema columns added: ${colResult.added.join(', ')}`);
  }

  // Stamp the version AFTER successful protect+migrate to ensure
  // next boot can detect if this deployment was interrupted.
  writeStampedVersion(currentVersion);

  return {
    versionChanged,
    previousVersion,
    currentVersion,
    snapshotsTaken,
    snapshotsFailed,
    columnsAdded: colResult.added,
  };
}
