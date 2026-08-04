/**
 * /security antinuke — now a single subcommand that opens the guided
 * Anti-Nuke wizard (setup, whitelist add/remove, incidents, status all
 * live inside it — see modules/moderation/antiNukeWizard.ts). Replaces the
 * old setup/whitelist/unwhitelist/whitelist-list/incidents/status flat
 * subcommands, which required typing user IDs, action names, and five
 * separate numeric limits by hand.
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { requireAdmin } from '../../utils/guards';
import { startAntiNukeWizard } from '../../modules/moderation/antiNukeWizard';

export default {
  data: new SlashCommandBuilder()
    .setName('antinuke')
    .setDescription('Anti-Nuke protection — guards against compromised staff accounts')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand(s => s.setName('setup').setDescription('Open the Anti-Nuke setup wizard')),

  async execute(ix: ChatInputCommandInteraction) {
    if (!await requireAdmin(ix)) return;
    await startAntiNukeWizard(ix);
  },
};
