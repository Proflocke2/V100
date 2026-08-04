import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { getGuild } from '../../database/db';
import { getLocalized, Language } from '../../utils/localization';

export default {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot latency'),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = getGuild(interaction.guildId!);
    const lang = (guild.language || 'en') as Language;

    const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    const ws = interaction.client.ws.ping;

    const embed = new EmbedBuilder()
      .setTitle(getLocalized('ping.title', lang))
      .setColor('#5865f2')
      .addFields(
        { name: getLocalized('ping.latency', lang), value: `${latency}ms`, inline: true },
        { name: getLocalized('ping.websocket', lang), value: `${ws}ms`, inline: true },
      );
    await interaction.editReply({ content: '', embeds: [embed] });
  },
};
