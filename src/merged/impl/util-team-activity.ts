/**
 * /team-activity — Staff Activity Tracking.
 *
 *   sponsor     ← register a giveaway sponsor & credit the staff member who found them
 *   leaderboard ← show the current staff leaderboard (weekly or all-time)
 *   config      ← view / toggle every feature of this extension
 *
 * The actual ticket-close counting happens automatically via a hook in
 * modules/tickets/service.ts (closeTicket) — nothing to do here for that part.
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
} from 'discord.js';
import { success, error, info } from '../../utils/embeds';
import { setGuildValue } from '../../database/db';
import * as StaffRepo from '../../modules/staffActivity/repository';
import * as ReportRepo from '../../modules/reportStaff/repository';
import { registerSponsor, buildLeaderboardEmbed } from '../../modules/staffActivity/service';

const data = new SlashCommandBuilder()
  .setName('team-activity')
  .setDescription('Staff activity tracking: sponsors, leaderboard, settings')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

  .addSubcommand(s =>
    s.setName('sponsor')
      .setDescription('Register a giveaway sponsor')
      .addUserOption(o => o.setName('user').setDescription('The sponsor').setRequired(true))
      .addStringOption(o => o.setName('donation').setDescription('What they donated (item or value)').setRequired(true).setMaxLength(200)),
  )

  .addSubcommand(s =>
    s.setName('leaderboard')
      .setDescription('Show the staff leaderboard')
      .addStringOption(o =>
        o.setName('period').setDescription('Time period (default: weekly)')
          .addChoices(
            { name: 'This week', value: 'weekly' },
            { name: 'All time',  value: 'total' },
          ),
      ),
  )

  .addSubcommand(s =>
    s.setName('profile')
      .setDescription('Show one staff member\'s full activity profile')
      .addUserOption(o => o.setName('user').setDescription('Staff member').setRequired(true)),
  )

  .addSubcommand(s => s.setName('config-view').setDescription('Show current staff-activity settings'))

  .addSubcommand(s =>
    s.setName('config-tickets')
      .setDescription('Enable/disable ticket-close counting')
      .addBooleanOption(o => o.setName('enabled').setDescription('On or off').setRequired(true)),
  )

  .addSubcommand(s =>
    s.setName('config-sponsors')
      .setDescription('Enable/disable sponsor counting')
      .addBooleanOption(o => o.setName('enabled').setDescription('On or off').setRequired(true)),
  )

  .addSubcommand(s =>
    s.setName('config-mod-actions')
      .setDescription('Enable/disable kick/timeout/warn/ban counting')
      .addBooleanOption(o => o.setName('enabled').setDescription('On or off').setRequired(true)),
  )

  .addSubcommand(s =>
    s.setName('config-leaderboard')
      .setDescription('Configure the leaderboard feature')
      .addBooleanOption(o => o.setName('enabled').setDescription('On or off').setRequired(true))
      .addStringOption(o =>
        o.setName('interval').setDescription('Auto-post interval (default: manual)')
          .addChoices(
            { name: 'Weekly',  value: 'weekly' },
            { name: 'Monthly', value: 'monthly' },
            { name: 'Manual (never auto-posts)', value: 'manual' },
          ),
      )
      .addChannelOption(o =>
        o.setName('channel').setDescription('Channel to auto-post the leaderboard in')
          .addChannelTypes(ChannelType.GuildText),
      )
      .addStringOption(o =>
        o.setName('metric').setDescription('Which metric ranks the leaderboard (default: combined)')
          .addChoices(
            { name: 'Tickets',      value: 'tickets' },
            { name: 'Sponsoren',    value: 'sponsors' },
            { name: 'Mod-Aktionen', value: 'mod_actions' },
            { name: 'Kombiniert',   value: 'combined' },
          ),
      ),
  )

  .addSubcommand(s =>
    s.setName('config-quota')
      .setDescription('Configure the weekly minimum ticket goal + reminder')
      .addBooleanOption(o => o.setName('enabled').setDescription('On or off').setRequired(true))
      .addIntegerOption(o => o.setName('min_tickets').setDescription('Minimum tickets per week').setMinValue(1).setMaxValue(1000))
      .addRoleOption(o => o.setName('staff_role').setDescription('Role that marks a "team member" to check'))
      .addIntegerOption(o => o.setName('reminder_day').setDescription('Day of week for the reminder (0=Sun..6=Sat, UTC)').setMinValue(0).setMaxValue(6))
      .addIntegerOption(o => o.setName('reminder_hour').setDescription('Hour of day for the reminder (0-23, UTC)').setMinValue(0).setMaxValue(23))
      .addChannelOption(o =>
        o.setName('fallback_channel').setDescription('Channel to post a summary in when a reminder DM fails to send')
          .addChannelTypes(ChannelType.GuildText),
      ),
  );

export default {
  data,
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;

    // ── sponsor ────────────────────────────────────────────────────────────
    if (sub === 'sponsor') {
      const sponsor  = interaction.options.getUser('user', true);
      const donation = interaction.options.getString('donation', true);

      const result = registerSponsor(guildId, sponsor.id, donation, interaction.user.id);
      if (!result.ok) {
        await interaction.reply({
          embeds: [error('Sponsor tracking is disabled', 'Enable it first with `/team-activity config-sponsors enabled:True`.')],
          ephemeral: true,
        });
        return;
      }

      await interaction.reply({
        embeds: [success('Sponsor registered', `<@${sponsor.id}> — **${donation}**\nCredited to <@${interaction.user.id}>.`)],
      });
      return;
    }

    // ── profile ────────────────────────────────────────────────────────────
    // Same permission guard as every other subcommand here: the command-level
    // setDefaultMemberPermissions(ManageGuild) above — no extra check needed,
    // same as `leaderboard`.
    if (sub === 'profile') {
      const user = interaction.options.getUser('user', true);
      const row  = StaffRepo.getActivity(guildId, user.id);
      const history = StaffRepo.getUserHistory(guildId, user.id, 4);
      const openReports = ReportRepo.getOpenReportCount(guildId, user.id);

      const weeklyTickets  = row?.weekly_tickets  ?? 0;
      const totalTickets   = row?.total_tickets   ?? 0;
      const weeklySponsors = row?.weekly_sponsors ?? 0;
      const totalSponsors  = row?.total_sponsors  ?? 0;
      const weeklyMod      = row?.weekly_mod_actions ?? 0;
      const totalMod       = row?.total_mod_actions  ?? 0;

      const trend = history.length > 0
        ? [...history].reverse().map(h => `\`${h.week_key}\` — ${h.tickets} 🎫 · ${h.sponsors} 🎁 · ${h.mod_actions} 🛡️`).join('\n')
        : '*No weekly history yet — snapshots are taken automatically at each weekly reset.*';

      const embed = new EmbedBuilder()
        .setColor('#ff6b35')
        .setTitle(`📊 Staff Profile — ${user.tag}`)
        .setThumbnail(user.displayAvatarURL())
        .addFields(
          { name: '🎫 Tickets',      value: `${weeklyTickets} this week · **${totalTickets}** total`,  inline: true },
          { name: '🎁 Sponsors',     value: `${weeklySponsors} this week · **${totalSponsors}** total`, inline: true },
          { name: '🛡️ Mod-Actions', value: `${weeklyMod} this week · **${totalMod}** total`,           inline: true },
          { name: `📈 Last ${history.length || 4} weeks`, value: trend },
        )
        .setTimestamp();

      if (openReports > 0) {
        embed.setFooter({ text: `⚠️ ${openReports} report(s) filed against this user` });
      }

      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    // ── leaderboard ────────────────────────────────────────────────────────
    if (sub === 'leaderboard') {
      const cfg = StaffRepo.getConfig(guildId);
      if (!cfg.leaderboardEnabled) {
        await interaction.reply({
          embeds: [error('Leaderboard is disabled', 'Enable it first with `/team-activity config-leaderboard enabled:True`.')],
          ephemeral: true,
        });
        return;
      }
      const period = (interaction.options.getString('period') ?? 'weekly') as 'weekly' | 'total';
      await interaction.reply({ embeds: [buildLeaderboardEmbed(interaction.guild!, period)] });
      return;
    }

    // ── config-view ────────────────────────────────────────────────────────
    if (sub === 'config-view') {
      const cfg = StaffRepo.getConfig(guildId);
      await interaction.reply({
        embeds: [info('⚙️ Staff Activity Tracking — Settings',
          `**Ticket counting:** ${cfg.ticketsEnabled ? '✅ On' : '❌ Off'}\n` +
          `**Sponsor counting:** ${cfg.sponsorsEnabled ? '✅ On' : '❌ Off'}\n` +
          `**Mod-action counting:** ${cfg.modActionsEnabled ? '✅ On' : '❌ Off'}\n` +
          `**Leaderboard:** ${cfg.leaderboardEnabled ? '✅ On' : '❌ Off'} (interval: \`${cfg.leaderboardInterval}\`, metric: \`${cfg.leaderboardMetric}\`` +
            `${cfg.leaderboardChannel ? `, channel: <#${cfg.leaderboardChannel}>` : ', no channel set'})\n` +
          `**Weekly quota:** ${cfg.quotaEnabled ? '✅ On' : '❌ Off'} (min: **${cfg.quotaMinTickets}** tickets` +
            `${cfg.quotaRole ? `, role: <@&${cfg.quotaRole}>` : ', role: not set — falls back to anyone tracked'}, ` +
            `reminder: day ${cfg.quotaReminderDay} @ ${cfg.quotaReminderHour}:00 UTC` +
            `${cfg.quotaFallbackChannel ? `, DM-fallback: <#${cfg.quotaFallbackChannel}>` : ', DM-fallback: not set'})`,
        )],
        ephemeral: true,
      });
      return;
    }

    // ── config-tickets ─────────────────────────────────────────────────────
    if (sub === 'config-tickets') {
      const enabled = interaction.options.getBoolean('enabled', true);
      setGuildValue(guildId, 'staff_tracking_tickets_enabled', enabled ? 1 : 0);
      await interaction.reply({ embeds: [success('Updated', `Ticket-close counting is now **${enabled ? 'on' : 'off'}**.`)], ephemeral: true });
      return;
    }

    // ── config-sponsors ────────────────────────────────────────────────────
    if (sub === 'config-sponsors') {
      const enabled = interaction.options.getBoolean('enabled', true);
      setGuildValue(guildId, 'staff_tracking_sponsors_enabled', enabled ? 1 : 0);
      await interaction.reply({ embeds: [success('Updated', `Sponsor counting is now **${enabled ? 'on' : 'off'}**.`)], ephemeral: true });
      return;
    }

    // ── config-mod-actions ─────────────────────────────────────────────────
    if (sub === 'config-mod-actions') {
      const enabled = interaction.options.getBoolean('enabled', true);
      setGuildValue(guildId, 'staff_mod_actions_enabled', enabled ? 1 : 0);
      await interaction.reply({ embeds: [success('Updated', `Mod-action counting (kick/timeout/warn/ban) is now **${enabled ? 'on' : 'off'}**.`)], ephemeral: true });
      return;
    }

    // ── config-leaderboard ─────────────────────────────────────────────────
    if (sub === 'config-leaderboard') {
      const enabled  = interaction.options.getBoolean('enabled', true);
      const interval = interaction.options.getString('interval');
      const channel  = interaction.options.getChannel('channel');
      const metric   = interaction.options.getString('metric');

      setGuildValue(guildId, 'staff_leaderboard_enabled', enabled ? 1 : 0);
      if (interval) setGuildValue(guildId, 'staff_leaderboard_interval', interval);
      if (channel)  setGuildValue(guildId, 'staff_leaderboard_channel', channel.id);
      if (metric)   setGuildValue(guildId, 'staff_leaderboard_metric', metric);

      await interaction.reply({
        embeds: [success('Updated', `Leaderboard is now **${enabled ? 'on' : 'off'}**.` +
          (interval ? ` Interval: \`${interval}\`.` : '') +
          (channel  ? ` Channel: <#${channel.id}>.` : '') +
          (metric   ? ` Metric: \`${metric}\`.` : ''))],
        ephemeral: true,
      });
      return;
    }

    // ── config-quota ───────────────────────────────────────────────────────
    if (sub === 'config-quota') {
      const enabled  = interaction.options.getBoolean('enabled', true);
      const min      = interaction.options.getInteger('min_tickets');
      const role     = interaction.options.getRole('staff_role');
      const day      = interaction.options.getInteger('reminder_day');
      const hour     = interaction.options.getInteger('reminder_hour');
      const fallback = interaction.options.getChannel('fallback_channel');

      setGuildValue(guildId, 'staff_quota_enabled', enabled ? 1 : 0);
      if (min !== null)  setGuildValue(guildId, 'staff_quota_min_tickets', min);
      if (role)          setGuildValue(guildId, 'staff_quota_role', role.id);
      if (day !== null)  setGuildValue(guildId, 'staff_quota_reminder_day', day);
      if (hour !== null) setGuildValue(guildId, 'staff_quota_reminder_hour', hour);
      if (fallback)      setGuildValue(guildId, 'staff_quota_fallback_channel', fallback.id);

      await interaction.reply({
        embeds: [success('Updated', `Weekly quota is now **${enabled ? 'on' : 'off'}**. Use \`/team-activity config-view\` to see all current values.`)],
        ephemeral: true,
      });
      return;
    }
  },
};
