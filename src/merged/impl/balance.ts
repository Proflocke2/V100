import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { getGuild } from '../../database/db';
import { getLocalized, Language } from '../../utils/localization';
import { getEconomyUser } from '../../economy/db/EconomyDB';
import { EconomyConfig } from '../../economy/config/EconomyConfig';

export default {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Show your balance or another user\'s balance')
    .addUserOption(o => o.setName('user').setDescription('User (leave empty = yourself)').setRequired(false)),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild  = getGuild(interaction.guildId!);
    const lang   = (guild.language || 'en') as Language;
    const target = interaction.options.getUser('user') ?? interaction.user;
    const user   = getEconomyUser(target.id, interaction.guildId!);

    const embed = new EmbedBuilder()
      .setColor('#faa61a')
      .setTitle(`${EconomyConfig.SETTINGS.currency} ${getLocalized('economy.balance', lang)}`)
      .setThumbnail(target.displayAvatarURL())
      .addFields(
        { name: getLocalized('common.user', lang),          value: `<@${target.id}>`,                          inline: true },
        { name: `💰 ${getLocalized('economy.balance', lang)}`, value: `${user.points.toLocaleString()} coins`, inline: true },
        { name: getLocalized('economy.games', lang),         value: String(user.gamesPlayed),                  inline: true },
        { name: getLocalized('economy.total_won', lang),     value: `${user.totalWon.toLocaleString()} coins`,  inline: true },
        { name: getLocalized('economy.total_lost', lang),    value: `${user.totalLost.toLocaleString()} coins`, inline: true },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
