import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { getGuild } from '../../database/db';
import { reservePoints, addPoints, recordLoss } from '../../economy/db/EconomyDB';
import { getLocalized, Language } from '../../utils/localization';

export default {
  data: new SlashCommandBuilder()
    .setName('dice')
    .setDescription('Roll dice (e.g. 2d6)')
    .addStringOption(o => o.setName('notation').setDescription('Dice notation like 2d6, 1d20').setRequired(true)),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = getGuild(interaction.guildId!);
    const lang = (guild.language || 'en') as Language;
    const notation = interaction.options.getString('notation', true);
    const match = notation.match(/^(\d+)d(\d+)$/i);
    if (!match) return interaction.reply({ content: 'Invalid notation. Use format like `2d6` or `1d20`.', ephemeral: true });

    const count = Math.min(parseInt(match[1]), 20);
    const sides = Math.min(parseInt(match[2]), 1000);
    if (sides < 1 || count < 1) return interaction.reply({ content: 'Invalid dice.', ephemeral: true });

    const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
    const total = rolls.reduce((a, b) => a + b, 0);

    const embed = new EmbedBuilder()
      .setTitle(`🎲 ${notation.toUpperCase()}`)
      .setColor('#5865f2')
      .addFields(
        { name: 'Rolls', value: rolls.join(', '), inline: true },
        { name: 'Total', value: String(total), inline: true },
      );

    await interaction.reply({ embeds: [embed] });
  },
};
