import { requireModerator } from '../../utils/guards';
import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { getGuild } from '../../database/db';
import { getLocalized, Language } from '../../utils/localization';
import db from '../../database/db';
import { error } from '../../utils/embeds';
import { WarnRow } from '../../utils/types';

export default {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('View warnings for a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!await requireModerator(interaction as any)) return;
    const guild = getGuild(interaction.guildId!);
    const lang = (guild.language || 'en') as Language;
    const target = interaction.options.getUser('user', true);
    const warns = db.prepare('SELECT * FROM warnings WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC')
      .all(interaction.guildId, target.id) as WarnRow[];

    if (!warns.length) return interaction.reply({ embeds: [error('No warnings', `${target} has no warnings`)], ephemeral: true });

    const embed = new EmbedBuilder()
      .setTitle(`Warnings — ${target.tag}`)
      .setColor('#fee75c')
      .setDescription(warns.slice(0, 10).map((w, i) => `**${i+1}.** ${w.reason} — <@${w.moderator_id}> <t:${w.created_at}:R>`).join('\n'))
      .setFooter({ text: `${warns.length} total warning(s)` });

    await interaction.reply({ embeds: [embed] });
  },
};
