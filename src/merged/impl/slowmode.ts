import { requirePermission } from '../../utils/guards';
import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, TextChannel } from 'discord.js';
import { getGuild } from '../../database/db';
import { getLocalized, Language } from '../../utils/localization';
import { success } from '../../utils/embeds';

export default {
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Set slowmode in this channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addIntegerOption(o => o.setName('seconds').setDescription('0 to disable').setRequired(true).setMinValue(0).setMaxValue(21600)),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!await requirePermission(interaction, PermissionFlagsBits.ManageChannels)) return;
    const guild = getGuild(interaction.guildId!);
    const lang = (guild.language || 'en') as Language;
    const secs = interaction.options.getInteger('seconds', true);
    await (interaction.channel as TextChannel).setRateLimitPerUser(secs);
    await interaction.reply({ embeds: [success('Slowmode', secs === 0 ? 'Disabled' : `Set to ${secs}s`)] });
  },
};
