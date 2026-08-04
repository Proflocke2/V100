/**
 * modules/staffActivity/repository.ts
 *
 * Pure data-access layer for the Staff Activity Tracking extension.
 * No Discord.js imports here on purpose — keeps this testable and reusable
 * outside of an interaction/event context (e.g. from the scheduler).
 */

import db, { getGuild, setGuildValue } from '../../database/db';
import { weekStartUnix } from './weekUtils';

export type LeaderboardMetric = 'tickets' | 'sponsors' | 'mod_actions' | 'combined';

export interface StaffActivityConfig {
  ticketsEnabled: boolean;
  sponsorsEnabled: boolean;
  modActionsEnabled: boolean;
  leaderboardEnabled: boolean;
  leaderboardInterval: 'weekly' | 'monthly' | 'manual';
  leaderboardChannel: string | null;
  leaderboardMetric: LeaderboardMetric;
  quotaEnabled: boolean;
  quotaMinTickets: number;
  quotaRole: string | null;
  quotaReminderDay: number;   // 0=Sunday..6=Saturday (UTC)
  quotaReminderHour: number;  // 0-23 (UTC)
  quotaFallbackChannel: string | null;
  lastResetWeek: string | null;
  lastReminderWeek: string | null;
  lastLeaderboardPeriod: string | null;
}

export interface StaffActivityRow {
  guild_id: string;
  user_id: string;
  weekly_tickets: number;
  total_tickets: number;
  weekly_sponsors: number;
  total_sponsors: number;
  weekly_mod_actions: number;
  total_mod_actions: number;
}

/** Reads all staff-activity related config for a guild (creates the guild row if missing). */
export function getConfig(guildId: string): StaffActivityConfig {
  const g = getGuild(guildId);
  return {
    ticketsEnabled:        !!g.staff_tracking_tickets_enabled,
    sponsorsEnabled:       !!g.staff_tracking_sponsors_enabled,
    modActionsEnabled:     !!g.staff_mod_actions_enabled,
    leaderboardEnabled:    !!g.staff_leaderboard_enabled,
    leaderboardInterval:   (g.staff_leaderboard_interval ?? 'manual') as StaffActivityConfig['leaderboardInterval'],
    leaderboardChannel:    g.staff_leaderboard_channel ?? null,
    leaderboardMetric:     (g.staff_leaderboard_metric ?? 'combined') as LeaderboardMetric,
    quotaEnabled:          !!g.staff_quota_enabled,
    quotaMinTickets:       g.staff_quota_min_tickets ?? 5,
    quotaRole:             g.staff_quota_role ?? null,
    quotaReminderDay:      g.staff_quota_reminder_day ?? 6,
    quotaReminderHour:     g.staff_quota_reminder_hour ?? 18,
    quotaFallbackChannel:  g.staff_quota_fallback_channel ?? null,
    lastResetWeek:         g.staff_last_reset_week ?? null,
    lastReminderWeek:      g.staff_last_reminder_week ?? null,
    lastLeaderboardPeriod: g.staff_last_leaderboard_period ?? null,
  };
}

/** Generic setter re-exported for the /team-activity config subcommands. */
export function setConfigValue(
  guildId: string,
  key:
    | 'staff_tracking_tickets_enabled' | 'staff_tracking_sponsors_enabled'
    | 'staff_mod_actions_enabled'
    | 'staff_leaderboard_enabled' | 'staff_leaderboard_interval' | 'staff_leaderboard_channel'
    | 'staff_leaderboard_metric'
    | 'staff_quota_enabled' | 'staff_quota_min_tickets' | 'staff_quota_role'
    | 'staff_quota_reminder_day' | 'staff_quota_reminder_hour' | 'staff_quota_fallback_channel',
  value: unknown,
): void {
  setGuildValue(guildId, key, value);
}

function getOrCreateRow(guildId: string, userId: string): void {
  db.prepare(
    'INSERT OR IGNORE INTO staff_activity (guild_id, user_id) VALUES (?, ?)',
  ).run(guildId, userId);
}

/** +1 weekly & total ticket count for a staff member. */
export function incrementTicketClose(guildId: string, userId: string): void {
  getOrCreateRow(guildId, userId);
  db.prepare(`
    UPDATE staff_activity
    SET weekly_tickets = weekly_tickets + 1,
        total_tickets  = total_tickets + 1,
        updated_at     = unixepoch()
    WHERE guild_id = ? AND user_id = ?
  `).run(guildId, userId);
}

/** Registers a sponsor donation and +1's the registering staff member's sponsor count. */
export function addSponsor(
  guildId: string,
  sponsorUserId: string,
  donation: string,
  registeredBy: string,
): void {
  db.prepare(
    'INSERT INTO staff_sponsors (guild_id, user_id, donation, registered_by) VALUES (?, ?, ?, ?)',
  ).run(guildId, sponsorUserId, donation, registeredBy);

  getOrCreateRow(guildId, registeredBy);
  db.prepare(`
    UPDATE staff_activity
    SET weekly_sponsors = weekly_sponsors + 1,
        total_sponsors  = total_sponsors + 1,
        updated_at      = unixepoch()
    WHERE guild_id = ? AND user_id = ?
  `).run(guildId, registeredBy);
}

/** +1 weekly & total mod-action count for a staff member (kick/timeout/warn/ban — all weighted equally here; weighting only applies at leaderboard-scoring time, see getLeaderboard). */
export function incrementModAction(guildId: string, userId: string): void {
  getOrCreateRow(guildId, userId);
  db.prepare(`
    UPDATE staff_activity
    SET weekly_mod_actions = weekly_mod_actions + 1,
        total_mod_actions  = total_mod_actions + 1,
        updated_at         = unixepoch()
    WHERE guild_id = ? AND user_id = ?
  `).run(guildId, userId);
}

/** Single staff member's raw counters — undefined if they have no activity yet. Used by /team-activity profile. */
export function getActivity(guildId: string, userId: string): StaffActivityRow | undefined {
  return db.prepare(
    'SELECT * FROM staff_activity WHERE guild_id = ? AND user_id = ?',
  ).get(guildId, userId) as StaffActivityRow | undefined;
}

export type LeaderboardPeriod = 'weekly' | 'total';

/**
 * Top N staff members for this guild, ranked by the given metric.
 *
 * 'mod_actions' and 'combined' use a weighted mod-action score computed at
 * query time from `mod_history` (ban=2 points, kick/timeout/warn=1) rather
 * than the raw weekly_mod_actions/total_mod_actions counters — those stay a
 * plain unweighted count for display, per design (see recordModAction).
 * For period='weekly' the score only counts mod_history rows since this
 * week's Monday 00:00 UTC; for 'total' it counts everything.
 */
export function getLeaderboard(
  guildId: string,
  period: LeaderboardPeriod,
  metric: LeaderboardMetric = 'combined',
  limit = 10,
): StaffActivityRow[] {
  const ticketCol  = period === 'weekly' ? 'weekly_tickets'  : 'total_tickets';
  const sponsorCol = period === 'weekly' ? 'weekly_sponsors' : 'total_sponsors';
  const sinceTs = period === 'weekly' ? weekStartUnix() : 0;

  return db.prepare(`
    WITH scored AS (
      SELECT sa.*,
        (SELECT COALESCE(SUM(CASE WHEN mh.action = 'ban' THEN 2 ELSE 1 END), 0)
           FROM mod_history mh
          WHERE mh.guild_id = sa.guild_id AND mh.moderator_id = sa.user_id
            AND mh.created_at >= ?) AS mod_score
      FROM staff_activity sa
      WHERE sa.guild_id = ?
    )
    SELECT * FROM scored
    WHERE (${ticketCol} > 0 OR ${sponsorCol} > 0 OR mod_score > 0)
    ORDER BY
      CASE ?
        WHEN 'tickets'     THEN ${ticketCol}
        WHEN 'sponsors'    THEN ${sponsorCol}
        WHEN 'mod_actions' THEN mod_score
        ELSE (${ticketCol} + ${sponsorCol} + mod_score)
      END DESC
    LIMIT ?
  `).all(sinceTs, guildId, metric, limit) as StaffActivityRow[];
}

/** All staff-activity rows for a guild (used by the quota check). */
export function getAllActivity(guildId: string): StaffActivityRow[] {
  return db.prepare('SELECT * FROM staff_activity WHERE guild_id = ?').all(guildId) as StaffActivityRow[];
}

/** Resets weekly_tickets, weekly_sponsors and weekly_mod_actions to 0 for every staff member in this guild. Totals are untouched. */
export function resetWeeklyCounters(guildId: string): void {
  db.prepare(
    'UPDATE staff_activity SET weekly_tickets = 0, weekly_sponsors = 0, weekly_mod_actions = 0, updated_at = unixepoch() WHERE guild_id = ?',
  ).run(guildId);
}

/** Every guild that has ANY staff-activity feature switched on — the scheduler only needs to look at these. */
export function getActiveGuildIds(): string[] {
  const rows = db.prepare(`
    SELECT id FROM guilds
    WHERE staff_tracking_tickets_enabled = 1
       OR staff_tracking_sponsors_enabled = 1
       OR staff_mod_actions_enabled = 1
       OR staff_leaderboard_enabled = 1
       OR staff_quota_enabled = 1
  `).all() as Array<{ id: string }>;
  return rows.map(r => r.id);
}

// ── Historical weekly snapshots ──────────────────────────────────────────────

export interface StaffActivityHistoryRow {
  week_key: string;
  tickets: number;
  sponsors: number;
  mod_actions: number;
}

/**
 * Copies every staff member's CURRENT weekly_* counters into
 * staff_activity_history before they get wiped by resetWeeklyCounters().
 * This is what makes /team-activity profile's 4-week trend possible — the
 * live staff_activity row only ever holds "this week", never past weeks.
 * Rows with zero activity that week are skipped (no point in history noise).
 */
export function snapshotWeek(guildId: string, weekKey: string): void {
  const rows = getAllActivity(guildId);
  const insert = db.prepare(
    'INSERT INTO staff_activity_history (guild_id, user_id, week_key, tickets, sponsors, mod_actions) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const tx = db.transaction((activityRows: StaffActivityRow[]) => {
    for (const r of activityRows) {
      if (r.weekly_tickets === 0 && r.weekly_sponsors === 0 && r.weekly_mod_actions === 0) continue;
      insert.run(guildId, r.user_id, weekKey, r.weekly_tickets, r.weekly_sponsors, r.weekly_mod_actions);
    }
  });
  tx(rows);
}

/** Last N weekly snapshots for one staff member, most recent first — used for the /team-activity profile trend. */
export function getUserHistory(guildId: string, userId: string, weeks = 4): StaffActivityHistoryRow[] {
  return db.prepare(
    'SELECT week_key, tickets, sponsors, mod_actions FROM staff_activity_history WHERE guild_id = ? AND user_id = ? ORDER BY week_key DESC LIMIT ?',
  ).all(guildId, userId, weeks) as StaffActivityHistoryRow[];
}

// ── Internal scheduler bookkeeping ───────────────────────────────────────────
// These three are written only by the scheduler itself (never by a command),
// so they're deliberately kept out of the public setConfigValue() whitelist
// and use direct, fixed-column UPDATEs instead.

export function setLastResetWeek(guildId: string, weekKey: string): void {
  db.prepare('UPDATE guilds SET staff_last_reset_week = ? WHERE id = ?').run(weekKey, guildId);
}

export function setLastReminderWeek(guildId: string, weekKey: string): void {
  db.prepare('UPDATE guilds SET staff_last_reminder_week = ? WHERE id = ?').run(weekKey, guildId);
}

export function setLastLeaderboardPeriod(guildId: string, periodKey: string): void {
  db.prepare('UPDATE guilds SET staff_last_leaderboard_period = ? WHERE id = ?').run(periodKey, guildId);
}
