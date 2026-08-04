/**
 * /deploy — re-registers all slash commands on demand.
 *
 * Visible to all, executable only by the bot owner (BOT_OWNER_ID env)
 * OR server administrators.  On Render the deploy runs automatically on
 * restart, but a manual trigger is useful after hot-config changes.
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
} from 'discord.js';
import { deployCommands } from '../../handlers/deploy';
import { getLocalized, Language } from '../../utils/localization';
import { getGuild } from '../../database/db';

export default {
  data: new SlashCommandBuilder()
    .setName('deploy')
    .setDescription('Re-register all slash commands [Bot Owner / Admin only]'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId!;
    const guild   = getGuild(guildId);
    const lang    = (guild.language ?? 'en') as Language;

    // ── Permission check ────────────────────────────────────────────────────
    const ownerId = process.env.BOT_OWNER_ID ?? '';
    const isOwner = interaction.user.id === ownerId;
    const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;

    if (!isOwner && !isAdmin) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor('#ed4245')
          .setDescription('❌ Only the bot owner or server administrators can use this command.')],
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const token    = process.env.BOT_TOKEN ?? '';
    const clientId = process.env.CLIENT_ID ?? '';

    if (!token || !clientId) {
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor('#ed4245')
          .setTitle('❌ Missing environment variables')
          .setDescription('`BOT_TOKEN` or `CLIENT_ID` is not set in the environment.')],
      });
      return;
    }

    try {
      const start = Date.now();
      const summary = await deployCommands(token, clientId);
      const elapsed = Date.now() - start;

      const hasProblems = summary.brokenFiles.length > 0 || summary.rejectedCommands.length > 0;

      const lines: string[] = [
        `**Commands built:** ${summary.totalCommands}`,
        `**Guilds:** ${summary.guildsOk}/${summary.guildsTotal} clean` +
          (summary.guildsDegraded > 0 ? `, ${summary.guildsDegraded} recovered via fallback` : ''),
        `**Time:** ${elapsed}ms`,
      ];

      if (summary.brokenFiles.length > 0) {
        lines.push('', `⚠️ **${summary.brokenFiles.length} command file(s) failed to build (never sent to Discord):**`);
        for (const b of summary.brokenFiles.slice(0, 5)) lines.push(`\`${b}\``);
      }
      if (summary.rejectedCommands.length > 0) {
        lines.push('', `⚠️ **${summary.rejectedCommands.length} command(s) rejected by Discord:**`);
        for (const r of summary.rejectedCommands.slice(0, 5)) lines.push(`\`${r}\``);
      }

      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(hasProblems ? '#faa61a' : '#57f287')
          .setTitle(hasProblems ? '⚠️ Commands deployed with issues' : '✅ Commands deployed')
          .setDescription(lines.join('\n').slice(0, 4000))
          .setTimestamp()],
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor('#ed4245')
          .setTitle('❌ Deploy failed')
          .setDescription(`\`\`\`${msg.slice(0, 1800)}\`\`\``)],
      });
    }
  },
};
