import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { getGuild } from '../../database/db';
import { getLocalized, Language } from '../../utils/localization';
import { msToTime } from '../../utils/helpers';
import os from 'os';

export default {
  data: new SlashCommandBuilder()
    .setName('botinfo')
    .setDescription('Bot stats and info'),

  async execute(interaction: ChatInputCommandInteraction) {
    const client = interaction.client;
    const guild = getGuild(interaction.guildId!);
    const lang = (guild.language || 'en') as Language;
    const mem = process.memoryUsage();

    const embed = new EmbedBuilder()
      .setTitle(`${client.user?.username} — ${getLocalized('botinfo.title', lang)}`)
      .setThumbnail(client.user?.displayAvatarURL() ?? null)
      .setColor('#5865f2')
      .addFields(
        { name: getLocalized('botinfo.uptime', lang), value: msToTime(client.uptime ?? 0), inline: true },
        { name: getLocalized('botinfo.servers', lang), value: client.guilds.cache.size.toString(), inline: true },
        { name: 'Users', value: client.guilds.cache.reduce((a, g) => a + g.memberCount, 0).toString(), inline: true },
        { name: 'Ping', value: `${client.ws.ping}ms`, inline: true },
        { name: 'Node.js', value: process.version, inline: true },
        { name: 'Memory', value: `${Math.round(mem.heapUsed / 1024 / 1024)} MB`, inline: true },
        { name: 'Platform', value: os.platform(), inline: true },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
