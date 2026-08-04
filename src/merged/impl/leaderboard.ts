import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { getGuild } from '../../database/db';
import { getLocalized, Language } from '../../utils/localization';
import { getLeaderboard } from '../../economy/db/EconomyDB';
import { EconomyConfig } from '../../economy/config/EconomyConfig';

const MEDALS = ['🥇', '🥈', '🥉'];

export default {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show the top 10 richest users'),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = getGuild(interaction.guildId!);
    const lang  = (guild.language || 'en') as Language;
    const top   = getLeaderboard(interaction.guildId!);

    const description = top.length === 0
      ? getLocalized('economy.leaderboard.empty', lang)
      : top.map((u, i) => {
          const medal  = MEDALS[i] ?? `**${i + 1}.**`;
          const points = u.points.toLocaleString();
          return `${medal} <@${u.userId}> — ${EconomyConfig.SETTINGS.currency} ${points}`;
        }).join('\n');

    const embed = new EmbedBuilder()
      .setColor('#faa61a')
      .setTitle(`${EconomyConfig.SETTINGS.currency} ${getLocalized('economy.leaderboard', lang)}`)
      .setDescription(description)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
