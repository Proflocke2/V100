import { requirePermission } from '../../utils/guards';
import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, GuildMember } from 'discord.js';
import { getGuild } from '../../database/db';
import { getLocalized, Language } from '../../utils/localization';
import { success, error } from '../../utils/embeds';

export default {
  data: new SlashCommandBuilder()
    .setName('nick')
    .setDescription('Change a user\'s nickname')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    .addStringOption(o => o.setName('nickname').setDescription('New nickname (leave empty to reset)')),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!await requirePermission(interaction, PermissionFlagsBits.ManageNicknames)) return;
    const guild = getGuild(interaction.guildId!);
    const lang = (guild.language || 'en') as Language;
    const target = interaction.options.getMember('user') as GuildMember;
    const nick = interaction.options.getString('nickname') ?? null;
    if (!target) return interaction.reply({ embeds: [error(getLocalized('common.invalid_user', lang))], ephemeral: true });
    try {
      await target.setNickname(nick);
      await interaction.reply({ embeds: [success('Nickname changed', nick ? `${target} → \`${nick}\`` : `${target}'s nickname was reset`)] });
    } catch {
      await interaction.reply({ embeds: [error('Cannot change that user\'s nickname')], ephemeral: true });
    }
  },
};
