/**
 * V-SETUP COMMAND
 * /v-setup - configure the verification system
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType,
  TextChannel,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} from 'discord.js';
import { BotClient } from '../../utils/types';
import { success, error, info } from '../../utils/embeds';
import { VerificationService } from '../../services/verificationService';

export default {
  data: new SlashCommandBuilder()
    .setName('v-setup')
    .setDescription('Configure the verification system')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(s =>
      s
        .setName('configure')
        .setDescription('Setup verification roles and channel')
        .addRoleOption(o =>
          o.setName('verified_role')
            .setDescription('Role given to verified users')
            .setRequired(true)
        )
        .addChannelOption(o =>
          o.setName('verify_channel')
            .setDescription('Channel where the verify button will be posted')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addRoleOption(o =>
          o.setName('unverified_role')
            .setDescription('Role removed when verifying (optional)')
            .setRequired(false)
        )
        .addChannelOption(o =>
          o.setName('log_channel')
            .setDescription('Channel for verification audit logs (optional)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
        .addStringOption(o =>
          o.setName('message')
            .setDescription('Custom message shown above verify button')
            .setRequired(false)
        )
    )
    .addSubcommand(s =>
      s
        .setName('post')
        .setDescription('Post the verify panel in the configured channel')
    )
    .addSubcommand(s =>
      s
        .setName('status')
        .setDescription('Show current verification config and stats')
    )
    .addSubcommand(s =>
      s
        .setName('toggle')
        .setDescription('Enable or disable verification')
        .addBooleanOption(o =>
          o.setName('enabled').setDescription('Enable or disable').setRequired(true)
        )
    ),

  async execute(interaction: ChatInputCommandInteraction, client: BotClient) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'configure') return handleConfigure(interaction);
    if (sub === 'post') return handlePost(interaction);
    if (sub === 'status') return handleStatus(interaction);
    if (sub === 'toggle') return handleToggle(interaction);
  },
};

// ============================================================================
// HANDLERS
// ============================================================================

async function handleConfigure(interaction: ChatInputCommandInteraction) {
  const verifiedRole = interaction.options.getRole('verified_role', true);
  const verifyChannel = interaction.options.getChannel('verify_channel', true);
  const unverifiedRole = interaction.options.getRole('unverified_role');
  const logChannel = interaction.options.getChannel('log_channel');
  const message = interaction.options.getString('message');

  await interaction.deferReply({ ephemeral: true });

  try {
    // Get guild from cache or directly from the client
    const guildId = interaction.guildId!;
    const guild = interaction.guild
      ?? interaction.client.guilds.cache.get(guildId)
      ?? await interaction.client.guilds.fetch(guildId).catch(() => null);

    if (!guild) {
      return interaction.editReply({
        embeds: [error('Error', 'Could not load the server. Make sure the bot is in this server.')],
      });
    }

    // Fetch bot member directly from API (cache may be empty on Render)
    const me = await guild.members.fetchMe().catch(() => null);

    // Check role hierarchy only if we could fetch the bot member
    if (me) {
      const verifiedRoleObj = await guild.roles.fetch(verifiedRole.id).catch(() => null);
      if (verifiedRoleObj && me.roles.highest.position <= verifiedRoleObj.position) {
        return interaction.editReply({
          embeds: [error(
            'Role Hierarchy Problem',
            `The bot's highest role must be **above** the role ${verifiedRole.name}!\n\nMove the bot's role higher up in Server Settings → Roles.`,
          )],
        });
      }
    }

    // save the config
    VerificationService.saveConfig({
      guildId: interaction.guildId!,
      enabled: true,
      verifiedRoleId: verifiedRole.id,
      verificationChannelId: verifyChannel.id,
      unverifiedRoleId: unverifiedRole?.id ?? null,
      logChannelId: logChannel?.id ?? null,
      message: message ?? 'Click the button below to verify yourself',
    });

    // log the config change
    if (guild) {
      await VerificationService.logAction(
        guild,
        interaction.user,
        'config_changed',
        `Configured by ${interaction.user.tag}`
      ).catch(() => {});
    }

    const embed = new EmbedBuilder()
      .setTitle('✅ Verification Configured')
      .setColor('#57f287')
      .addFields(
        { name: 'Verified Role', value: `<@&${verifiedRole.id}>`, inline: true },
        { name: 'Verify Channel', value: `<#${verifyChannel.id}>`, inline: true },
        { name: 'Unverified Role', value: unverifiedRole ? `<@&${unverifiedRole.id}>` : '*Not set*', inline: true },
        { name: 'Log Channel', value: logChannel ? `<#${logChannel.id}>` : '*Not set*', inline: true },
        { name: 'Status', value: '🟢 Enabled', inline: true },
      )
      .setFooter({ text: 'Use /v-setup post to publish the verify panel' });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error('[v-setup configure]:', err);
    await interaction.editReply({
      embeds: [error('Configuration failed', String(err))],
    });
  }
}

async function handlePost(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const config = VerificationService.getConfig(interaction.guildId!);
    if (!config) {
      return interaction.editReply({
        embeds: [error('Verification not configured', 'Run `/v-setup configure` to set up verification first.')],
      });
    }

    if (!config.verificationChannelId) {
      return interaction.editReply({
        embeds: [error('No verify channel set', 'A verify channel must be configured — run `/v-setup configure` and set the `verify_channel` option.')],
      });
    }

    const gid = interaction.guildId!;
    const guild = interaction.guild
      ?? interaction.client.guilds.cache.get(gid)
      ?? await interaction.client.guilds.fetch(gid).catch(() => null);

    // get the channel
    const channel = await guild?.channels.fetch(config.verificationChannelId);
    if (!channel?.isTextBased()) {
      return interaction.editReply({
        embeds: [error('Verify channel not found', 'Channel was deleted or moved?')],
      });
    }

    // build the verify panel embed
    const embed = new EmbedBuilder()
      .setTitle('🔐 Server Verification')
      .setDescription([
        config.message,
        '',
        '**How it works:**',
        '1️⃣ Click the **Verify** button below',
        '2️⃣ Solve a quick captcha',
        '3️⃣ Get access to the server!',
        '',
        '*This helps us keep bots and spammers out.*',
      ].join('\n'))
      .setColor('#5865f2')
      .setFooter({ text: 'Powered by MultiBot Verification' });

    // verify button
    const button = new ButtonBuilder()
      .setCustomId('verify_button')
      .setLabel('Verify')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅');

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

    await (channel as TextChannel).send({
      embeds: [embed],
      components: [row],
    });

    await interaction.editReply({
      embeds: [success('Panel posted ✓', `Verify panel was sent to <#${channel.id}>`)],
    });
  } catch (err) {
    console.error('[v-setup post]:', err);
    await interaction.editReply({
      embeds: [error('Failed to post panel', String(err))],
    });
  }
}

async function handleStatus(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const config = VerificationService.getConfig(interaction.guildId!);
    
    if (!config) {
      return interaction.editReply({
        embeds: [info('Verification not set up', "Run `/v-setup configure` to enable verification. You'll need: a verified role, an unverified role, and a verify channel.")],
      });
    }

    // get stats
    const stats = VerificationService.getStats(interaction.guildId!);

    const embed = new EmbedBuilder()
      .setTitle('📊 Verification Status')
      .setColor(config.enabled ? '#57f287' : '#ed4245')
      .addFields(
        { name: 'Status', value: config.enabled ? '🟢 Enabled' : '🔴 Disabled', inline: true },
        { 
          name: 'Verified Role', 
          value: config.verifiedRoleId ? `<@&${config.verifiedRoleId}>` : '*Not set*', 
          inline: true,
        },
        { 
          name: 'Verify Channel', 
          value: config.verificationChannelId ? `<#${config.verificationChannelId}>` : '*Not set*', 
          inline: true,
        },
        { 
          name: 'Unverified Role', 
          value: config.unverifiedRoleId ? `<@&${config.unverifiedRoleId}>` : '*Not set*', 
          inline: true,
        },
        { 
          name: 'Log Channel', 
          value: config.logChannelId ? `<#${config.logChannelId}>` : '*Not set*', 
          inline: true,
        },
        { name: '\u200B', value: '\u200B', inline: true }, // empty for spacing
        { name: '📈 Total Attempts', value: stats.total.toString(), inline: true },
        { name: '✅ Successful', value: stats.success.toString(), inline: true },
        { name: '❌ Failed', value: stats.failed.toString(), inline: true },
        { name: '🕐 Last 24h', value: stats.last24h.toString(), inline: true },
      );

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error('[v-setup status]:', err);
    await interaction.editReply({
      embeds: [error('Failed to get status', String(err))],
    });
  }
}

async function handleToggle(interaction: ChatInputCommandInteraction) {
  const enabled = interaction.options.getBoolean('enabled', true);

  await interaction.deferReply({ ephemeral: true });

  try {
    const config = VerificationService.getConfig(interaction.guildId!);
    if (!config) {
      return interaction.editReply({
        embeds: [error('Verification not configured', 'Run `/v-setup configure` to set up verification first.')],
      });
    }

    VerificationService.saveConfig({
      guildId: interaction.guildId!,
      enabled,
    });

    const toggleGuild = interaction.guild
      ?? interaction.client.guilds.cache.get(interaction.guildId!)
      ?? await interaction.client.guilds.fetch(interaction.guildId!).catch(() => null);
    if (toggleGuild) {
      await VerificationService.logAction(
        toggleGuild,
        interaction.user,
        'config_changed',
        `Verification ${enabled ? 'enabled' : 'disabled'} by ${interaction.user.tag}`
      ).catch(() => {});
    }

    await interaction.editReply({
      embeds: [
        success(
          enabled ? 'Verification Enabled ✓' : 'Verification Disabled',
          enabled ? 'Users can now verify themselves' : 'Verify button is now inactive'
        ),
      ],
    });
  } catch (err) {
    console.error('[v-setup toggle]:', err);
    await interaction.editReply({
      embeds: [error('Toggle failed', String(err))],
    });
  }
}
