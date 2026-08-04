import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, Role } from 'discord.js';
import { getGuild } from '../../database/db';
import { getLocalized, Language } from '../../utils/localization';

export default {
  data: new SlashCommandBuilder()
    .setName('roleinfo')
    .setDescription('Info about a role')
    .addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true)),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = getGuild(interaction.guildId!);
    const lang = (guild.language || 'en') as Language;
    const role = interaction.options.getRole('role', true) as Role;
    const embed = new EmbedBuilder()
      .setTitle(role.name)
      .setColor(role.hexColor || '#5865f2')
      .addFields(
        { name: 'ID', value: role.id, inline: true },
        { name: 'Color', value: role.hexColor, inline: true },
        { name: getLocalized('serverinfo.members', lang), value: role.members.size.toString(), inline: true },
        { name: 'Mentionable', value: role.mentionable ? 'Yes' : 'No', inline: true },
        { name: 'Hoisted', value: role.hoist ? 'Yes' : 'No', inline: true },
        { name: 'Position', value: String(role.position), inline: true },
        { name: getLocalized('serverinfo.created', lang), value: `<t:${Math.floor(role.createdTimestamp / 1000)}:R>`, inline: true },
      );
    await interaction.reply({ embeds: [embed] });
  },
};
