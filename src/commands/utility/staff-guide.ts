/**
 * /staff-guide — interactive paginated staff guide (standalone top-level command).
 *
 * view   — open to all members, ◀ ▶ arrow-button pagination (unchanged logic)
 * manage — opens a click-through wizard (buttons + modals + select menus) to
 *          add/edit/remove pages and set editor roles, instead of typing
 *          raw subcommand options. Same underlying service.ts CRUD as before.
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags, GuildMember } from 'discord.js';
import { countPages, getPage, buildPagePayload, canEdit, getEditorRoles } from '../../modules/staffGuide/service';
import { buildStaffGuideManageHome } from '../../handlers/staffGuideWizardHandler';
import { info, error } from '../../utils/embeds';

export default {
  data: new SlashCommandBuilder()
    .setName('staff-guide')
    .setDescription('Paginated staff reference guide with arrow-button navigation')

    .addSubcommand(s => s.setName('view').setDescription('Browse the staff guide')
      .addIntegerOption(o => o.setName('page').setDescription('Page number to open (default: 1)').setMinValue(1)))

    .addSubcommand(s => s.setName('manage').setDescription('Add, edit, remove pages and set editor roles [Editor/Admin only]')),

  async execute(ix: ChatInputCommandInteraction) {
    const sub = ix.options.getSubcommand();
    const gid = ix.guildId!;

    if (sub === 'view') {
      const total = countPages(gid);
      if (!total) {
        return ix.reply({ embeds: [info('Staff Guide', 'No pages yet. A member with edit access can add pages with `/staff-guide manage`.')], flags: MessageFlags.Ephemeral });
      }
      const pageNum = Math.min(ix.options.getInteger('page') ?? 1, total);
      const page = getPage(gid, pageNum)!;
      return ix.reply({ ...buildPagePayload(page, total), flags: MessageFlags.Ephemeral });
    }

    if (sub === 'manage') {
      const member = ix.member as GuildMember;
      if (!canEdit(member, gid)) {
        const roles = getEditorRoles(gid);
        const roleText = roles.length ? roles.map(r => `<@&${r}>`).join(', ') : 'none configured';
        return ix.reply({ embeds: [error('No permission', `Editing the staff guide requires ManageGuild or one of the configured editor roles: ${roleText}.`)], flags: MessageFlags.Ephemeral });
      }
      return ix.reply({ ...(await buildStaffGuideManageHome(gid)), flags: MessageFlags.Ephemeral });
    }
  },
};
