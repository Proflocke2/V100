/**
 * /eco-config activity — toggles for the engagement features that don't
 * have their own dedicated config command: voice-XP, lucky drops, and the
 * hourly activity callout. All three default ON (see db.ts migration
 * comment) — this command is for turning individual pieces off, and for
 * pointing the activity callout at a specific channel.
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
} from 'discord.js';
import { getGuild, setGuildValue } from '../../database/db';

function requireManageGuild(interaction: ChatInputCommandInteraction): boolean {
  return !!(
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
  );
}

export default {
  data: new SlashCommandBuilder()
    .setName('activity-config')
    .setDescription('Configure voice-XP, lucky drops, and the activity callout [Admins only]')

    .addSubcommand(sub =>
      sub.setName('voice-xp')
        .setDescription('Toggle XP/coins for time spent in voice with others')
        .addBooleanOption(o => o.setName('enabled').setDescription('true = on, false = off').setRequired(true)),
    )
    .addSubcommand(sub =>
      sub.setName('lucky-drops')
        .setDescription('Toggle random coin-pouch drops in chat')
        .addBooleanOption(o => o.setName('enabled').setDescription('true = on, false = off').setRequired(true)),
    )
    .addSubcommand(sub =>
      sub.setName('callout')
        .setDescription('Toggle the hourly "most active" callout')
        .addBooleanOption(o => o.setName('enabled').setDescription('true = on, false = off').setRequired(true))
        .addChannelOption(o =>
          o.setName('channel')
            .setDescription('Where to post it (defaults to the level-up channel if unset)')
            .addChannelTypes(ChannelType.GuildText),
        ),
    )
    .addSubcommand(sub =>
      sub.setName('status').setDescription('Show current engagement-feature settings'),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!requireManageGuild(interaction)) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor('#ed4245')
          .setDescription('❌ You need **Manage Server** permission to use this command.')],
        ephemeral: true,
      });
      return;
    }

    const guildId = interaction.guildId!;
    const guild   = getGuild(guildId);
    const sub     = interaction.options.getSubcommand();

    if (sub === 'voice-xp') {
      const enabled = interaction.options.getBoolean('enabled', true);
      setGuildValue(guildId, 'voice_xp_enabled', enabled ? 1 : 0);
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(enabled ? '#57f287' : '#ed4245')
          .setDescription(enabled
            ? '✅ Voice-XP is now **on** — members earn XP/coins for shared voice time.'
            : '🔕 Voice-XP is now **off**.')],
        ephemeral: true,
      });
      return;
    }

    if (sub === 'lucky-drops') {
      const enabled = interaction.options.getBoolean('enabled', true);
      setGuildValue(guildId, 'lucky_drops_enabled', enabled ? 1 : 0);
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(enabled ? '#57f287' : '#ed4245')
          .setDescription(enabled
            ? '✅ Lucky drops are now **on** — random coin pouches may appear in chat.'
            : '🔕 Lucky drops are now **off**.')],
        ephemeral: true,
      });
      return;
    }

    if (sub === 'callout') {
      const enabled = interaction.options.getBoolean('enabled', true);
      const channel = interaction.options.getChannel('channel');
      setGuildValue(guildId, 'activity_callout_enabled', enabled ? 1 : 0);
      if (channel) setGuildValue(guildId, 'activity_callout_channel', channel.id);

      const channelNote = channel ? ` in <#${channel.id}>` : '';
      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(enabled ? '#57f287' : '#ed4245')
          .setDescription(enabled
            ? `✅ The hourly activity callout is now **on**${channelNote}.`
            : '🔕 The activity callout is now **off**.')],
        ephemeral: true,
      });
      return;
    }

    // status
    const calloutChannel = guild.activity_callout_channel || guild.level_channel;
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor('#5865f2')
        .setTitle('🎯 Engagement Feature Settings')
        .addFields(
          { name: '🎙️ Voice-XP',       value: guild.voice_xp_enabled ? '✅ On' : '🔕 Off', inline: true },
          { name: '💰 Lucky Drops',    value: guild.lucky_drops_enabled ? '✅ On' : '🔕 Off', inline: true },
          {
            name: '🔥 Activity Callout',
            value: guild.activity_callout_enabled
              ? `✅ On${calloutChannel ? ` — <#${calloutChannel}>` : ' — ⚠️ no channel set, will not post'}`
              : '🔕 Off',
            inline: true,
          },
        )
        .setTimestamp()],
      ephemeral: true,
    });
  },
};
