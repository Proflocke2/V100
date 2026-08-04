/**
 * src/commands/hub/games.ts
 *
 * `/games` — the game launcher. Replaces 23 subcommands with a picker that
 * sorts every game into Solo, Duell, Party and Einsatz.
 *
 * The original merged command still exists as `games-impl`; it is no longer
 * registered with Discord, but stays loaded so the wizard can invoke its
 * execute() through the bridge — game logic untouched.
 */

import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { openHub } from '../../ui/router';
import { BotClient, Command } from '../../utils/types';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('games')
    .setDescription('Game Center — solo, duels, party and coin bets')
    .setDMPermission(false),

  async execute(interaction: ChatInputCommandInteraction, client: BotClient) {
    await openHub(interaction, 'games', client);
  },
};

export default command;
