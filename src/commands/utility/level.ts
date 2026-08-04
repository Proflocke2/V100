/**
 * /level — merged command.
 * Combines the former /level (rank, leaderboard, set, reset) and
 * /level-setup (toggle, channel, role, remove-role, reset-user, status)
 * into one command by flattening all subcommands (10 total, no collisions).
 */

import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { copySubcommands } from '../../merged/mergeUtils';
import levelCmd from '../../merged/impl/level';
import setupCmd from '../../merged/impl/levelsetup';

const data = new SlashCommandBuilder()
  .setName('level')
  .setDescription('XP & level system — ranks, leaderboard and configuration');

const ownLevel = copySubcommands(data, levelCmd as any);
const ownSetup = copySubcommands(data, setupCmd as any);

export default {
  data,
  async execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    if (ownLevel.has(sub)) return (levelCmd as any).execute(interaction);
    if (ownSetup.has(sub)) return (setupCmd as any).execute(interaction);
  },
};
