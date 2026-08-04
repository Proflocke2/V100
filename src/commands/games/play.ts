/**
 * /play - PvE game command (play vs AI)
 */

import {
  SlashCommandBuilder, ChatInputCommandInteraction,
} from 'discord.js';
import { BotClient } from '../../utils/types';
import { error } from '../../utils/embeds';
import { GameManager, GameType } from '../../services/gameManager';
import { startPvEGame } from '../../handlers/gameHandler';

export default {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a game against the AI')
    .addStringOption(o =>
      o.setName('game')
        .setDescription('Which game to play')
        .setRequired(true)
        .addChoices(
          { name: 'Tic Tac Toe', value: 'tictactoe' },
          { name: 'Connect Four', value: 'connectfour' },
          { name: 'Rock Paper Scissors', value: 'rps' }
        )
    ),

  async execute(interaction: ChatInputCommandInteraction, client: BotClient) {
    const gameType = interaction.options.getString('game', true) as GameType;

    // check if user is already in a game
    if (GameManager.isUserInGame(interaction.user.id)) {
      return interaction.reply({
        embeds: [error('Already in game', 'Finish your current game first!')],
        ephemeral: true,
      });
    }

    // start the PvE game
    await startPvEGame(interaction, gameType, interaction.user.id);
  },
};
