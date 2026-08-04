/**
 * modules/birthday/repository.ts
 *
 * Pure data-access layer for /birthday. No Discord.js imports here on
 * purpose — same shape as every other repository.ts in this project.
 */

import db, { getGuild, setGuildValue } from '../../database/db';
import { isBirthdayOnDayKey } from './dateUtils';

export interface BirthdayConfig {
  enabled: boolean;
  channel: string | null;
  role: string | null;
  pingHour: number;
}

export function getConfig(guildId: string): BirthdayConfig {
  const g = getGuild(guildId) as {
    birthday_enabled: number;
    birthday_channel: string | null;
    birthday_role: string | null;
    birthday_ping_hour: number;
  };
  return {
    enabled:  !!g.birthday_enabled,
    channel:  g.birthday_channel ?? null,
    role:     g.birthday_role ?? null,
    pingHour: g.birthday_ping_hour ?? 9,
  };
}

export function setConfigValue(
  guildId: string,
  key: 'birthday_enabled' | 'birthday_channel' | 'birthday_role' | 'birthday_ping_hour',
  value: unknown,
): void {
  setGuildValue(guildId, key, value);
}

/** Every guild with birthdays switched on — the scheduler only needs to look at these (same pattern as staffActivity's getActiveGuildIds). */
export function getActiveGuildIds(): string[] {
  const rows = db.prepare('SELECT id FROM guilds WHERE birthday_enabled = 1').all() as Array<{ id: string }>;
  return rows.map(r => r.id);
}

export interface Birthday {
  guild_id: string;
  user_id: string;
  birth_month: number;
  birth_day: number;
  birth_year: number | null;
  last_greeted_key: string | null;
}

/**
 * (Re-)sets a user's birthday IN THIS GUILD — PRIMARY KEY (guild_id, user_id)
 * guarantees at most one per person per server. INSERT OR REPLACE means
 * calling this again simply overwrites whatever was there before — that's
 * "change your birthday", no separate update function needed. Resets
 * last_greeted_key to NULL so a changed date is eligible for a fresh
 * greeting rather than staying "already greeted" from the old date's state.
 */
export function setBirthday(guildId: string, userId: string, month: number, day: number, year: number | null = null): void {
  db.prepare(
    'INSERT OR REPLACE INTO birthdays (guild_id, user_id, birth_month, birth_day, birth_year, last_greeted_key) VALUES (?, ?, ?, ?, ?, NULL)',
  ).run(guildId, userId, month, day, year);
}

export function removeBirthday(guildId: string, userId: string): void {
  db.prepare('DELETE FROM birthdays WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
}

export function getBirthday(guildId: string, userId: string): Birthday | undefined {
  return db.prepare('SELECT * FROM birthdays WHERE guild_id = ? AND user_id = ?').get(guildId, userId) as Birthday | undefined;
}

/**
 * Birthdays in this guild that are (a) today, by calendar, and (b) not
 * already greeted today. The `last_greeted_key != todayKey` filter happens
 * in SQL; the actual month/day match — including the Feb-29 special case —
 * happens in JS via isBirthdayOnDayKey(), since expressing that rule
 * cleanly in SQL would be far messier than the equivalent 3 lines of TS.
 */
export function getTodaysBirthdays(guildId: string, todayKey: string): Birthday[] {
  const candidates = db.prepare(
    'SELECT * FROM birthdays WHERE guild_id = ? AND (last_greeted_key IS NULL OR last_greeted_key != ?)',
  ).all(guildId, todayKey) as Birthday[];

  return candidates.filter(b => isBirthdayOnDayKey(b.birth_month, b.birth_day, todayKey));
}

export function markGreeted(guildId: string, userId: string, todayKey: string): void {
  db.prepare('UPDATE birthdays SET last_greeted_key = ? WHERE guild_id = ? AND user_id = ?').run(todayKey, guildId, userId);
}

export interface UpcomingBirthday extends Birthday {
  /** UTC ms timestamp of the next time this birthday occurs (today or in the future, never in the past). */
  nextOccurrence: number;
}

/**
 * Next N birthdays for THIS guild, soonest first. Handles the year-wrap
 * correctly (e.g. "today" is in December and someone's birthday is in
 * January — that counts as "next", not "11 months ago"): each birthday is
 * first tried in the CURRENT year, and only rolled to next year if that
 * date has already passed. JS Date arithmetic also naturally normalizes an
 * out-of-range Feb 29 into Mar 1 on non-leap years, so no extra special
 * case is needed here beyond what Date.UTC() already does.
 */
export function getUpcomingBirthdays(guildId: string, limit = 5, now: Date = new Date()): UpcomingBirthday[] {
  const all = db.prepare('SELECT * FROM birthdays WHERE guild_id = ?').all(guildId) as Birthday[];

  const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  const withNext: UpcomingBirthday[] = all.map(b => {
    let candidate = Date.UTC(now.getUTCFullYear(), b.birth_month - 1, b.birth_day);
    if (candidate < todayStart) {
      candidate = Date.UTC(now.getUTCFullYear() + 1, b.birth_month - 1, b.birth_day);
    }
    return { ...b, nextOccurrence: candidate };
  });

  withNext.sort((a, c) => a.nextOccurrence - c.nextOccurrence);
  return withNext.slice(0, limit);
}
