/**
 * modules/staffActivity/weekUtils.ts
 *
 * Small UTC-based date helpers. Everything here is deliberately timezone-fixed
 * to UTC so that "day X at hour Y" behaves the same regardless of where the
 * bot host or the guild's members are located — avoids the classic DST /
 * local-timezone footgun for a background scheduler.
 */

/** ISO week string, e.g. '2026-W28'. Used as a simple "already ran this week?" guard. */
export function isoWeekKey(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7; // Monday=1 .. Sunday=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/** Month key, e.g. '2026-07'. Used as a simple "already posted this month?" guard. */
export function monthKey(date: Date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * True once we've reached (or passed) the configured UTC weekday+hour for the
 * CURRENT week, and we haven't already fired for that week yet.
 * day: 0=Sunday..6=Saturday, matches Date#getUTCDay().
 */
export function isReminderDue(day: number, hour: number, lastFiredWeek: string | null, now: Date = new Date()): boolean {
  const currentWeek = isoWeekKey(now);
  if (lastFiredWeek === currentWeek) return false;
  return now.getUTCDay() === day && now.getUTCHours() >= hour;
}

/** True once we've crossed into a new ISO week compared to what was last recorded. */
export function isNewWeek(lastWeek: string | null, now: Date = new Date()): boolean {
  return lastWeek !== isoWeekKey(now);
}

/** True once we've crossed into a new calendar month compared to what was last recorded. */
export function isNewMonth(lastMonth: string | null, now: Date = new Date()): boolean {
  return lastMonth !== monthKey(now);
}

/**
 * Unix seconds for Monday 00:00:00 UTC of the ISO week containing `date`.
 *
 * Used to scope the weighted mod-action leaderboard score to "this week"
 * without needing a separately stored reset timestamp — computed at query
 * time from mod_history, so a future change to the weighting rules never
 * needs a backfill migration.
 */
export function weekStartUnix(date: Date = new Date()): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7; // Monday=1..Sunday=7
  d.setUTCDate(d.getUTCDate() - dayNum + 1); // back up to this week's Monday
  return Math.floor(d.getTime() / 1000);
}
