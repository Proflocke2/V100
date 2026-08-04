import { requireAdmin } from '../../utils/guards';
import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, GuildMember } from 'discord.js';
import { getGuild } from '../../database/db';
import { getLocalized, Language } from '../../utils/localization';
import { success, error } from '../../utils/embeds';

export default {
  data: new SlashCommandBuilder()
    .setName('untimeout')
    .setDescription('Remove timeout from a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!await requireAdmin(interaction as any)) return;
    const guild = getGuild(interaction.guildId!);
    const lang = (guild.language || 'en') as Language;
    const target = interaction.options.getMember('user') as GuildMember;
    const reason = interaction.options.getString('reason') ?? 'No reason';
    if (!target) return interaction.reply({ embeds: [error(getLocalized('common.invalid_user', lang))], ephemeral: true });
    try {
      await target.timeout(null, reason);
      await interaction.reply({ embeds: [success('Timeout removed', `${target} can speak again`)] });
    } catch {
      await interaction.reply({ embeds: [error('Could not remove timeout')], ephemeral: true });
    }
  },
};
