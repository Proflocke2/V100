import { requirePermission } from '../../utils/guards';
import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, GuildMember } from 'discord.js';
import { getGuild } from '../../database/db';
import { getLocalized, Language } from '../../utils/localization';
import { success, error } from '../../utils/embeds';

export default {
  data: new SlashCommandBuilder()
    .setName('role')
    .setDescription('Add or remove a role from a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand(s => s.setName('add').setDescription('Add role')
      .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
      .addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true)))
    .addSubcommand(s => s.setName('remove').setDescription('Remove role')
      .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
      .addRoleOption(o => o.setName('role').setDescription('Role').setRequired(true))),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!await requirePermission(interaction, PermissionFlagsBits.ManageRoles)) return;
    const guild = getGuild(interaction.guildId!);
    const lang = (guild.language || 'en') as Language;
    const sub = interaction.options.getSubcommand();
    const member = interaction.options.getMember('user') as GuildMember;
    const role = interaction.options.getRole('role', true);

    if (!member) return interaction.reply({ embeds: [error(getLocalized('common.invalid_user', lang))], ephemeral: true });

    try {
      if (sub === 'add') {
        await member.roles.add(role.id);
        await interaction.reply({ embeds: [success('Role Added', `${role} → ${member}`)] });
      } else {
        await member.roles.remove(role.id);
        await interaction.reply({ embeds: [success('Role Removed', `${role} ← ${member}`)] });
      }
    } catch {
      await interaction.reply({ embeds: [error('Missing permissions to manage that role')], ephemeral: true });
    }
  },
};
