/**
 * /report-staff — let members report a staff member privately.
 *
 *   file   → [Everyone] opens a select menu of staff members, then a modal
 *            for the reason. Fully ephemeral until submission.
 *   config → [Admin only] sets which role is "reportable", which channel
 *            reports go to, and which role may view that channel. Also
 *            locks down the channel's permissions to match.
 *
 * The select-menu/modal flow itself lives in modules/reportStaff/handler.ts
 * and is wired into events/interactionCreate.ts.
 */

import {
  SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits,
  ChannelType, TextChannel,
} from 'discord.js';
import { success, error } from '../../utils/embeds';
import { setGuildValue } from '../../database/db';
import * as Repo from '../../modules/reportStaff/repository';
import { buildStaffSelectRow } from '../../modules/reportStaff/handler';

const data = new SlashCommandBuilder()
  .setName('report-staff')
  .setDescription('Privately report a staff member to the High Staff team')

  .addSubcommand(s => s.setName('file').setDescription('Report a staff member'))

  .addSubcommand(s =>
    s.setName('config')
      .setDescription('[Admin] Set up staff reporting: staff role, log channel, viewer role')
      .addRoleOption(o => o.setName('staff_role').setDescription('Role whose members can be reported').setRequired(true))
      .addChannelOption(o => o.setName('log_channel').setDescription('Private channel reports get posted to').setRequired(true)
        .addChannelTypes(ChannelType.GuildText))
      .addRoleOption(o => o.setName('viewer_role').setDescription('"High Staff" role allowed to see the log channel').setRequired(true)),
  )

  // Only the subcommand-level check below actually restricts `config` — the
  // command itself stays visible so anyone can use `file` to report someone.
  .setDefaultMemberPermissions(null);

export default {
  data,
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand();

    if (sub === 'file') {
      if (!interaction.guild) {
        await interaction.reply({ embeds: [error('Server only', 'This command only works inside a server.')], ephemeral: true });
        return;
      }

      const result = await buildStaffSelectRow(interaction.guild, interaction.user.id);
      if ('errorReason' in result) {
        await interaction.reply({ embeds: [error('Can\'t report right now', result.errorReason)], ephemeral: true });
        return;
      }

      await interaction.reply({
        content: 'Who do you want to report? This is completely private — only you can see this message.',
        components: [result.row],
        ephemeral: true,
      });
      return;
    }

    if (sub === 'config') {
      // Admin-gated here (not via setDefaultMemberPermissions) so /report-staff
      // file stays usable by everyone while config stays locked down.
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({
          embeds: [error('Admins only', 'Only server administrators can configure staff reporting.')],
          ephemeral: true,
        });
        return;
      }
      if (!interaction.guild) return;

      const staffRole  = interaction.options.getRole('staff_role', true);
      const logChannel = interaction.options.getChannel('log_channel', true) as TextChannel;
      const viewerRole = interaction.options.getRole('viewer_role', true);

      setGuildValue(interaction.guild.id, 'report_staff_role', staffRole.id);
      setGuildValue(interaction.guild.id, 'report_log_channel', logChannel.id);
      setGuildValue(interaction.guild.id, 'report_viewer_role', viewerRole.id);

      // Lock the log channel down: deny @everyone, allow the viewer role + the bot.
      let permissionsApplied = true;
      try {
        const channel = await interaction.guild.channels.fetch(logChannel.id) as TextChannel | null;
        if (channel) {
          await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: false });
          await channel.permissionOverwrites.edit(viewerRole.id, { ViewChannel: true, ReadMessageHistory: true });
          await channel.permissionOverwrites.edit(interaction.guild.members.me!.id, {
            ViewChannel: true, SendMessages: true, EmbedLinks: true,
          });
        } else {
          permissionsApplied = false;
        }
      } catch {
        permissionsApplied = false;
      }

      const note = permissionsApplied
        ? `\n\n🔒 <#${logChannel.id}> permissions were updated automatically: only <@&${viewerRole.id}> (and the bot) can view it now.`
        : `\n\n⚠️ Couldn't update <#${logChannel.id}> permissions automatically (missing "Manage Roles/Channels"?). Please restrict access to <@&${viewerRole.id}> manually.`;

      await interaction.reply({
        embeds: [success('Staff reporting configured',
          `**Reportable role:** <@&${staffRole.id}>\n**Log channel:** <#${logChannel.id}>\n**Viewer role:** <@&${viewerRole.id}>${note}`)],
        ephemeral: true,
      });
      return;
    }
  },
};
