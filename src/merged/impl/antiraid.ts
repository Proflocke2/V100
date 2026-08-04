import { requireAdmin } from '../../utils/guards';
/**
 * /antiraid — Configure anti-raid protection.
 */

import {
  SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits,
  ChannelType, TextChannel, EmbedBuilder, MessageFlags,
} from 'discord.js';
import { success, error, info } from '../../utils/embeds';
import { getAntiRaidConfig, updateAntiRaidConfig, isLockdownActive } from '../../modules/moderation/antiRaid';

export default {
  data: new SlashCommandBuilder()
    .setName('antiraid')
    .setDescription('Configure anti-raid protection')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)

    .addSubcommand(s =>
      s.setName('setup').setDescription('Configure anti-raid settings')
        .addBooleanOption(o => o.setName('enabled').setDescription('Enable/disable').setRequired(true))
        .addIntegerOption(o => o.setName('threshold').setDescription('Joins to trigger raid detection (default: 10)')
          .setMinValue(3).setMaxValue(50))
        .addIntegerOption(o => o.setName('window').setDescription('Time window in seconds (default: 10)')
          .setMinValue(3).setMaxValue(60))
        .addStringOption(o => o.setName('action').setDescription('Action to take on raiders')
          .addChoices(
            { name: '👟 Kick',      value: 'kick'     },
            { name: '🔨 Ban',       value: 'ban'      },
            { name: '⏱️ Timeout',   value: 'timeout'  },
            { name: '🔒 Log only',  value: 'lockdown' },
          ))
        .addIntegerOption(o => o.setName('min_age').setDescription('Min account age in minutes (0 = disabled)')
          .setMinValue(0).setMaxValue(10080))
        .addChannelOption(o => o.setName('log_channel').setDescription('Alert channel')
          .addChannelTypes(ChannelType.GuildText)),
    )

    .addSubcommand(s =>
      s.setName('status').setDescription('Show current anti-raid configuration'),
    ),

  async execute(ix: ChatInputCommandInteraction) {
    if (!await requireAdmin(ix)) return;
    const sub = ix.options.getSubcommand();
    const gid = ix.guildId!;

    if (sub === 'setup') {
      const enabled   = ix.options.getBoolean('enabled', true);
      const threshold = ix.options.getInteger('threshold');
      const window    = ix.options.getInteger('window');
      const action    = ix.options.getString('action') as 'kick' | 'ban' | 'timeout' | 'lockdown' | null;
      const minAge    = ix.options.getInteger('min_age');
      const logCh     = ix.options.getChannel('log_channel') as TextChannel | null;

      updateAntiRaidConfig(gid, {
        enabled:         enabled ? 1 : 0,
        ...(threshold !== null && { threshold }),
        ...(window    !== null && { window_seconds: window }),
        ...(action    !== null && { action }),
        ...(minAge    !== null && { min_age_minutes: minAge }),
        ...(logCh     !== null && { log_channel_id: logCh.id }),
      });

      const config = getAntiRaidConfig(gid);
      return ix.reply({
        embeds: [success(
          `🛡️ Anti-Raid ${enabled ? 'Enabled' : 'Disabled'}`,
          `**Threshold:** ${config.threshold} joins in ${config.window_seconds}s\n` +
          `**Action:** ${config.action}\n` +
          `**Min account age:** ${config.min_age_minutes}min\n` +
          `**Log channel:** ${config.log_channel_id ? `<#${config.log_channel_id}>` : 'None'}`,
        )],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'status') {
      const config   = getAntiRaidConfig(gid);
      const lockdown = isLockdownActive(gid);

      const embed = new EmbedBuilder()
        .setTitle('🛡️ Anti-Raid Status')
        .setColor(lockdown ? '#ed4245' : config.enabled ? '#57f287' : '#99aab5')
        .addFields(
          { name: 'Status',        value: config.enabled ? (lockdown ? '🚨 LOCKDOWN ACTIVE' : '✅ Enabled') : '❌ Disabled', inline: true },
          { name: 'Threshold',     value: `${config.threshold} joins / ${config.window_seconds}s`, inline: true },
          { name: 'Action',        value: config.action, inline: true },
          { name: 'Min Age',       value: config.min_age_minutes > 0 ? `${config.min_age_minutes}min` : 'Disabled', inline: true },
          { name: 'Log Channel',   value: config.log_channel_id ? `<#${config.log_channel_id}>` : 'None', inline: true },
        )
        .setTimestamp();

      return ix.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  },
};
