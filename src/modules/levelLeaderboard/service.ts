/**
 * LEVEL LEADERBOARD SERVICE
 *
 * Four leaderboard types, all browseable via prev/next buttons in one message:
 *   1. all-time      – total XP ever (existing users.xp)
 *   2. season        – seasonal XP (users.seasonal_xp, only if seasonal enabled)
 *   3. weekly-gain   – XP gained since last snapshot
 *   4. messages      – raw message count (users.messages)
 *
 * Snapshots: before each auto-post (and weekly regardless of auto-post
 * setting), we snapshot the current xp and seasonal_xp per user into
 * xp_weekly_snapshots. The gain leaderboard is live xp minus that snapshot.
 * This means the gain period matches whatever interval you auto-post on,
 * defaulting to 7 days if manual.
 *
 * Navigation: the embed includes prev/next buttons (customId
 * lvlb:nav:<type>:<guild_id>). interactionCreate.ts routes any
 * customId starting with 'lvlb:nav:' here.
 */

import {
  Client, Guild, TextChannel, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ButtonInteraction,
} from 'discord.js';
import db, { getGuild, setGuildValue } from '../../database/db';

// ── Schema ────────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS xp_weekly_snapshots (
    guild_id   TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    xp         INTEGER NOT NULL,
    season_xp  INTEGER NOT NULL DEFAULT 0,
    week_key   TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    PRIMARY KEY (guild_id, user_id, week_key)
  );
`);

// ── Types ─────────────────────────────────────────────────────────────────────

export type LbType = 'alltime' | 'season' | 'gain' | 'messages';
const LB_ORDER: LbType[] = ['alltime', 'season', 'gain', 'messages'];
const LB_LABELS: Record<LbType, string> = {
  alltime:  '🏆 All-Time XP',
  season:   '⭐ This Season',
  gain:     '📈 Most Gained (Period)',
  messages: '💬 Most Messages',
};

// ── ISO week key ──────────────────────────────────────────────────────────────

export function isoWeekKey(date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const year = d.getUTCFullYear();
  const soy = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((d.getTime() - soy.getTime()) / 86_400_000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

// ── Snapshot ──────────────────────────────────────────────────────────────────

export function takeSnapshot(guildId: string): void {
  const week = isoWeekKey();
  const users = db.prepare('SELECT id, xp, seasonal_xp FROM users WHERE guild_id = ?').all(guildId) as { id: string; xp: number; seasonal_xp: number | null }[];
  for (const u of users) {
    db.prepare(`
      INSERT INTO xp_weekly_snapshots (guild_id, user_id, xp, season_xp, week_key)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(guild_id, user_id, week_key) DO UPDATE SET xp = excluded.xp, season_xp = excluded.season_xp
    `).run(guildId, u.id, u.xp, u.seasonal_xp ?? 0, week);
  }
}

// ── Fetch top-10 for each type ────────────────────────────────────────────────

interface Row { id: string; value: number; messages: number; xp: number; level: number; seasonal_level: number | null; }

function fetchTop(guildId: string, type: LbType): Row[] {
  switch (type) {
    case 'alltime':
      return db.prepare('SELECT id, xp AS value, messages, xp, level, seasonal_level FROM users WHERE guild_id = ? ORDER BY xp DESC LIMIT 10').all(guildId) as Row[];
    case 'season':
      return db.prepare('SELECT id, seasonal_xp AS value, messages, xp, level, seasonal_level FROM users WHERE guild_id = ? ORDER BY seasonal_xp DESC LIMIT 10').all(guildId) as Row[];
    case 'messages':
      return db.prepare('SELECT id, messages AS value, messages, xp, level, seasonal_level FROM users WHERE guild_id = ? ORDER BY messages DESC LIMIT 10').all(guildId) as Row[];
    case 'gain': {
      const week = isoWeekKey();
      const snaps = db.prepare('SELECT user_id, xp AS snap_xp FROM xp_weekly_snapshots WHERE guild_id = ? AND week_key = ?').all(guildId, week) as { user_id: string; snap_xp: number }[];
      const snapMap = new Map(snaps.map(s => [s.user_id, s.snap_xp]));
      const users = db.prepare('SELECT id, xp, messages, level, seasonal_level FROM users WHERE guild_id = ?').all(guildId) as any[];
      return users
        .map(u => ({ ...u, value: u.xp - (snapMap.get(u.id) ?? u.xp) }))
        .filter(u => u.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);
    }
  }
}

// ── Build embed ───────────────────────────────────────────────────────────────

const MEDALS = ['🥇', '🥈', '🥉'];
const COLORS: Record<LbType, string> = { alltime: '#5865f2', season: '#f1c40f', gain: '#57f287', messages: '#ff6b35' };

export function buildLbEmbed(guild: Guild, type: LbType, rows: Row[], showSeasonNote: boolean): EmbedBuilder {
  const g = getGuild(guild.id) as any;
  const seasonLabel = g.seasonal_label || 'Season';
  const typeIdx = LB_ORDER.indexOf(type) + 1;
  const label = type === 'season' ? `⭐ ${seasonLabel}` : LB_LABELS[type];

  const lines = rows.map((r, i) => {
    const member = guild.members.cache.get(r.id);
    const name = member ? member.user.username : `User ${r.id.slice(-4)}`;
    const extra = type === 'messages' ? `**${r.value.toLocaleString('en')}** messages` : `**${r.value.toLocaleString('en')} XP**`;
    const level = type === 'season' ? (r.seasonal_level ?? 0) : r.level;
    return `${MEDALS[i] ?? `${i + 1}.`} **${name}** — ${extra} (Lvl ${level})`;
  });

  const embed = new EmbedBuilder()
    .setTitle(`${label} — ${guild.name}`)
    .setColor(COLORS[type] as `#${string}`)
    .setDescription(lines.length ? lines.join('\n') : '*No data yet.*')
    .setFooter({ text: `${typeIdx}/${LB_ORDER.length} • Use the buttons to switch` })
    .setTimestamp();

  if (type === 'gain') {
    embed.addFields({ name: 'ℹ️ Gain period', value: `Measured since the last snapshot/reset.`, inline: false });
  }
  if (type === 'season' && showSeasonNote && !g.seasonal_enabled) {
    embed.setDescription('Seasonal leaderboard is not enabled. Enable it with `/level season-config action:Enable`.');
  }
  return embed;
}

function buildNavRow(type: LbType, guildId: string): ActionRowBuilder<ButtonBuilder> {
  const idx   = LB_ORDER.indexOf(type);
  const prev  = LB_ORDER[(idx - 1 + LB_ORDER.length) % LB_ORDER.length];
  const next  = LB_ORDER[(idx + 1) % LB_ORDER.length];
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`lvlb:nav:${prev}:${guildId}`).setLabel('◀ ' + LB_LABELS[prev].slice(0, 20)).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`lvlb:nav:${next}:${guildId}`).setLabel(LB_LABELS[next].slice(0, 20) + ' ▶').setStyle(ButtonStyle.Secondary),
  );
}

// ── Public: build full message payload ───────────────────────────────────────

export function buildLbPayload(guild: Guild, type: LbType) {
  const g = getGuild(guild.id) as any;
  const rows = fetchTop(guild.id, type);
  const embed = buildLbEmbed(guild, type, rows, true);
  const nav   = buildNavRow(type, guild.id);
  return { embeds: [embed], components: [nav] };
}

// ── Button handler ────────────────────────────────────────────────────────────

export async function handleLbNav(btn: ButtonInteraction): Promise<void> {
  const parts  = btn.customId.split(':'); // lvlb:nav:<type>:<guildId>
  const type   = parts[2] as LbType;
  const guildId = parts[3];
  if (!LB_ORDER.includes(type)) { await btn.reply({ content: '❌ Unknown leaderboard type.', ephemeral: true }); return; }
  const guild = btn.guild;
  if (!guild || guild.id !== guildId) { await btn.reply({ content: '❌ Guild mismatch.', ephemeral: true }); return; }
  const payload = buildLbPayload(guild, type);
  await btn.update(payload);
}

export function isLbNavButton(customId: string): boolean {
  return customId.startsWith('lvlb:nav:');
}

// ── Scheduled auto-post ───────────────────────────────────────────────────────

function isDue(interval: string, postDay: number, postHour: number, lastTs: number | null, now: Date): boolean {
  if (interval === 'manual') return false;
  const lastSec = lastTs ?? 0;
  const nowSec  = Math.floor(now.getTime() / 1000);
  const day  = now.getUTCDay() === 0 ? 6 : now.getUTCDay() - 1; // Mon=0
  const hour = now.getUTCHours();

  if (interval === 'daily') {
    return nowSec - lastSec >= 23 * 3600 && hour === postHour;
  }
  if (interval === 'weekly') {
    return nowSec - lastSec >= 6 * 24 * 3600 && day === postDay && hour === postHour;
  }
  if (interval === 'monthly') {
    const dayOfMonth = now.getUTCDate();
    return nowSec - lastSec >= 27 * 24 * 3600 && dayOfMonth === 1 && hour === postHour;
  }
  return false;
}

export async function runLbAutoPostTick(client: Client): Promise<void> {
  const now = new Date();
  const guilds = db.prepare(
    "SELECT id, level_lb_channel, level_lb_interval, level_lb_post_day, level_lb_post_hour, level_lb_last_post_ts FROM guilds WHERE level_lb_channel IS NOT NULL AND level_lb_interval != 'manual'"
  ).all() as any[];

  for (const g of guilds) {
    if (!isDue(g.level_lb_interval, g.level_lb_post_day, g.level_lb_post_hour, g.level_lb_last_post_ts, now)) continue;
    const guild = client.guilds.cache.get(g.id);
    if (!guild) continue;
    const ch = guild.channels.cache.get(g.level_lb_channel) as TextChannel | undefined;
    if (!ch) continue;

    // Snapshot first, then post all 4 types in one message sequence
    takeSnapshot(g.id);

    for (const type of LB_ORDER) {
      const payload = buildLbPayload(guild, type);
      // Only last type gets nav buttons (avoids 4 separate navigable messages)
      if (type !== LB_ORDER[LB_ORDER.length - 1]) {
        payload.components = [];
      }
      await ch.send(payload).catch(() => {});
    }

    setGuildValue(g.id, 'level_lb_last_post_ts', Math.floor(now.getTime() / 1000));
    console.log(`[LevelLB] Auto-posted leaderboards for guild ${g.id}`);
  }
}
