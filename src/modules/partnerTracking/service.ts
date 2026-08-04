/**
 * PARTNER TRACKING — counts how many discord.gg invite links a staff member
 * posts in the configured partners channel per week, posts a weekly summary,
 * then resets the count automatically. The weekly summary is meant to give
 * the team a quick view of who's keeping up with their partner quota.
 *
 * What counts: any message containing a discord.gg/ or discord.com/invite/ link,
 * sent by a non-bot member in the configured partners channel for that guild.
 * Only counts once per message regardless of how many invite links are in it
 * — double-posting the same link twice should not inflate the count.
 *
 * The "week" is a calendar week (Monday 00:00 UTC → Sunday 23:59 UTC).
 * Auto-reset fires at the top of every hour; the scheduler post happens the
 * first time the tick runs after the configured post_day/post_hour UTC.
 * If the bot was offline at that exact hour it fires on next startup.
 */

import { Client, EmbedBuilder, TextChannel } from 'discord.js';
import db, { getGuild } from '../../database/db';

db.exec(`
  CREATE TABLE IF NOT EXISTS partner_config (
    guild_id          TEXT PRIMARY KEY,
    partners_channel  TEXT NOT NULL,
    report_channel    TEXT NOT NULL,
    post_day          INTEGER DEFAULT 0,   -- 0 Mon, 1 Tue, …, 6 Sun (UTC)
    post_hour         INTEGER DEFAULT 9,   -- UTC hour the weekly post fires
    last_post_week    TEXT                 -- ISO week string "YYYY-Www" of last post
  );

  CREATE TABLE IF NOT EXISTS partner_counts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id    TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    week        TEXT NOT NULL,             -- "YYYY-Www" ISO week key
    count       INTEGER DEFAULT 0,
    UNIQUE (guild_id, user_id, week)
  );
`);

export interface PartnerConfig {
  guild_id: string; partners_channel: string; report_channel: string;
  post_day: number; post_hour: number; last_post_week: string | null;
}

export function setPartnerConfig(
  guildId: string, partnersChannel: string, reportChannel: string,
  postDay = 0, postHour = 9,
): void {
  db.prepare(`
    INSERT INTO partner_config (guild_id, partners_channel, report_channel, post_day, post_hour)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET
      partners_channel = excluded.partners_channel,
      report_channel   = excluded.report_channel,
      post_day         = excluded.post_day,
      post_hour        = excluded.post_hour
  `).run(guildId, partnersChannel, reportChannel, postDay, postHour);
}

export function getPartnerConfig(guildId: string): PartnerConfig | null {
  return (db.prepare('SELECT * FROM partner_config WHERE guild_id = ?').get(guildId) as PartnerConfig | undefined) ?? null;
}

// ── Discord invite detection ──────────────────────────────────────────────────

const DISCORD_INVITE_RE = /discord(?:\.gg|\.com\/invite)\/\S+/i;

export function isDiscordInvite(content: string): boolean {
  return DISCORD_INVITE_RE.test(content);
}

// ── ISO week key: "YYYY-Www" ──────────────────────────────────────────────────

function isoWeekKey(date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() === 0 ? 7 : d.getUTCDay(); // Mon=1 Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = d.getUTCFullYear();
  const startOfYear = new Date(Date.UTC(year, 0, 1));
  const weekNo = Math.ceil(((d.getTime() - startOfYear.getTime()) / 86_400_000 + 1) / 7);
  return `${year}-W${String(weekNo).padStart(2, '0')}`;
}

// ── Recording a link post ──────────────────────────────────────────────────────

export function recordPartnerPost(guildId: string, userId: string): void {
  const week = isoWeekKey();
  db.prepare(`
    INSERT INTO partner_counts (guild_id, user_id, week, count) VALUES (?, ?, ?, 1)
    ON CONFLICT(guild_id, user_id, week) DO UPDATE SET count = count + 1
  `).run(guildId, userId, week);
}

export interface WeekCounts { userId: string; count: number; }

export function getWeekCounts(guildId: string, week?: string): WeekCounts[] {
  const w = week ?? isoWeekKey();
  return db.prepare(
    'SELECT user_id AS userId, count FROM partner_counts WHERE guild_id = ? AND week = ? ORDER BY count DESC'
  ).all(guildId, w) as WeekCounts[];
}

export function resetWeekCounts(guildId: string, week?: string): void {
  const w = week ?? isoWeekKey();
  db.prepare('DELETE FROM partner_counts WHERE guild_id = ? AND week = ?').run(guildId, w);
}

// ── Weekly report + auto-post tick ────────────────────────────────────────────

async function postWeeklyReport(guild: any, cfg: PartnerConfig, week: string): Promise<void> {
  const ch = guild.channels.cache.get(cfg.report_channel) as TextChannel | undefined;
  if (!ch) return;

  const rows = getWeekCounts(guild.id, week);
  const medals = ['🥇', '🥈', '🥉'];
  const lines = rows.length
    ? rows.map((r, i) => `${medals[i] ?? `${i + 1}.`} <@${r.userId}> — **${r.count}** partner post${r.count === 1 ? '' : 's'}`)
    : ['No partner posts were recorded this week. Staff post `discord.gg/` links in the partners channel to be counted.'];

  const embed = new EmbedBuilder()
    .setTitle(`🤝 Weekly Partner Activity — ${week}`)
    .setColor('#ff6b35')
    .setDescription(lines.join('\n'))
    .setFooter({ text: 'Counts reset for the new week' })
    .setTimestamp();

  await ch.send({ embeds: [embed] }).catch(() => {});
}

export async function runPartnerTrackingTick(client: Client): Promise<void> {
  const configs = db.prepare('SELECT * FROM partner_config').all() as PartnerConfig[];
  const now = new Date();
  const currentWeek = isoWeekKey(now);
  const currentDay  = now.getUTCDay() === 0 ? 6 : now.getUTCDay() - 1; // Mon=0 Sun=6
  const currentHour = now.getUTCHours();

  for (const cfg of configs) {
    if (currentDay !== cfg.post_day) continue;
    if (currentHour < cfg.post_hour) continue;
    if (cfg.last_post_week === currentWeek) continue; // already posted this week

    const guild = client.guilds.cache.get(cfg.guild_id);
    if (!guild) continue;

    // We want to report LAST week's counts, then reset.
    const lastWeek = getPreviousWeekKey(currentWeek);
    await postWeeklyReport(guild, cfg, lastWeek);
    resetWeekCounts(cfg.guild_id, lastWeek);

    db.prepare('UPDATE partner_config SET last_post_week = ? WHERE guild_id = ?').run(currentWeek, cfg.guild_id);
  }
}

function getPreviousWeekKey(week: string): string {
  const [year, wStr] = week.split('-W');
  let w = parseInt(wStr, 10);
  let y = parseInt(year, 10);
  if (w === 1) { y--; w = weeksInYear(y); } else { w--; }
  return `${y}-W${String(w).padStart(2, '0')}`;
}

function weeksInYear(year: number): number {
  const dec31 = new Date(Date.UTC(year, 11, 31));
  const day = dec31.getUTCDay() === 0 ? 7 : dec31.getUTCDay();
  return day >= 4 ? 53 : 52;
}
