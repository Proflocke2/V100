import {
  SlashCommandBuilder, ChatInputCommandInteraction, ChannelType, PermissionFlagsBits,
} from 'discord.js';
import { requireAdmin } from '../../utils/guards';
import { success, error } from '../../utils/embeds';
import { setGuildValue, getGuild } from '../../database/db';
import { addEntry, listEntries, broadcastEntry, buildListEmbed } from '../../modules/changelog/service';

export default {
  data: new SlashCommandBuilder()
    .setName('changelog')
    .setDescription('Post and browse bot/server changelog entries — separate staff and member write-ups')

    .addSubcommand(s => s.setName('post').setDescription('Post a new changelog entry [Admins only]')
      .addStringOption(o => o.setName('version').setDescription('Version/date label, e.g. "v2.1.2" or "Aug 2026"').setRequired(true).setMaxLength(50))
      .addStringOption(o => o.setName('member_notes').setDescription('What changed, in plain language for members').setRequired(true).setMaxLength(1500))
      .addStringOption(o => o.setName('staff_notes').setDescription('Technical/internal version for staff (defaults to member_notes if omitted)').setMaxLength(1500)))

    .addSubcommand(s => s.setName('config').setDescription('Set where each changelog audience gets auto-posted [Admins only]')
      .addChannelOption(o => o.setName('staff_channel').setDescription('Channel for the staff (technical) version').addChannelTypes(ChannelType.GuildText))
      .addChannelOption(o => o.setName('member_channel').setDescription('Channel for the member (public) version').addChannelTypes(ChannelType.GuildText)))

    .addSubcommand(s => s.setName('list').setDescription('Show recent changelog entries')),

  async execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    const gid = interaction.guildId!;

    if (sub === 'post') {
      if (!await requireAdmin(interaction)) return;
      const version = interaction.options.getString('version', true);
      const memberNotes = interaction.options.getString('member_notes', true);
      const staffNotes = interaction.options.getString('staff_notes') ?? memberNotes;

      await interaction.deferReply({ ephemeral: true });
      const entry = addEntry(gid, version, memberNotes, staffNotes, interaction.user.id);
      const { staffPosted, memberPosted } = await broadcastEntry(interaction.guild!, entry);

      const notes: string[] = [];
      const g = getGuild(gid) as { changelog_staff_channel: string | null; changelog_member_channel: string | null };
      if (g.changelog_staff_channel)  notes.push(staffPosted ? `✅ Posted to staff channel` : `⚠️ Could not post to staff channel`);
      if (g.changelog_member_channel) notes.push(memberPosted ? `✅ Posted to member channel` : `⚠️ Could not post to member channel`);
      if (!g.changelog_staff_channel && !g.changelog_member_channel) notes.push('ℹ️ No channels configured — set them with `/changelog config` to auto-post next time.');

      return interaction.editReply({ embeds: [success(`Changelog entry saved — ${version}`, notes.join('\n'))] });
    }

    if (sub === 'config') {
      if (!await requireAdmin(interaction)) return;
      const staffChannel  = interaction.options.getChannel('staff_channel');
      const memberChannel = interaction.options.getChannel('member_channel');
      if (!staffChannel && !memberChannel) {
        return interaction.reply({ embeds: [error('Nothing to set', 'Provide at least one channel.')], ephemeral: true });
      }
      if (staffChannel)  setGuildValue(gid, 'changelog_staff_channel', staffChannel.id);
      if (memberChannel) setGuildValue(gid, 'changelog_member_channel', memberChannel.id);
      const parts: string[] = [];
      if (staffChannel)  parts.push(`Staff → <#${staffChannel.id}>`);
      if (memberChannel) parts.push(`Member → <#${memberChannel.id}>`);
      return interaction.reply({ embeds: [success('Changelog channels updated', parts.join('\n'))], ephemeral: true });
    }

    // list — staff (ModerateMembers+) see the staff write-up, everyone else sees the member one
    const isStaff = !!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers);
    const entries = listEntries(gid);
    return interaction.reply({ embeds: [buildListEmbed(entries, isStaff ? 'staff' : 'member')], ephemeral: true });
  },
};
