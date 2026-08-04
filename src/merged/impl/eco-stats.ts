/**
 * /eco-stats — merged command.
 *   balance     ← former /balance     (plain subcommand)
 *   leaderboard ← former /leaderboard (plain subcommand)
 *
 * Both were public, permission-free view commands, so the parent stays
 * public too (no setDefaultMemberPermissions).
 */

import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { wrapAsSubcommand } from '../../merged/mergeUtils';
import balanceCmd     from '../../merged/impl/balance';
import leaderboardCmd from '../../merged/impl/leaderboard';

const data = new SlashCommandBuilder()
  .setName('eco-stats')
  .setDescription('Economy stats: balance, leaderboard');

wrapAsSubcommand(data, 'balance',     'Show your balance or another user',  balanceCmd as any);
wrapAsSubcommand(data, 'leaderboard', 'Show the top 10 richest users',      leaderboardCmd as any);

export default {
  data,
  async execute(interaction: ChatInputCommandInteraction) {
    switch (interaction.options.getSubcommand()) {
      case 'balance':     return (balanceCmd as any).execute(interaction);
      case 'leaderboard': return (leaderboardCmd as any).execute(interaction);
    }
  },
};
