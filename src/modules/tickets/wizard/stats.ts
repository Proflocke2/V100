/**
 * modules/tickets/wizard/stats.ts
 *
 * Read-only reporting — folded in from the old /ticketstats command so it
 * doesn't have to survive as a stray top-level command. No editing here,
 * just three view buttons. All user-facing text goes through twg() so it
 * follows the guild language (en/de/fr/ru).
 */

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import * as Repo from '../repository';
import { info } from '../../../utils/embeds';
import { buildCustomId } from './session';
import { navRow, renderTo, WizardComponentInteraction, WizardView } from './helpers';
import { tw, twg } from './i18n';

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

function bar(count: number, total: number): string {
  const filled = Math.round(total > 0 ? (count / total) * 10 : 0);
  return '█'.repeat(filled) + '░'.repeat(10 - filled) + ` (${count})`;
}

export function renderStatsMenu(sessionId: string): WizardView {
  const embed = new EmbedBuilder().setTitle(tw(sessionId, 'stats.menu_title')).setColor('#5865f2').setDescription(tw(sessionId, 'stats.menu_desc'));
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buildCustomId(sessionId, 'stats', 'overview')).setLabel(tw(sessionId, 'stats.btn_overview')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(buildCustomId(sessionId, 'stats', 'staff')).setLabel(tw(sessionId, 'stats.btn_staff')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(buildCustomId(sessionId, 'stats', 'survey')).setLabel(tw(sessionId, 'stats.btn_survey')).setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [row, navRow(sessionId, 'menu')] };
}

export async function handleStatsSection(interaction: WizardComponentInteraction, sessionId: string, action: string, guildId: string): Promise<void> {
  if (action === 'menu') return renderTo(interaction, renderStatsMenu(sessionId));

  if (action === 'overview') {
    const s = Repo.getGuildStats(guildId);
    const avgClose = s.avg_close_time !== null ? formatDuration(s.avg_close_time) : 'N/A';
    const openPct  = s.total > 0 ? ((s.open / s.total) * 100).toFixed(1) : '0';
    const closePct = s.total > 0 ? ((s.closed / s.total) * 100).toFixed(1) : '0';
    const embed = new EmbedBuilder().setTitle(twg(guildId, 'stats.ov_title')).setColor('#5865f2').addFields(
      { name: twg(guildId, 'stats.ov_total'),   value: String(s.total), inline: true },
      { name: twg(guildId, 'stats.ov_open'),    value: `${s.open} (${openPct}%)`, inline: true },
      { name: twg(guildId, 'stats.ov_closed'),  value: `${s.closed} (${closePct}%)`, inline: true },
      { name: twg(guildId, 'stats.ov_today'),   value: String(s.today), inline: true },
      { name: twg(guildId, 'stats.ov_week'),    value: String(s.this_week), inline: true },
      { name: twg(guildId, 'stats.ov_month'),   value: String(s.this_month), inline: true },
      { name: twg(guildId, 'stats.ov_avgclose'), value: avgClose, inline: true },
    );
    return renderTo(interaction, { embeds: [embed], components: [navRow(sessionId, 'stats:menu')] });
  }

  if (action === 'staff') {
    const staff = Repo.getStaffStats(guildId, 10);
    if (staff.length === 0) return renderTo(interaction, { embeds: [info(twg(guildId, 'stats.staff_empty_title'), twg(guildId, 'stats.staff_empty_desc'))], components: [navRow(sessionId, 'stats:menu')] });
    const rows = staff.map((s, i) => twg(guildId, 'stats.staff_row', { rank: i + 1, user: s.user_id, claimed: s.claimed, closed: s.closed, total: s.claimed + s.closed }));
    const embed = new EmbedBuilder().setTitle(twg(guildId, 'stats.staff_title')).setColor('#5865f2').setDescription(rows.join('\n'));
    return renderTo(interaction, { embeds: [embed], components: [navRow(sessionId, 'stats:menu')] });
  }

  if (action === 'survey') {
    const s = Repo.getSurveyStats(guildId);
    if (s.total === 0) return renderTo(interaction, { embeds: [info(twg(guildId, 'stats.survey_empty_title'), twg(guildId, 'stats.survey_empty_desc'))], components: [navRow(sessionId, 'stats:menu')] });
    const avgStr = s.avg_rating !== null ? s.avg_rating.toFixed(2) : 'N/A';
    const embed = new EmbedBuilder().setTitle(twg(guildId, 'stats.survey_title')).setColor('#fee75c').addFields(
      { name: twg(guildId, 'stats.survey_total'), value: String(s.total), inline: true },
      { name: twg(guildId, 'stats.survey_avg'),   value: `${avgStr} / 5.00 ⭐`, inline: true },
      { name: twg(guildId, 'stats.survey_1'), value: bar(s.rating_1, s.total) },
      { name: twg(guildId, 'stats.survey_2'), value: bar(s.rating_2, s.total) },
      { name: twg(guildId, 'stats.survey_3'), value: bar(s.rating_3, s.total) },
      { name: twg(guildId, 'stats.survey_4'), value: bar(s.rating_4, s.total) },
      { name: twg(guildId, 'stats.survey_5'), value: bar(s.rating_5, s.total) },
    );
    return renderTo(interaction, { embeds: [embed], components: [navRow(sessionId, 'stats:menu')] });
  }
}
