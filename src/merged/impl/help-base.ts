/**
 * /help — interactive command browser. Shows a dropdown to pick which
 * area you need help with (games, economy, moderation, tickets, utility,
 * welcome), plus a "download everything" option for the full plain-
 * English .txt guide this always used to send outright.
 *
 * The dropdown parses docs/commandGuideText.ts on the fly (see
 * modules/help/service.ts) — that file stays the single source of truth
 * for command documentation; update it there and both the file download
 * and the dropdown browser pick up the change automatically.
 */

import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { buildHelpMenu, buildIntroEmbed } from '../../modules/help/service';

export default {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Browse bot commands by area, or download the full guide'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.reply({
      embeds: [buildIntroEmbed()],
      components: [buildHelpMenu()],
      ephemeral: true,
    });
  },
};
