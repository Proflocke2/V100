/**
 * src/commands/hub/menu.ts
 *
 * `/menu` — the member hub. Everything a normal member ever needs, sorted into
 * seven self-explaining categories instead of ~30 separate slash commands.
 */

import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { openHub } from '../../ui/router';
import { BotClient, Command } from '../../utils/types';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('menu')
    .setDescription('All member features in one place — economy, levels, tickets, feedback')
    .setDMPermission(false),

  async execute(interaction: ChatInputCommandInteraction, client: BotClient) {
    await openHub(interaction, 'menu', client);
  },
};

export default command;
