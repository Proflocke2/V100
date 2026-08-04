import { requireModerator } from '../../utils/guards';
import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { getGuild } from '../../database/db';
import { getLocalized, Language } from '../../utils/localization';
import db from '../../database/db';
import { success, error } from '../../utils/embeds';

export default {
  data: new SlashCommandBuilder()
    .setName('clearwarnings')
    .setDescription('Clear all warnings for a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!await requireModerator(interaction as any)) return;
    const guild = getGuild(interaction.guildId!);
    const lang = (guild.language || 'en') as Language;
    const target = interaction.options.getUser('user', true);
    const result = db.prepare('DELETE FROM warnings WHERE guild_id = ? AND user_id = ?').run(interaction.guildId, target.id);
    if (result.changes === 0) return interaction.reply({ embeds: [error('No warnings found')], ephemeral: true });
    await interaction.reply({ embeds: [success(getLocalized('mod.warnings_cleared', lang, { user: target.toString() }), `Removed ${result.changes} warning(s) from ${target}`)] });
  },
};
