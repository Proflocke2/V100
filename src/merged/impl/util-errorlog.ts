/**
 * /errorlog — Bot-Owner/Admin-only insight into the self-built error
 * tracker (modules/errorTracking). Same permission pattern as /deploy:
 * BOT_OWNER_ID env OR server Administrator.
 *
 *   recent [source]    ← last 20 errors, optionally filtered by source
 *   stats              ← error counts grouped by source, last 24h
 *   setchannel channel ← where CRITICAL_SOURCES alerts get posted live
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ChannelType,
  PermissionFlagsBits,
} from 'discord.js';
import { success, error, info } from '../../utils/embeds';
import { getRecentErrors, getErrorStats } from '../../modules/errorTracking/service';
import { setErrorLogChannel } from '../../modules/errorTracking/repository';

const data = new SlashCommandBuilder()
  .setName('errorlog')
  .setDescription('View internal error tracking [Bot Owner / Admin only]')

  .addSubcommand(s =>
    s.setName('recent')
      .setDescription('Show the most recent errors')
      .addStringOption(o => o.setName('source').setDescription('Filter by exact source, e.g. command:ban')),
  )

  .addSubcommand(s => s.setName('stats').setDescription('Error counts grouped by source (last 24h)'))

  .addSubcommand(s =>
    s.setName('setchannel')
      .setDescription('Set the channel critical errors get posted to live')
      .addChannelOption(o =>
        o.setName('channel').setDescription('Channel for critical error alerts').setRequired(true)
          .addChannelTypes(ChannelType.GuildText),
      ),
  );

export default {
  data,
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    // ── Permission check — same pattern as /deploy ──────────────────────────
    const ownerId = process.env.BOT_OWNER_ID ?? '';
    const isOwner = interaction.user.id === ownerId;
    const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;

    if (!isOwner && !isAdmin) {
      await interaction.reply({
        embeds: [error('No permission', 'Only the bot owner or server administrators can use this command.')],
        ephemeral: true,
      });
      return;
    }

    const sub = interaction.options.getSubcommand();

    // ── recent ─────────────────────────────────────────────────────────────
    if (sub === 'recent') {
      const source = interaction.options.getString('source') ?? undefined;
      const errors = getRecentErrors(20, source);

      if (errors.length === 0) {
        await interaction.reply({ embeds: [info('No errors', source ? `No errors for source \`${source}\`.` : 'No errors logged.')], ephemeral: true });
        return;
      }

      const lines = errors.map(e =>
        `<t:${e.created_at}:R> \`${e.source}\` — ${e.message.slice(0, 100)}${e.message.length > 100 ? '…' : ''}`,
      );

      await interaction.reply({
        embeds: [info(`🐛 Recent Errors (${errors.length})${source ? ` — ${source}` : ''}`, lines.join('\n').slice(0, 4000))],
        ephemeral: true,
      });
      return;
    }

    // ── stats ──────────────────────────────────────────────────────────────
    if (sub === 'stats') {
      const stats = getErrorStats(24);

      if (stats.length === 0) {
        await interaction.reply({ embeds: [info('No Errors', 'No errors have been logged in the last 24h.')], ephemeral: true });
        return;
      }

      const total = stats.reduce((sum, s) => sum + s.count, 0);
      const lines = stats.map(s => `\`${s.source}\` — **${s.count}**`);

      await interaction.reply({
        embeds: [info(`📊 Error Statistics (last 24h, total: ${total})`, lines.join('\n').slice(0, 4000))],
        ephemeral: true,
      });
      return;
    }

    // ── setchannel ─────────────────────────────────────────────────────────
    if (sub === 'setchannel') {
      const channel = interaction.options.getChannel('channel', true);
      setErrorLogChannel(channel.id, interaction.guildId!);

      await interaction.reply({
        embeds: [success('Error Log Channel Set', `Critical errors (\`process:*\`, \`scheduler:*\`) will now be posted live in <#${channel.id}>.`)],
        ephemeral: true,
      });
      return;
    }
  },
};
