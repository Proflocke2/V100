/**
 * GAME RENDERER
 * builds embeds and button components for the games
 */

import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, User,
} from 'discord.js';
import { ActiveGame } from './gameManager';
import {
  TTTCell, TTTLogic,
  C4Board, C4Logic, C4_EMPTY, C4_P1, C4_P2,
  RPSChoice, RPS_EMOJI, RPS_CHOICES,
} from './gameLogic';

// ============================================================================
// HELPER
// ============================================================================

/**
 * Get user display name from a user object or "AI"
 */
function getName(user: User | 'AI'): string {
  if (user === 'AI') return '🤖 AI';
  return user.toString();
}

// ============================================================================
// TIC TAC TOE
// ============================================================================

export const TTTRenderer = {
  /**
   * Build the embed for a tictactoe game
   */
  buildEmbed(game: ActiveGame, p1: User, p2: User | 'AI', winner?: 'X' | 'O' | 'draw'): EmbedBuilder {
    const grid = game.state.grid as TTTCell[];
    const turnSymbol = game.currentTurn === game.player1Id ? 'X' : 'O';
    const turnUser = game.currentTurn === game.player1Id ? p1 : p2;

    let description = `❌ ${getName(p1)}  vs  ⭕ ${getName(p2)}\n\n`;

    if (winner) {
      if (winner === 'draw') {
        description += '🤝 **It\'s a draw!**';
      } else {
        const winnerUser = winner === 'X' ? p1 : p2;
        const winSymbol = winner === 'X' ? '❌' : '⭕';
        description += `${winSymbol} **${getName(winnerUser)} wins!** 🎉`;
      }
    } else {
      description += `**Turn:** ${turnSymbol === 'X' ? '❌' : '⭕'} ${getName(turnUser)}`;
    }

    return new EmbedBuilder()
      .setTitle('⭕ Tic Tac Toe')
      .setColor(winner ? (winner === 'draw' ? '#fee75c' : '#57f287') : '#5865f2')
      .setDescription(description)
      .setFooter({ text: game.mode === 'pvp' ? 'PvP Match' : 'PvE Match' });
  },

  /**
   * Build button rows for the tictactoe board
   */
  buildButtons(game: ActiveGame, disabled = false): ActionRowBuilder<ButtonBuilder>[] {
    const grid = game.state.grid as TTTCell[];
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];

    for (let r = 0; r < 3; r++) {
      const row = new ActionRowBuilder<ButtonBuilder>();
      for (let c = 0; c < 3; c++) {
        const i = r * 3 + c;
        const cell = grid[i];
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`game_ttt_${game.gameId}_${i}`)
            .setLabel(cell === 'X' ? '❌' : cell === 'O' ? '⭕' : '\u200B')
            .setStyle(cell === 'X' ? ButtonStyle.Danger : cell === 'O' ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(disabled || !!cell)
        );
      }
      rows.push(row);
    }

    return rows;
  },
};

// ============================================================================
// CONNECT FOUR
// ============================================================================

export const C4Renderer = {
  /**
   * Build the embed for a connect four game
   */
  buildEmbed(game: ActiveGame, p1: User, p2: User | 'AI', winner?: 'p1' | 'p2' | 'draw'): EmbedBuilder {
    const board = game.state.board as C4Board;
    const turnUser = game.currentTurn === game.player1Id ? p1 : p2;
    const turnPiece = game.currentTurn === game.player1Id ? C4_P1 : C4_P2;

    let description = `${C4_P1} ${getName(p1)}  vs  ${C4_P2} ${getName(p2)}\n\n`;
    description += C4Logic.renderBoard(board);
    description += '\n\n';

    if (winner) {
      if (winner === 'draw') {
        description += '🤝 **It\'s a draw!**';
      } else {
        const winnerUser = winner === 'p1' ? p1 : p2;
        const winPiece = winner === 'p1' ? C4_P1 : C4_P2;
        description += `${winPiece} **${getName(winnerUser)} wins!** 🎉`;
      }
    } else {
      description += `**Turn:** ${turnPiece} ${getName(turnUser)}`;
    }

    return new EmbedBuilder()
      .setTitle('🔵 Connect Four')
      .setColor(winner ? (winner === 'draw' ? '#fee75c' : '#57f287') : '#5865f2')
      .setDescription(description)
      .setFooter({ text: game.mode === 'pvp' ? 'PvP Match' : 'PvE Match' });
  },

  /**
   * Build column buttons for connect four
   */
  buildButtons(game: ActiveGame, disabled = false): ActionRowBuilder<ButtonBuilder>[] {
    const board = game.state.board as C4Board;
    const row1 = new ActionRowBuilder<ButtonBuilder>();
    const row2 = new ActionRowBuilder<ButtonBuilder>();

    for (let c = 0; c < 7; c++) {
      const full = board[0][c] !== C4_EMPTY;
      const btn = new ButtonBuilder()
        .setCustomId(`game_c4_${game.gameId}_${c}`)
        .setLabel(`${c + 1}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled || full);
      
      if (c < 4) row1.addComponents(btn);
      else row2.addComponents(btn);
    }

    return [row1, row2];
  },
};

// ============================================================================
// ROCK PAPER SCISSORS (best of 3)
// ============================================================================

export const RPSRenderer = {
  /**
   * Build the rps embed
   */
  buildEmbed(game: ActiveGame, p1: User, p2: User | 'AI'): EmbedBuilder {
    const score = game.state.score as { p1: number; p2: number };
    const round = game.state.round as number;
    const choices = game.state.choices as { p1: RPSChoice | null; p2: RPSChoice | null };
    const lastRound = game.state.lastRound as { p1: RPSChoice; p2: RPSChoice; winner: 'p1' | 'p2' | 'draw' } | null;
    const finished = game.state.finished as boolean;

    let description = `🪨📄✂️ **Rock Paper Scissors** - Best of 3\n\n`;
    description += `**${getName(p1)}**: ${score.p1} | **${getName(p2)}**: ${score.p2}\n`;
    description += `**Round:** ${round}/3\n\n`;

    if (lastRound) {
      description += `**Last Round:**\n`;
      description += `${getName(p1)}: ${RPS_EMOJI[lastRound.p1]} ${lastRound.p1}\n`;
      description += `${getName(p2)}: ${RPS_EMOJI[lastRound.p2]} ${lastRound.p2}\n`;
      if (lastRound.winner === 'draw') {
        description += `→ Draw!\n\n`;
      } else {
        const roundWinner = lastRound.winner === 'p1' ? p1 : p2;
        description += `→ ${getName(roundWinner)} wins the round!\n\n`;
      }
    }

    if (finished) {
      const totalWinner = score.p1 > score.p2 ? p1 : score.p2 > score.p1 ? p2 : null;
      if (totalWinner) {
        description += `🎉 **${getName(totalWinner)} wins the match!**`;
      } else {
        description += `🤝 **Match ended in a draw!**`;
      }
    } else {
      // show who needs to make a choice
      if (choices.p1 === null && choices.p2 === null) {
        description += `Both players, make your choice!`;
      } else if (choices.p1 !== null && choices.p2 === null) {
        description += `Waiting for ${getName(p2)}...`;
      } else if (choices.p2 !== null && choices.p1 === null) {
        description += `Waiting for ${getName(p1)}...`;
      }
    }

    return new EmbedBuilder()
      .setTitle('🪨📄✂️ Rock Paper Scissors')
      .setColor(finished ? '#57f287' : '#5865f2')
      .setDescription(description)
      .setFooter({ text: game.mode === 'pvp' ? 'PvP Match' : 'PvE Match' });
  },

  /**
   * Build the rps choice buttons
   */
  buildButtons(game: ActiveGame, disabled = false): ActionRowBuilder<ButtonBuilder>[] {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (const choice of RPS_CHOICES) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`game_rps_${game.gameId}_${choice}`)
          .setLabel(`${RPS_EMOJI[choice]} ${choice[0].toUpperCase() + choice.slice(1)}`)
          .setStyle(ButtonStyle.Primary)
          .setDisabled(disabled)
      );
    }
    return [row];
  },
};
