/**
 * GAME HANDLER
 * handles game invite buttons (accept/decline) and in-game move buttons
 */

import {
  ButtonInteraction, EmbedBuilder, User, Message, TextChannel,
} from 'discord.js';
import { BotClient } from '../utils/types';
import { error, success } from '../utils/embeds';
import { GameManager, GameType, ActiveGame } from '../services/gameManager';
import {
  TTTLogic, TTTCell,
  C4Logic, C4Board, C4_P1, C4_P2,
  RPSLogic, RPSChoice, RPS_EMOJI,
} from '../services/gameLogic';
import { TTTRenderer, C4Renderer, RPSRenderer } from '../services/gameRenderer';

// ============================================================================
// INVITE HANDLERS (Accept/Decline)
// ============================================================================

/**
 * Handle accept invite button click
 * customId format: invite_accept_INVITEID
 */
export async function handleInviteAccept(
  interaction: ButtonInteraction,
  client: BotClient
): Promise<void> {
  try {
    const inviteId = interaction.customId.split('_').slice(2).join('_');
    const invite = GameManager.getInvite(inviteId);

    if (!invite) {
      await interaction.reply({
        embeds: [error('Invite expired', 'This invitation is no longer valid')],
        ephemeral: true,
      });
      return;
    }

    // only the invited user can accept
    if (interaction.user.id !== invite.invitedId) {
      await interaction.reply({
        embeds: [error('Not for you', 'Only the invited player can accept this invite')],
        ephemeral: true,
      });
      return;
    }

    // check if invited user is already in another game now (could happen if they accepted another)
    if (GameManager.isUserInGame(invite.invitedId)) {
      await interaction.reply({
        embeds: [error('Already in game', 'You are already in a game!')],
        ephemeral: true,
      });
      return;
    }

    // remove the invite
    GameManager.removeInvite(inviteId);

    // start the game!
    await startPvPGame(interaction, invite.type, invite.inviterId, invite.invitedId);
  } catch (err) {
    console.error('[Invite Accept]:', err);
  }
}

/**
 * Handle decline invite button click
 * customId format: invite_decline_INVITEID
 */
export async function handleInviteDecline(
  interaction: ButtonInteraction,
  client: BotClient
): Promise<void> {
  try {
    const inviteId = interaction.customId.split('_').slice(2).join('_');
    const invite = GameManager.getInvite(inviteId);

    if (!invite) {
      await interaction.reply({
        embeds: [error('Invite expired', 'This invitation is no longer valid')],
        ephemeral: true,
      });
      return;
    }

    // only the invited user can decline
    if (interaction.user.id !== invite.invitedId) {
      await interaction.reply({
        embeds: [error('Not for you', 'Only the invited player can decline this invite')],
        ephemeral: true,
      });
      return;
    }

    GameManager.removeInvite(inviteId);

    // notify everyone
    const embed = new EmbedBuilder()
      .setTitle('❌ Invitation Declined')
      .setDescription(`<@${invite.invitedId}> declined the **${invite.type}** invitation from <@${invite.inviterId}>.`)
      .setColor('#ed4245');

    await interaction.update({ embeds: [embed], components: [] });
  } catch (err) {
    console.error('[Invite Decline]:', err);
  }
}

/**
 * Check if a custom ID is an invite interaction
 */
export function isInviteInteraction(customId: string): boolean {
  return customId.startsWith('invite_accept_') || customId.startsWith('invite_decline_');
}

// ============================================================================
// START PVP GAME (after accept)
// ============================================================================

async function startPvPGame(
  interaction: ButtonInteraction,
  type: GameType,
  player1Id: string,
  player2Id: string
): Promise<void> {
  try {
    const player1 = await interaction.client.users.fetch(player1Id);
    const player2 = await interaction.client.users.fetch(player2Id);

    // create the game with type-specific initial state
    let initialState: any;
    if (type === 'tictactoe') {
      initialState = { grid: TTTLogic.makeGrid() };
    } else if (type === 'connectfour') {
      initialState = { board: C4Logic.makeBoard() };
    } else if (type === 'rps') {
      initialState = {
        score: { p1: 0, p2: 0 },
        round: 1,
        choices: { p1: null, p2: null },
        lastRound: null,
        finished: false,
      };
    }

    const game = GameManager.createGame({
      type,
      mode: 'pvp',
      channelId: interaction.channelId,
      player1Id,
      player2Id,
      initialState,
    });

    // render the initial game state
    let embed: EmbedBuilder;
    let components: any[];

    if (type === 'tictactoe') {
      embed = TTTRenderer.buildEmbed(game, player1, player2);
      components = TTTRenderer.buildButtons(game);
    } else if (type === 'connectfour') {
      embed = C4Renderer.buildEmbed(game, player1, player2);
      components = C4Renderer.buildButtons(game);
    } else {
      embed = RPSRenderer.buildEmbed(game, player1, player2);
      components = RPSRenderer.buildButtons(game);
    }

    // update the invite message to show the game has started
    await interaction.update({
      embeds: [embed],
      components,
    });

    // store the message ID for later updates
    GameManager.setGameMessage(game.gameId, interaction.message.id);
  } catch (err) {
    console.error('[Start PvP]:', err);
  }
}

// ============================================================================
// START PVE GAME (vs AI)
// ============================================================================

export async function startPvEGame(
  interaction: any,
  type: GameType,
  playerId: string
): Promise<void> {
  try {
    const player = await interaction.client.users.fetch(playerId);

    // create initial state per game type
    let initialState: any;
    if (type === 'tictactoe') {
      initialState = { grid: TTTLogic.makeGrid() };
    } else if (type === 'connectfour') {
      initialState = { board: C4Logic.makeBoard() };
    } else if (type === 'rps') {
      initialState = {
        score: { p1: 0, p2: 0 },
        round: 1,
        choices: { p1: null, p2: null },
        lastRound: null,
        finished: false,
      };
    }

    const game = GameManager.createGame({
      type,
      mode: 'pve',
      channelId: interaction.channelId,
      player1Id: playerId,
      player2Id: 'AI',
      initialState,
    });

    let embed: EmbedBuilder;
    let components: any[];

    if (type === 'tictactoe') {
      embed = TTTRenderer.buildEmbed(game, player, 'AI');
      components = TTTRenderer.buildButtons(game);
    } else if (type === 'connectfour') {
      embed = C4Renderer.buildEmbed(game, player, 'AI');
      components = C4Renderer.buildButtons(game);
    } else {
      embed = RPSRenderer.buildEmbed(game, player, 'AI');
      components = RPSRenderer.buildButtons(game);
    }

    const reply = await interaction.reply({
      embeds: [embed],
      components,
      fetchReply: true,
    });

    GameManager.setGameMessage(game.gameId, reply.id);
  } catch (err) {
    console.error('[Start PvE]:', err);
  }
}

// ============================================================================
// IN-GAME MOVE HANDLERS
// ============================================================================

/**
 * Check if customId is a game move
 */
export function isGameMove(customId: string): boolean {
  return customId.startsWith('game_ttt_') || customId.startsWith('game_c4_') || customId.startsWith('game_rps_');
}

/**
 * Route the move to the right game handler
 */
export async function handleGameMove(
  interaction: ButtonInteraction,
  client: BotClient
): Promise<void> {
  const customId = interaction.customId;
  
  if (customId.startsWith('game_ttt_')) {
    return handleTTTMove(interaction);
  }
  if (customId.startsWith('game_c4_')) {
    return handleC4Move(interaction);
  }
  if (customId.startsWith('game_rps_')) {
    return handleRPSMove(interaction);
  }
}

// ============================================================================
// TIC TAC TOE MOVE
// ============================================================================

async function handleTTTMove(interaction: ButtonInteraction): Promise<void> {
  try {
    // parse: game_ttt_GAMEID_INDEX
    const parts = interaction.customId.split('_');
    const idx = parseInt(parts[parts.length - 1]);
    const gameId = parts.slice(2, parts.length - 1).join('_');

    const game = GameManager.getGame(gameId);
    if (!game || game.status !== 'active') {
      await interaction.reply({
        embeds: [error('Game not found', 'This game is no longer active')],
        ephemeral: true,
      });
      return;
    }

    // verify its their turn
    if (interaction.user.id !== game.currentTurn) {
      await interaction.reply({
        content: 'It\'s not your turn!',
        ephemeral: true,
      });
      return;
    }

    const grid = game.state.grid as TTTCell[];
    if (grid[idx]) {
      await interaction.reply({ content: 'Cell already taken!', ephemeral: true });
      return;
    }

    // make the move
    const symbol = game.currentTurn === game.player1Id ? 'X' : 'O';
    grid[idx] = symbol;
    await interaction.deferUpdate();

    const player1 = await interaction.client.users.fetch(game.player1Id);
    const player2 = game.player2Id === 'AI' 
      ? 'AI' as const 
      : await interaction.client.users.fetch(game.player2Id);

    // check for winner
    const winner = TTTLogic.checkWinner(grid);
    if (winner) {
      const finalEmbed = TTTRenderer.buildEmbed(game, player1, player2, winner);
      const finalButtons = TTTRenderer.buildButtons(game, true);
      await interaction.editReply({ embeds: [finalEmbed], components: finalButtons });
      GameManager.endGame(gameId);
      return;
    }

    // switch turn
    GameManager.switchTurn(gameId);

    // render updated state
    const updatedEmbed = TTTRenderer.buildEmbed(game, player1, player2);
    const updatedButtons = TTTRenderer.buildButtons(game);
    await interaction.editReply({ embeds: [updatedEmbed], components: updatedButtons });

    // if PvE and now AI's turn, do AI move
    if (game.mode === 'pve' && game.currentTurn === 'AI') {
      await new Promise(r => setTimeout(r, 800)); // small delay for UX
      await doAITTTMove(interaction, game, player1);
    }
  } catch (err) {
    console.error('[TTT Move]:', err);
  }
}

/**
 * AI move for tic tac toe
 */
async function doAITTTMove(interaction: ButtonInteraction, game: ActiveGame, player1: User): Promise<void> {
  const grid = game.state.grid as TTTCell[];
  const move = TTTLogic.bestMove(grid);
  if (move === -1) return;

  grid[move] = 'O';

  const winner = TTTLogic.checkWinner(grid);
  if (winner) {
    const finalEmbed = TTTRenderer.buildEmbed(game, player1, 'AI', winner);
    const finalButtons = TTTRenderer.buildButtons(game, true);
    await interaction.editReply({ embeds: [finalEmbed], components: finalButtons });
    GameManager.endGame(game.gameId);
    return;
  }

  GameManager.switchTurn(game.gameId);
  const updatedEmbed = TTTRenderer.buildEmbed(game, player1, 'AI');
  const updatedButtons = TTTRenderer.buildButtons(game);
  await interaction.editReply({ embeds: [updatedEmbed], components: updatedButtons });
}

// ============================================================================
// CONNECT FOUR MOVE
// ============================================================================

async function handleC4Move(interaction: ButtonInteraction): Promise<void> {
  try {
    const parts = interaction.customId.split('_');
    const col = parseInt(parts[parts.length - 1]);
    const gameId = parts.slice(2, parts.length - 1).join('_');

    const game = GameManager.getGame(gameId);
    if (!game || game.status !== 'active') {
      await interaction.reply({
        embeds: [error('Game not found', 'This game is no longer active')],
        ephemeral: true,
      });
      return;
    }

    if (interaction.user.id !== game.currentTurn) {
      await interaction.reply({ content: 'It\'s not your turn!', ephemeral: true });
      return;
    }

    const board = game.state.board as C4Board;
    const piece = game.currentTurn === game.player1Id ? C4_P1 : C4_P2;
    
    const row = C4Logic.drop(board, col, piece);
    if (row === -1) {
      await interaction.reply({ content: 'Column is full!', ephemeral: true });
      return;
    }

    await interaction.deferUpdate();

    const player1 = await interaction.client.users.fetch(game.player1Id);
    const player2 = game.player2Id === 'AI' 
      ? 'AI' as const 
      : await interaction.client.users.fetch(game.player2Id);

    // check win
    if (C4Logic.checkWin(board, piece)) {
      const winnerKey = piece === C4_P1 ? 'p1' : 'p2';
      const finalEmbed = C4Renderer.buildEmbed(game, player1, player2, winnerKey);
      const finalButtons = C4Renderer.buildButtons(game, true);
      await interaction.editReply({ embeds: [finalEmbed], components: finalButtons });
      GameManager.endGame(game.gameId);
      return;
    }

    // check draw
    if (C4Logic.isFull(board)) {
      const finalEmbed = C4Renderer.buildEmbed(game, player1, player2, 'draw');
      const finalButtons = C4Renderer.buildButtons(game, true);
      await interaction.editReply({ embeds: [finalEmbed], components: finalButtons });
      GameManager.endGame(game.gameId);
      return;
    }

    // switch turn
    GameManager.switchTurn(game.gameId);
    const updatedEmbed = C4Renderer.buildEmbed(game, player1, player2);
    const updatedButtons = C4Renderer.buildButtons(game);
    await interaction.editReply({ embeds: [updatedEmbed], components: updatedButtons });

    // ai move if PvE
    if (game.mode === 'pve' && game.currentTurn === 'AI') {
      await new Promise(r => setTimeout(r, 800));
      await doAIC4Move(interaction, game, player1);
    }
  } catch (err) {
    console.error('[C4 Move]:', err);
  }
}

async function doAIC4Move(interaction: ButtonInteraction, game: ActiveGame, player1: User): Promise<void> {
  const board = game.state.board as C4Board;
  const aiCol = C4Logic.aiMove(board, C4_P2, C4_P1);
  if (aiCol === -1) return;

  C4Logic.drop(board, aiCol, C4_P2);

  if (C4Logic.checkWin(board, C4_P2)) {
    const finalEmbed = C4Renderer.buildEmbed(game, player1, 'AI', 'p2');
    const finalButtons = C4Renderer.buildButtons(game, true);
    await interaction.editReply({ embeds: [finalEmbed], components: finalButtons });
    GameManager.endGame(game.gameId);
    return;
  }

  if (C4Logic.isFull(board)) {
    const finalEmbed = C4Renderer.buildEmbed(game, player1, 'AI', 'draw');
    const finalButtons = C4Renderer.buildButtons(game, true);
    await interaction.editReply({ embeds: [finalEmbed], components: finalButtons });
    GameManager.endGame(game.gameId);
    return;
  }

  GameManager.switchTurn(game.gameId);
  const updatedEmbed = C4Renderer.buildEmbed(game, player1, 'AI');
  const updatedButtons = C4Renderer.buildButtons(game);
  await interaction.editReply({ embeds: [updatedEmbed], components: updatedButtons });
}

// ============================================================================
// RPS MOVE
// ============================================================================

async function handleRPSMove(interaction: ButtonInteraction): Promise<void> {
  try {
    const parts = interaction.customId.split('_');
    const choice = parts[parts.length - 1] as RPSChoice;
    const gameId = parts.slice(2, parts.length - 1).join('_');

    const game = GameManager.getGame(gameId);
    if (!game || game.status !== 'active') {
      await interaction.reply({
        embeds: [error('Game not found', 'This game is no longer active')],
        ephemeral: true,
      });
      return;
    }

    // both players need to be allowed (in PvE its just player 1)
    const isPlayer1 = interaction.user.id === game.player1Id;
    const isPlayer2 = interaction.user.id === game.player2Id;

    if (!isPlayer1 && !isPlayer2) {
      await interaction.reply({ content: 'You\'re not in this game!', ephemeral: true });
      return;
    }

    const choices = game.state.choices as { p1: RPSChoice | null; p2: RPSChoice | null };

    // record the choice
    if (isPlayer1) {
      if (choices.p1 !== null) {
        await interaction.reply({ content: 'You already chose for this round!', ephemeral: true });
        return;
      }
      choices.p1 = choice;
    } else {
      if (choices.p2 !== null) {
        await interaction.reply({ content: 'You already chose for this round!', ephemeral: true });
        return;
      }
      choices.p2 = choice;
    }

    // for PvE, AI plays immediately after player 1
    if (game.mode === 'pve' && isPlayer1) {
      choices.p2 = RPSLogic.aiChoice();
    }

    await interaction.deferUpdate();

    const player1 = await interaction.client.users.fetch(game.player1Id);
    const player2 = game.player2Id === 'AI' 
      ? 'AI' as const 
      : await interaction.client.users.fetch(game.player2Id);

    // if both players chose, calculate round result
    if (choices.p1 !== null && choices.p2 !== null) {
      const winner = RPSLogic.getResult(choices.p1, choices.p2);
      const score = game.state.score as { p1: number; p2: number };

      if (winner === 'p1') score.p1++;
      else if (winner === 'p2') score.p2++;

      game.state.lastRound = {
        p1: choices.p1,
        p2: choices.p2,
        winner,
      };

      // check if best of 3 finished
      const round = game.state.round as number;
      if (score.p1 >= 2 || score.p2 >= 2 || round >= 3) {
        game.state.finished = true;
        const finalEmbed = RPSRenderer.buildEmbed(game, player1, player2);
        const finalButtons = RPSRenderer.buildButtons(game, true);
        await interaction.editReply({ embeds: [finalEmbed], components: finalButtons });
        GameManager.endGame(game.gameId);
        return;
      }

      // continue to next round - reset choices
      game.state.round = round + 1;
      game.state.choices = { p1: null, p2: null };
    }

    // render updated state
    const updatedEmbed = RPSRenderer.buildEmbed(game, player1, player2);
    const updatedButtons = RPSRenderer.buildButtons(game, false);
    await interaction.editReply({ embeds: [updatedEmbed], components: updatedButtons });
  } catch (err) {
    console.error('[RPS Move]:', err);
  }
}

export default {
  handleInviteAccept,
  handleInviteDecline,
  isInviteInteraction,
  startPvEGame,
  isGameMove,
  handleGameMove,
};
