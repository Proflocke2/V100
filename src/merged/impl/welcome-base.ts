/**
 * /welcome — configure the welcome system. Opens a guided wizard covering
 * everything the old flat subcommands did (setup, disable, dm, leave,
 * autorole, alt, background, cardimage, avatarbg, preview) — see
 * modules/welcome/wizard.ts for the actual screens. Same underlying
 * Repo.updateSettings() calls throughout, just click-through now.
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { startWelcomeWizard } from '../../modules/welcome/wizard';

export default {
  data: new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('Configure the welcome system')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),

  async execute(ix: ChatInputCommandInteraction) {
    await startWelcomeWizard(ix);
  },
};
