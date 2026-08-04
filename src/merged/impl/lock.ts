import { requirePermission } from '../../utils/guards';
import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, TextChannel } from 'discord.js';
import { getGuild } from '../../database/db';
import { getLocalized, Language } from '../../utils/localization';
import { success } from '../../utils/embeds';

export default {
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Lock this channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!await requirePermission(interaction, PermissionFlagsBits.ManageChannels)) return;
    const guild = getGuild(interaction.guildId!);
    const lang = (guild.language || 'en') as Language;
    const ch = interaction.channel as TextChannel;
    await ch.permissionOverwrites.edit(interaction.guild!.roles.everyone, { SendMessages: false });
    await interaction.reply({ embeds: [success('Channel Locked', '🔒 No one can send messages here now')] });
  },
};
