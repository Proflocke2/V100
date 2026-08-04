/**
 * /games — merged command.
 * Bundles 22 formerly-standalone game commands as subcommands / subcommand-groups.
 * Nothing about the individual game logic changed — each original command's
 * `data` (options) and `execute` were moved verbatim to ../../merged/impl/*
 * and are just wired up here. Routing forwards to the original execute(),
 * which still reads interaction.options.* exactly as before.
 *
 * Flat subcommands (no options of their own beyond what they already had):
 *   dice, ghostsagainst, guesssong, hangman, higherorlower, memelord,
 *   minesweeper, numguess, quiz, tictactoe, triviaduel, truthordare, uno,
 *   whoami, wordle, wouldyourather
 *
 * Subcommand groups (games that already had their own subcommands):
 *   battleship, chess, connectfour, mastermind, rps, yahtzee
 */

import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { BotClient } from '../../utils/types';
import { wrapAsSubcommand, copyAsSubcommandGroup } from '../../merged/mergeUtils';

import diceCmd from '../../merged/impl/dice';
import ghostsagainstCmd from '../../merged/impl/ghostsagainst';
import guesssongCmd from '../../merged/impl/guesssong';
import hangmanCmd from '../../merged/impl/hangman';
import higherorlowerCmd from '../../merged/impl/higherorlower';
import memelordCmd from '../../merged/impl/memelord';
import minesweeperCmd from '../../merged/impl/minesweeper';
import numguessCmd from '../../merged/impl/numguess';
import quizCmd from '../../merged/impl/quiz';
import tictactoeCmd from '../../merged/impl/tictactoe';
import triviaduelCmd from '../../merged/impl/triviaduel';
import truthordareCmd from '../../merged/impl/truthordare';
import unoCmd from '../../merged/impl/uno';
import whoamiCmd from '../../merged/impl/whoami';
import wordleCmd from '../../merged/impl/wordle';
import wouldyouratherCmd from '../../merged/impl/wouldyourather';

import battleshipCmd from '../../merged/impl/battleship';
import chessCmd from '../../merged/impl/chess';
import connectfourCmd from '../../merged/impl/connectfour';
import mastermindCmd from '../../merged/impl/mastermind';
import rpsCmd from '../../merged/impl/rps';
import yahtzeeCmd from '../../merged/impl/yahtzee';
import gamesGuideCmd from '../../merged/impl/games-guide';

const data = new SlashCommandBuilder()
  // Renamed from 'games' to 'games-impl': the public /games command is now the
  // wizard hub (src/commands/hub/games.ts). This definition is no longer
  // registered with Discord, it only stays loaded so the hub can execute each
  // game through the interaction bridge — the game logic itself is untouched.
  .setName('games-impl')
  .setDescription('Play a game — pick one from the list')
  .setDMPermission(false);

wrapAsSubcommand(data, 'dice', 'Roll dice (e.g. 2d6)', diceCmd as any);
wrapAsSubcommand(data, 'ghostsagainst', 'Ghosts Against Discord — Cards Against Humanity style! 🃏 (3-8 players)', ghostsagainstCmd as any);
wrapAsSubcommand(data, 'guesssong', 'Guess the Song from emoji & lyric clues! 🎵', guesssongCmd as any);
wrapAsSubcommand(data, 'hangman', 'Play hangman', hangmanCmd as any);
wrapAsSubcommand(data, 'higherorlower', 'Higher or Lower — guess the next card! 🃏', higherorlowerCmd as any);
wrapAsSubcommand(data, 'memelord', 'Memelord — write the funniest meme caption! 😂', memelordCmd as any);
wrapAsSubcommand(data, 'minesweeper', 'Play Minesweeper', minesweeperCmd as any);
wrapAsSubcommand(data, 'numguess', 'Guess the number (1-100)', numguessCmd as any);
wrapAsSubcommand(data, 'quiz', 'Answer a trivia question', quizCmd as any);
wrapAsSubcommand(data, 'tictactoe', 'Play Tic-Tac-Toe ❌⭕', tictactoeCmd as any);
wrapAsSubcommand(data, 'triviaduel', 'Challenge someone to a Trivia Duel (first to 5 wins)', triviaduelCmd as any);
wrapAsSubcommand(data, 'truthordare', 'Truth or Dare 🎯', truthordareCmd as any);
wrapAsSubcommand(data, 'uno', 'Play UNO — 2-4 players! 🃏', unoCmd as any);
wrapAsSubcommand(data, 'whoami', 'Who Am I? — one player picks a character, others ask Yes/No questions', whoamiCmd as any);
wrapAsSubcommand(data, 'wordle', 'Daily Wordle — guess the 5-letter word', wordleCmd as any);
wrapAsSubcommand(data, 'wouldyourather', 'Would You Rather? — vote, debate, survive! 🤔', wouldyouratherCmd as any);
wrapAsSubcommand(data, 'guide', 'How to play any game', gamesGuideCmd as any);

copyAsSubcommandGroup(data, 'battleship', 'Battleship — place ships & sink the enemy fleet! 🎯', battleshipCmd as any);
copyAsSubcommandGroup(data, 'chess', 'Chess — full rules via chess.js, select piece & target ♟️', chessCmd as any);
copyAsSubcommandGroup(data, 'connectfour', 'Connect Four + variants 🔴🟡', connectfourCmd as any);
copyAsSubcommandGroup(data, 'mastermind', 'Mastermind — crack the secret color code! 🔐', mastermindCmd as any);
copyAsSubcommandGroup(data, 'rps', 'Rock Paper Scissors ✊', rpsCmd as any);
copyAsSubcommandGroup(data, 'yahtzee', 'Play Yahtzee — roll, hold, score! 🎲', yahtzeeCmd as any);

const FLAT: Record<string, any> = {
  dice: diceCmd, ghostsagainst: ghostsagainstCmd, guesssong: guesssongCmd, hangman: hangmanCmd,
  higherorlower: higherorlowerCmd, memelord: memelordCmd, minesweeper: minesweeperCmd,
  numguess: numguessCmd, quiz: quizCmd, tictactoe: tictactoeCmd, triviaduel: triviaduelCmd,
  truthordare: truthordareCmd, uno: unoCmd, whoami: whoamiCmd, wordle: wordleCmd,
  wouldyourather: wouldyouratherCmd, guide: gamesGuideCmd,
};

const GROUPED: Record<string, any> = {
  battleship: battleshipCmd, chess: chessCmd, connectfour: connectfourCmd,
  mastermind: mastermindCmd, rps: rpsCmd, yahtzee: yahtzeeCmd,
};

export default {
  data,
  async execute(interaction: ChatInputCommandInteraction, client: BotClient) {
    const group = interaction.options.getSubcommandGroup(false);
    if (group) {
      const target = GROUPED[group];
      if (target) return target.execute(interaction, client);
      return;
    }
    const sub = interaction.options.getSubcommand();
    const target = FLAT[sub];
    if (target) return target.execute(interaction, client);
  },
};
