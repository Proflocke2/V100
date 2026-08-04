/**
 * /dashboard — one-glance status overview across every major system, so an
 * admin doesn't have to run /setup status, /welcome, /security config,
 * /ticket setup, etc. separately just to see what's on/off. Read-only —
 * every field links back to the actual command that configures it.
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import { requireAdmin } from '../../utils/guards';
import { getGuild } from '../../database/db';
import * as TicketRepo from '../../modules/tickets/repository';
import * as WelcomeRepo from '../../modules/welcome/repository';
import * as SuggestionsRepo from '../../modules/suggestions/repository';
import * as StaffActivityRepo from '../../modules/staffActivity/repository';
import { getSecurityConfig } from '../../modules/security/securityEngine';
import { getAntiNukeConfig } from '../../modules/moderation/antiNuke';
import { getAutomod3Config } from '../../merged/impl/automod3';

const ON = '🟢';
const OFF = '🔴';

export default {
  data: new SlashCommandBuilder()
    .setName('dashboard')
    .setDescription('Status overview of every major bot system on this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),

  async execute(ix: ChatInputCommandInteraction) {
    if (!await requireAdmin(ix)) return;
    const gid = ix.guildId!;
    const guild = getGuild(gid) as any;

    const tickets = TicketRepo.getSettings(gid);
    const ticketPanelCount = TicketRepo.listPanels(gid).length;
    const welcome = WelcomeRepo.getSettings(gid);
    const security = getSecurityConfig(gid);
    const antinuke = getAntiNukeConfig(gid);
    const automod3 = getAutomod3Config(gid);
    const suggestions = SuggestionsRepo.getConfig(gid);
    const staffActivity = StaffActivityRepo.getConfig(gid);

    const embed = new EmbedBuilder()
      .setTitle(`📊 Dashboard — ${ix.guild!.name}`)
      .setColor('#5865f2')
      .setDescription('Status of all main systems. Each section can be adjusted via the named command.')
      .addFields(
        {
          name: `${security.enabled ? ON : OFF} Security Engine — \`/security config\``,
          value: security.enabled ? `Severity: **${security.severity}**` : 'Off',
          inline: true,
        },
        {
          name: `${antinuke.enabled ? ON : OFF} Anti-Nuke — \`/security antinuke setup\``,
          value: antinuke.enabled ? `Action: **${antinuke.action}**` : 'Off',
          inline: true,
        },
        {
          name: `${guild.automod_enabled ? ON : OFF} AutoMod (Legacy) — \`/automod\``,
          value: guild.automod_enabled ? 'Active' : 'Off',
          inline: true,
        },
        {
          name: `${automod3.phishing_filter || automod3.anti_mass_ping ? ON : OFF} AutoMod3 — \`/automod3\``,
          value: `Regex: **${JSON.parse(automod3.regex_filters).length}** • Phishing: ${automod3.phishing_filter ? 'on' : 'off'}`,
          inline: true,
        },
        {
          name: `${welcome.enabled ? ON : OFF} Welcome — \`/welcome\``,
          value: welcome.enabled ? `<#${welcome.channel_id}>` : 'Off',
          inline: true,
        },
        {
          name: `${guild.level_enabled ? ON : OFF} Leveling — \`/level\``,
          value: guild.level_enabled ? 'Active' : 'Off',
          inline: true,
        },
        {
          name: `${tickets.log_channel_id || ticketPanelCount > 0 ? ON : OFF} Tickets — \`/ticket setup\``,
          value: `${ticketPanelCount} Panel(s)`,
          inline: true,
        },
        {
          name: `${suggestions.enabled ? ON : OFF} Suggestions — \`/suggest config\``,
          value: suggestions.enabled ? (suggestions.channel ? `<#${suggestions.channel}>` : 'No channel set') : 'Off',
          inline: true,
        },
        {
          name: `${staffActivity.ticketsEnabled || staffActivity.sponsorsEnabled ? ON : OFF} Staff Activity — \`/team-activity\``,
          value: staffActivity.leaderboardEnabled ? 'Leaderboard active' : 'No leaderboard',
          inline: true,
        },
        {
          name: `${guild.mod_log_channel ? ON : OFF} Mod Log — \`/automod logchannel\``,
          value: guild.mod_log_channel ? `<#${guild.mod_log_channel}>` : 'No channel set',
          inline: true,
        },
        {
          name: `${guild.backup_auto_enabled ? ON : OFF} Auto-Backup — \`/backup auto-enable\``,
          value: guild.backup_auto_enabled ? `every ${guild.backup_auto_interval_minutes ?? 10080} min.` : 'Off',
          inline: true,
        },
        {
          name: `${guild.birthday_enabled ? ON : OFF} Birthdays — \`/birthday config\``,
          value: guild.birthday_enabled ? (guild.birthday_channel ? `<#${guild.birthday_channel}>` : 'No channel set') : 'Off',
          inline: true,
        },
      )
      .setFooter({ text: 'Just an overview — details/fine-tuning live in the respective commands.' })
      .setTimestamp();

    await ix.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
