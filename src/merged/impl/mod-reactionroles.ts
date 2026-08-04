/**
 * /reactionroles — opens the guided reaction-roles wizard (create/add/
 * remove/delete panels and buttons). See modules/moderation/reactionRolesWizard.ts
 * for the actual screens — same reaction_role_panels/reaction_role_buttons
 * tables and message-refresh logic as before, just click-through now
 * instead of typing panel IDs and role IDs by hand.
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { startReactionRolesWizard } from '../../modules/moderation/reactionRolesWizard';

export default {
  data: new SlashCommandBuilder()
    .setName('reactionroles')
    .setDescription('Manage self-assignable button roles')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setDMPermission(false),

  async execute(ix: ChatInputCommandInteraction) {
    await startReactionRolesWizard(ix);
  },
};
