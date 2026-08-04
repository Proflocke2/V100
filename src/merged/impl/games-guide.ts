/**
 * /guide — In-game guide for every game, fully localized
 */
import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, MessageFlags,
} from 'discord.js';
import { getLocalized, Language } from '../../utils/localization';
import { getGuild } from '../../database/db';

const GAMES = [
  'chess','battleship','connectfour','yahtzee','uno','mastermind',
  'truthordare','wouldyourather','ghostsagainst','memelord','guesssong',
  'rps','hangman','minesweeper','numguess','quiz','dice',
];

export default {
  data: new SlashCommandBuilder()
    .setName('guide')
    .setDescription('How to play any game')
    .setDMPermission(false)
    .addStringOption(o => o
      .setName('game')
      .setDescription('Which game?')
      .setRequired(true)
      .addChoices(
        {name:'♟️ Chess',              value:'chess'},
        {name:'🎯 Battleship',         value:'battleship'},
        {name:'🔴 Connect Four',       value:'connectfour'},
        {name:'🎲 Yahtzee',            value:'yahtzee'},
        {name:'🃏 UNO',                value:'uno'},
        {name:'🔐 Mastermind',         value:'mastermind'},
        {name:'🎯 Truth or Dare',      value:'truthordare'},
        {name:'🤔 Would You Rather',   value:'wouldyourather'},
        {name:'🃏 Ghosts Against',     value:'ghostsagainst'},
        {name:'😂 Memelord',           value:'memelord'},
        {name:'🎵 Guess the Song',     value:'guesssong'},
        {name:'✊ Rock Paper Scissors', value:'rps'},
        {name:'🪢 Hangman',            value:'hangman'},
        {name:'💣 Minesweeper',        value:'minesweeper'},
        {name:'🔢 Number Guess',       value:'numguess'},
        {name:'❓ Quiz',               value:'quiz'},
        {name:'🎲 Dice',               value:'dice'},
        {name:'🃏 Higher or Lower',    value:'higherorlower'},
      )),

  async execute(ix: ChatInputCommandInteraction) {
    const lang = (getGuild(ix.guildId!)?.language || 'en') as Language;
    const game = ix.options.getString('game', true);
    const key  = `guide.${game}` as any;
    const text = getLocalized(key, lang);

    await ix.reply({
      embeds: [new EmbedBuilder()
        .setColor('#5865f2')
        .setDescription(text || `No guide available for \`${game}\`.`)],
      flags: MessageFlags.Ephemeral,
    });
  },
};
