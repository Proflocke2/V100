import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder , MessageFlags } from 'discord.js';
import { getGuild } from '../../database/db';
import { reservePoints, addPoints, recordLoss } from '../../economy/db/EconomyDB';
import { getLocalized, Language } from '../../utils/localization';

const DIFFICULTIES = {
  easy: { rows: 5, cols: 5, mines: 5 },
  medium: { rows: 7, cols: 7, mines: 10 },
  hard: { rows: 8, cols: 8, mines: 16 },
};

const NUMBER_EMOJIS = ['0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣'];

export default {
  data: new SlashCommandBuilder()
    .setName('minesweeper')
    .setDescription('Play Minesweeper')
    .addStringOption(o => o.setName('difficulty').setDescription('Difficulty').addChoices(
      { name: 'Easy (5x5)', value: 'easy' },
      { name: 'Medium (7x7)', value: 'medium' },
      { name: 'Hard (8x8)', value: 'hard' },
    )),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = getGuild(interaction.guildId!);
    const lang = (guild.language || 'en') as Language;
    const diff = (interaction.options.getString('difficulty') ?? 'easy') as keyof typeof DIFFICULTIES;
    const { rows, cols, mines } = DIFFICULTIES[diff];

    const grid: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));

    // Place mines
    let placed = 0;
    while (placed < mines) {
      const r = Math.floor(Math.random() * rows);
      const c = Math.floor(Math.random() * cols);
      if (grid[r][c] !== -1) {
        grid[r][c] = -1;
        placed++;
      }
    }

    // Calculate numbers
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r][c] === -1) continue;
        let count = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc] === -1) count++;
          }
        }
        grid[r][c] = count;
      }
    }

    // Build spoiler text
    const board = grid.map(row =>
      row.map(cell => cell === -1 ? '||💣||' : `||${NUMBER_EMOJIS[cell]}||`).join('')
    ).join('\n');

    const embed = new EmbedBuilder()
      .setTitle('💣 Minesweeper')
      .setColor('#fee75c')
      .setDescription(board)
      .setFooter({ text: `${diff} • ${mines} mines — Click to reveal` });

    await interaction.reply({ embeds: [embed] });
  },
};
