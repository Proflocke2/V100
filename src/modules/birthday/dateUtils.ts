/**
 * modules/birthday/dateUtils.ts
 *
 * Small UTC-based date helpers, same shape and rationale as
 * staffActivity/weekUtils.ts — fixed to UTC so "today" and "hour X" behave
 * consistently regardless of where the bot host or guild members are.
 */

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Pure numeric core shared by isBirthdayToday() (Date-driven) and
 * isBirthdayOnDayKey() (string-driven, for repository.ts's SQL-adjacent
 * filtering) — keeping one implementation means the two can never disagree
 * about the Feb-29 rule below.
 */
function matchesBirthday(birthMonth: number, birthDay: number, todayYear: number, todayMonth: number, todayDay: number): boolean {
  // Feb 29 birthdays, on a non-leap year, get celebrated on March 1st
  // instead of skipped entirely — the closest real date that exists every
  // single year, and simpler than "wait 4 years" or "celebrate on Feb 28".
  if (birthMonth === 2 && birthDay === 29 && !isLeapYear(todayYear)) {
    return todayMonth === 3 && todayDay === 1;
  }
  return todayMonth === birthMonth && todayDay === birthDay;
}

/** 'YYYY-MM-DD', UTC. Used as the "already greeted today?" guard (birthdays.last_greeted_key). */
export function dayKey(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** True if `now` (UTC) is the given birth month/day — see matchesBirthday() for the Feb-29 rule. */
export function isBirthdayToday(month: number, day: number, now: Date = new Date()): boolean {
  return matchesBirthday(month, day, now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
}

/** Same check, but driven by a 'YYYY-MM-DD' dayKey string instead of a Date — lets repository.ts filter SQL results without constructing/passing Date objects around. */
export function isBirthdayOnDayKey(month: number, day: number, key: string): boolean {
  const [y, m, d] = key.split('-').map(Number);
  return matchesBirthday(month, day, y, m, d);
}

/**
 * True once we've reached (or passed) the configured UTC hour TODAY, and we
 * haven't already greeted for today (lastGreetedKey !== today). Daily analog
 * of staffActivity/weekUtils.ts's isReminderDue() — no weekday component
 * needed since this is checked every day, not once a week.
 */
export function isGreetingDue(hour: number, lastGreetedKey: string | null, now: Date = new Date()): boolean {
  const today = dayKey(now);
  if (lastGreetedKey === today) return false;
  return now.getUTCHours() >= hour;
}
