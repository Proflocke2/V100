import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, GuildMember } from 'discord.js';
import { getGuild } from '../../database/db';
import { getLocalized, Language } from '../../utils/localization';

export default {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Show user info')
    .addUserOption(o => o.setName('user').setDescription('User')),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = getGuild(interaction.guildId!);
    const lang = (guild.language || 'en') as Language;
    
    const target = interaction.options.getMember('user') as GuildMember | null ?? interaction.member as GuildMember;
    const user = target.user;
    const roles = target.roles.cache.filter(r => r.id !== interaction.guildId).map(r => r.toString()).slice(0, 10).join(' ') || 'None';

    const embed = new EmbedBuilder()
      .setTitle(user.tag)
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .setColor(target.displayHexColor || '#5865f2')
      .addFields(
        { name: 'ID', value: user.id, inline: true },
        { name: 'Nickname', value: target.nickname ?? 'None', inline: true },
        { name: getLocalized('userinfo.joined', lang), value: `<t:${Math.floor((target.joinedTimestamp ?? 0) / 1000)}:R>`, inline: true },
        { name: getLocalized('userinfo.registered', lang), value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
        { name: `${getLocalized('userinfo.roles', lang)} (${target.roles.cache.size - 1})`, value: roles },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
