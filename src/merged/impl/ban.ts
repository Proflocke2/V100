import { requireAdmin } from '../../utils/guards';
import {
  SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits,
  GuildMember, TextChannel, EmbedBuilder,
} from 'discord.js';
import { BotClient } from '../../utils/types';
import db, { getGuild, logModAction } from '../../database/db';
import { recordModAction } from '../../modules/staffActivity/service';
import { getLocalized, Language } from '../../utils/localization';
import { success, error, modEmbed } from '../../utils/embeds';
import { parseDuration, msToTime } from '../../utils/helpers';
import { scheduleTempBan } from '../../modules/moderation/tempBan';

async function sendModLog(interaction: ChatInputCommandInteraction, embed: EmbedBuilder) {
  const g = getGuild(interaction.guildId!);
  if (!g.mod_log_channel) return;
  const ch = interaction.guild?.channels.cache.get(g.mod_log_channel) as TextChannel | undefined;
  await ch?.send({ embeds: [embed] });
}

export default {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason'))
    .addStringOption(o => o.setName('duration').setDescription('Temp-ban duration e.g. 1d, 12h, 30m — omit for a permanent ban'))
    .addIntegerOption(o => o.setName('days').setDescription('Delete message days (0-7)')),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!await requireAdmin(interaction as any)) return;
    const guild = getGuild(interaction.guildId!);
    const lang = (guild.language || 'en') as Language;
    const target = interaction.options.getMember('user') as GuildMember;
    const reason = interaction.options.getString('reason') ?? 'No reason';
    const durationStr = interaction.options.getString('duration');
    const days = interaction.options.getInteger('days') ?? 0;

    if (!target) return interaction.reply({ embeds: [error(getLocalized('common.invalid_user', lang))], ephemeral: true });

    let durationMs: number | null = null;
    if (durationStr) {
      durationMs = parseDuration(durationStr);
      if (!durationMs) return interaction.reply({ embeds: [error('Invalid duration', 'Use format: 30m, 12h, 7d')], ephemeral: true });
    }

    try {
      await interaction.guild?.members.ban(target, { reason, deleteMessageSeconds: days * 86400 });
      const caseNumber = logModAction(interaction.guildId!, target.id, interaction.user.id, 'ban', reason, durationMs ?? undefined);
      recordModAction(interaction.guildId!, interaction.user.id, 'ban');

      let expiresAtSeconds: number | null = null;
      if (durationMs) {
        expiresAtSeconds = Math.floor(Date.now() / 1000) + Math.floor(durationMs / 1000);
        scheduleTempBan(interaction.guildId!, target.id, interaction.user.id, reason, expiresAtSeconds);
      }

      const e = modEmbed('Ban', target.toString(), interaction.user.toString(), reason);
      const durationNote = durationMs ? `\n**Duration:** ${msToTime(durationMs)} (auto-unban)` : '';
      const desc = `${getLocalized('mod.user_banned', lang, { user: target.toString() })}${durationNote}\n*Case #${caseNumber}*`;
      await interaction.reply({ embeds: [success(getLocalized('mod.ban_title', lang), desc)] });
      await sendModLog(interaction, e);
    } catch {
      await interaction.reply({ embeds: [error(getLocalized('common.error', lang))], ephemeral: true });
    }
  },
};
