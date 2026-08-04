import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { getGuild } from '../../database/db';
import { getLocalized, Language } from '../../utils/localization';

export default {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Show avatar of a user')
    .addUserOption(o => o.setName('user').setDescription('User')),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = getGuild(interaction.guildId!);
    const lang = (guild.language || 'en') as Language;
    const user = interaction.options.getUser('user') ?? interaction.user;
    const url = user.displayAvatarURL({ size: 1024, extension: 'png' });
    const embed = new EmbedBuilder()
      .setTitle(getLocalized('avatar.title', lang, { user: user.username }))
      .setColor('#5865f2')
      .setImage(url)
      .addFields({ name: 'Links', value: `[PNG](${url}) | [WEBP](${user.displayAvatarURL({ extension: 'webp', size: 1024 })})` });
    await interaction.reply({ embeds: [embed] });
  },
};
