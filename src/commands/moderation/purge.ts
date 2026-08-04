import { requireAdmin } from '../../utils/guards';
import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, TextChannel, GuildMember } from 'discord.js';
import { getGuild } from '../../database/db';
import { getLocalized, Language } from '../../utils/localization';
import { success, error } from '../../utils/embeds';

export default {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Delete messages')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o => o.setName('amount').setDescription('1-100').setRequired(true).setMinValue(1).setMaxValue(100))
    .addUserOption(o => o.setName('user').setDescription('Filter by user')),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!await requireAdmin(interaction as any)) return;
    const guild = getGuild(interaction.guildId!);
    const lang = (guild.language || 'en') as Language;
    const amount = interaction.options.getInteger('amount', true);
    const user = interaction.options.getUser('user');
    const ch = interaction.channel as TextChannel;

    await interaction.deferReply({ ephemeral: true });

    let messages = await ch.messages.fetch({ limit: amount });
    if (user) messages = messages.filter(m => m.author.id === user.id);

    const deleted = await ch.bulkDelete(messages, true);
    await interaction.editReply({ embeds: [success('Purged', `Deleted ${deleted.size} messages`)] });
  },
};
