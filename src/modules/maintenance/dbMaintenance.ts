/**
 * modules/maintenance/dbMaintenance.ts
 *
 * Keeps bot.db small over time. Two jobs, run together daily (see
 * handlers/schedulers.ts → startDbMaintenanceScheduler):
 *
 *   pruneOldData() — deletes rows from tables that are deliberately
 *   log/transient in nature (not real config or history a server owner
 *   would want kept — these are the exact same tables already excluded
 *   from /backup snapshots, see modules/backup/service.ts for why each one
 *   is considered "safe to lose").
 *
 *   vacuumDatabase() — SQLite doesn't shrink the file automatically after
 *   deletes (freed pages just get reused internally). VACUUM rewrites the
 *   file without the free pages, which is what actually reduces bot.db's
 *   size on disk, which matters for Render's free tier (ephemeral disk).
 *
 * Retention windows are intentionally short for these tables — they're all
 * either test/simulation artifacts or rolling activity logs, not anything
 * a server owner would need to look back further than this on.
 */

import db from '../../database/db';

const DAY = 86_400;

interface PruneResult {
  table: string;
  deleted: number;
}

export function pruneOldData(): { results: PruneResult[]; totalDeleted: number } {
  const now = Math.floor(Date.now() / 1000);
  const today = Math.floor(Date.now() / 86_400_000); // matches wordle.ts's day-number format

  const jobs: Array<{ table: string; sql: string; param: number }> = [
    { table: 'automod_log',        sql: 'DELETE FROM automod_log WHERE created_at < ?',        param: now - 30 * DAY },
    { table: 'verify_log',         sql: 'DELETE FROM verify_log WHERE timestamp < ?',           param: now - 30 * DAY },
    { table: 'attacksim_log',      sql: 'DELETE FROM attacksim_log WHERE created_at < ?',       param: now - 7 * DAY },
    { table: 'attacksim_snapshot', sql: 'DELETE FROM attacksim_snapshot WHERE created_at < ?',  param: now - 7 * DAY },
    { table: 'raidsim_messages',   sql: 'DELETE FROM raidsim_messages WHERE created_at < ?',    param: now - 7 * DAY },
    { table: 'sim_state',          sql: 'DELETE FROM sim_state WHERE created_at < ?',           param: now - 7 * DAY },
    { table: 'wordle_sessions',    sql: 'DELETE FROM wordle_sessions WHERE day < ?',            param: today - 30 },
    // error_log rows are diagnostic, not history a server owner needs to
    // keep — 30 days is enough to notice and investigate a recurring issue.
    { table: 'error_log',          sql: 'DELETE FROM error_log WHERE created_at < ?',           param: now - 30 * DAY },
  ];

  const results: PruneResult[] = [];
  let totalDeleted = 0;

  for (const job of jobs) {
    try {
      const info = db.prepare(job.sql).run(job.param);
      results.push({ table: job.table, deleted: info.changes });
      totalDeleted += info.changes;
    } catch {
      // Table might not exist yet if that feature was never used on this
      // install — not an error, just nothing to prune.
      results.push({ table: job.table, deleted: 0 });
    }
  }

  return { results, totalDeleted };
}

/**
 * Rewrites bot.db without free/deleted pages, shrinking the file on disk.
 * Cheap for a bot-sized SQLite file (low single-digit MB), so safe to run
 * on a simple daily schedule rather than trying to be clever about when
 * it's "worth it".
 */
export function vacuumDatabase(): void {
  db.exec('VACUUM');
}
