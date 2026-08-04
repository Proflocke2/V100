/**
 * BACKUP — migration runner.
 *
 * Forward-only schema migrations. New versions append below; once applied
 * (tracked in schema_migrations) they're never re-run.
 *
 * Naming: semver-like "MAJOR.MINOR.PATCH". Bump PATCH for additive column
 * adds, MINOR for new tables, MAJOR for breaking changes.
 */

import db from '../../database/db';
import * as Repo from './repository';

interface Migration {
  version: string;
  description: string;
  up: () => void;
}

const migrations: Migration[] = [
  {
    version: '1.0.0',
    description: 'Initial schema baseline (no-op — created by db.ts on first boot)',
    up: () => { /* baseline */ },
  },
  {
    version: '1.1.0',
    description: 'Add ticket_settings + welcome_settings + panel_v2_form tables',
    up: () => {
      // These tables are guarded with CREATE TABLE IF NOT EXISTS in their
      // module repos — running this migration just records the version.
    },
  },
  {
    version: '1.2.0',
    description: 'Music module removed — no-op',
    up: () => { /* music module was removed */ },
  },
  {
    version: '2.0.0',
    description: 'Economy fixes: BJ timeout, atomic ticket insert, memory leak guards',
    up: () => { /* applied via deployGuard column migrations and code fixes */ },
  },
  {
    version: '2.1.0',
    description: 'Deployment guard: auto config-protection snapshot system',
    up: () => { /* deployGuard.ts handles column safety; recorded here for version tracking */ },
  },
  {
    version: '2.2.0',
    description: 'Per-guild command disable/enable (disabled_commands table)',
    up: () => { /* table is guarded with CREATE TABLE IF NOT EXISTS in db.ts */ },
  },
  {
    version: '2.3.0',
    description: 'Persistent kick/timeout history for /history (mod_history table)',
    up: () => { /* table is guarded with CREATE TABLE IF NOT EXISTS in db.ts */ },
  },
  {
    version: '2.4.0',
    description: 'Staff mod-action tracking (kick/timeout/warn/ban), weekly history snapshots, /team-activity profile, configurable leaderboard metric, ticket anti-gaming, quota DM fallback',
    up: () => { /* tables/columns are guarded with CREATE TABLE/ALTER TABLE IF NOT EXISTS in db.ts */ },
  },
  {
    version: '2.5.0',
    description: '/suggest community suggestions (suggestions + suggestion_votes tables, suggestions_* guild config)',
    up: () => { /* tables/columns are guarded with CREATE TABLE/ALTER TABLE IF NOT EXISTS in db.ts */ },
  },
  {
    version: '2.6.0',
    description: 'Self-built error tracking (error_log + bot_config tables, /errorlog command)',
    up: () => { /* tables are guarded with CREATE TABLE IF NOT EXISTS in db.ts */ },
  },
  {
    version: '2.7.0',
    description: '/birthday feature (birthdays table, birthday_* guild config, daily scheduler)',
    up: () => { /* tables/columns are guarded with CREATE TABLE/ALTER TABLE IF NOT EXISTS in db.ts */ },
  },
  {
    version: '2.7.1',
    description: 'birthdays reverted to per-guild (a brief global-per-user revision was wrong — birthdays should stay scoped to the server they were set in)',
    up: () => { /* handled by revertBirthdaysToPerGuild() in db.ts */ },
  },
  {
    version: '2.8.0',
    description: 'Per-channel automod/security exceptions (automod_channel_exceptions table), configurable backup interval + auto-post channel',
    up: () => { /* tables/columns are guarded with CREATE TABLE/ALTER TABLE IF NOT EXISTS in db.ts */ },
  },
  {
    version: '2.9.0',
    description: 'Config audit log (config_audit_log table), /config-audit command, log-channel picker in /security config, updated /help guide',
    up: () => { /* tables are guarded with CREATE TABLE IF NOT EXISTS in db.ts */ },
  },
  {
    version: '2.10.0',
    description: 'Suggestions vote role (suggestions_vote_role column), eager polls/lottery table init, ticket-wizard select routing fix + button main menu',
    up: () => { /* column is guarded with ALTER TABLE IF NOT EXISTS in db.ts */ },
  },
];

/**
 * Run all pending migrations. Idempotent — already-applied versions are skipped.
 * Returns { from, to, applied[] } so callers can report.
 */
export function runMigrations(): { from: string; to: string; applied: string[] } {
  const applied: string[] = [];
  const before = currentVersion();

  for (const m of migrations) {
    if (Repo.isMigrationApplied(m.version)) continue;
    try {
      m.up();
      Repo.markMigrationApplied(m.version);
      applied.push(m.version);
      console.log(`[Migrations] Applied ${m.version} — ${m.description}`);
    } catch (err) {
      console.error(`[Migrations] FAILED at ${m.version}:`, err);
      throw new Error(`Migration ${m.version} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const after = currentVersion();
  return { from: before, to: after, applied };
}

export function currentVersion(): string {
  const all = Repo.listAppliedMigrations();
  return all.length > 0 ? all[all.length - 1] : '0.0.0';
}

export function latestKnownVersion(): string {
  return migrations[migrations.length - 1].version;
}

export function listMigrations(): ReadonlyArray<Pick<Migration, 'version' | 'description'>> {
  return migrations.map(({ version, description }) => ({ version, description }));
}
