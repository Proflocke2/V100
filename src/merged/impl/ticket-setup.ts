/**
 * /ticket-setup — wizard entry point for the ticket system.
 *
 * Replaces needing to know: /ticket setup, the dozen /ticket subcommands,
 * all the panel/category/form setup flows.
 *
 * Opens a button-driven home screen with sections:
 *   Channels    – log, archive, transcript format
 *   Limits      – max open tickets, cooldown, naming pattern
 *   Autoclose   – enable/disable, hours
 *   Staff Roles – admin role, fallback staff role
 *   Features    – DM on close, survey, support hours
 *   Panels      – quick link to the full ticket wizard for panels
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { requireAdmin } from '../../utils/guards';
import { buildTicketSetupHome } from '../../handlers/ticketSetupWizardHandler';

export default {
  data: new SlashCommandBuilder()
    .setName('ticket-setup')
    .setDescription('🎫 Interactive ticket system setup — channels, limits, auto-close, staff roles and more'),

  async execute(ix: ChatInputCommandInteraction) {
    if (!await requireAdmin(ix)) return;
    const payload = await buildTicketSetupHome(ix.guildId!);
    await ix.reply({ ...payload, flags: MessageFlags.Ephemeral });
  },
};
