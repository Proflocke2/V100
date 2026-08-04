import { requireAdmin } from '../../utils/guards';
import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, GuildMember } from 'discord.js';
import { getGuild, logModAction } from '../../database/db';
import { recordModAction } from '../../modules/staffActivity/service';
import { getLocalized, Language } from '../../utils/localization';
import { success, error } from '../../utils/embeds';
import { parseDuration } from '../../utils/helpers';

export default {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    .addStringOption(o => o.setName('duration').setDescription('Duration e.g. 10m, 1h, 1d').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!await requireAdmin(interaction as any)) return;
    const guild = getGuild(interaction.guildId!);
    const lang = (guild.language || 'en') as Language;
    const target = interaction.options.getMember('user') as GuildMember;
    const dur = interaction.options.getString('duration', true);
    const reason = interaction.options.getString('reason') ?? 'No reason';
    const ms = parseDuration(dur);
    if (!ms) return interaction.reply({ embeds: [error('Invalid duration', 'Use format: 10m, 2h, 1d')], ephemeral: true });
    if (!target) return interaction.reply({ embeds: [error(getLocalized('common.invalid_user', lang))], ephemeral: true });
    try {
      await target.timeout(ms, reason);
      const caseNumber = logModAction(interaction.guildId!, target.id, interaction.user.id, 'timeout', reason, ms);
      recordModAction(interaction.guildId!, interaction.user.id, 'timeout');
      await interaction.reply({ embeds: [success('Timed out', `${target} for **${dur}**\n*Case #${caseNumber}*`)] });
    } catch {
      await interaction.reply({ embeds: [error('Could not timeout that user')], ephemeral: true });
    }
  },
};
