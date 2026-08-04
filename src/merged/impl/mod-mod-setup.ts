/**
 * /automod — single entry point for ALL moderation configuration.
 *
 * Replaces: /automod, /automod2, /automod3, /antiraid, /antinuke,
 *           /warnconfig, /ultra-mode
 *
 * Navigation: Main menu → section → modal/toggle → back.
 * Button routing: customId prefix "amw:" handled in
 *   handlers/automodWizardHandler.ts, registered in interactionCreate.ts.
 *
 * Sections:
 *   home       – overview of all enabled features
 *   filters    – anti-link, anti-spam, anti-caps, anti-invite, bad words
 *   advanced   – AutoMod3: regex, spam threshold, mass-ping, phishing
 *   raid       – Anti-Raid config
 *   nuke       – Anti-Nuke config
 *   warn       – Warn escalation thresholds
 *   ultra      – Ultra-Mode toggle + score threshold
 */

import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { requireAdmin } from '../../utils/guards';
import { buildAutomodHome } from '../../handlers/automodWizardHandler';

export default {
  data: new SlashCommandBuilder()
    .setName('mod-setup')
    .setDescription('🛡️ Complete moderation setup — all filters, security, anti-raid, anti-nuke, warn escalation'),

  async execute(ix: ChatInputCommandInteraction) {
    if (!await requireAdmin(ix)) return;
    const payload = await buildAutomodHome(ix.guildId!);
    await ix.reply({ ...payload, ephemeral: true });
  },
};
