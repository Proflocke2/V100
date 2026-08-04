import { requireAdmin } from '../../utils/guards';
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  GuildMember,
  TextChannel,
} from 'discord.js';
import { getGuild, logModAction } from '../../database/db';
import { recordModAction } from '../../modules/staffActivity/service';
import { getLocalized, Language } from '../../utils/localization';
import { success, error, modEmbed } from '../../utils/embeds';

export default {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
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
      await target.kick(reason);
      const caseNumber = logModAction(interaction.guildId!, target.id, interaction.user.id, 'kick', reason);
      recordModAction(interaction.guildId!, interaction.user.id, 'kick');
      const title = getLocalized('mod.kick_title', lang);
      const desc  = `${getLocalized('mod.user_kicked', lang, { user: target.toString() })}\n*Case #${caseNumber}*`;
      await interaction.reply({ embeds: [success(title, desc)] });

      if (guild.mod_log_channel) {
        const ch = interaction.guild?.channels.cache.get(guild.mod_log_channel) as TextChannel | undefined;
        await ch?.send({ embeds: [modEmbed('Kick', target.toString(), interaction.user.toString(), reason)] });
      }
    } catch {
      await interaction.reply({ embeds: [error(getLocalized('common.error', lang))], ephemeral: true });
    }
  },
};
