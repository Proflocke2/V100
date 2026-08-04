/**
 * /bot-admin — merged command (formerly /admin).
 * Central admin surface bundling all server-configuration and bot-owner
 * tooling that used to be a dozen separate top-level commands.
 *
 * Own subcommands (unchanged from /admin): dashboard, moderation, tickets
 * Flat subcommands: disable, deploy, webhook, announce, commands, config-audit
 * Groups: custom-commands, customize, team-activity, errorlog, partners,
 *         stats, verification
 *
 * Note: /chat-revival was NOT folded in — it already uses subcommand groups
 * internally and Discord only allows one level of nesting, so it stays a
 * standalone top-level command.
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { wrapAsSubcommand, copyAsSubcommandGroup } from '../../merged/mergeUtils';

import dashboardCmd from '../../merged/impl/util-admin-dashboard';
import cmdAdminCmd from '../../merged/impl/util-cmd-admin';
import botCustomizeCmd from '../../merged/impl/util-bot-customize';
import teamActivityCmd from '../../merged/impl/util-team-activity';
import errorlogCmd from '../../merged/impl/util-errorlog';
import partnersCmd from '../../merged/impl/util-partners';
import statsCmd from '../../merged/impl/util-stats';
import vsetupCmd from '../../merged/impl/util-vsetup';
import disableCmd from '../../merged/impl/util-disable';
import deployCmd from '../../merged/impl/util-deploy';
import webhookCmd from '../../merged/impl/util-webhook';
import announceCmd from '../../merged/impl/util-announce';
import commandsCmd from '../../merged/impl/util-commands';
import configAuditCmd from '../../merged/impl/util-config-audit';

const data = new SlashCommandBuilder()
  .setName('bot-admin')
  .setDescription('🖥️ Admin dashboard — status overview, setup wizards and bot-owner tools')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

  // Original /admin subcommands, unchanged
  .addSubcommand(s => s.setName('dashboard').setDescription('Open the main admin dashboard'))
  .addSubcommand(s => s.setName('moderation').setDescription('Open moderation setup directly'))
  .addSubcommand(s => s.setName('tickets').setDescription('Open ticket setup directly'));

wrapAsSubcommand(data as any, 'disable', 'Deactivate a command for this server', disableCmd as any);
wrapAsSubcommand(data as any, 'deploy', 'Re-register all slash commands [Bot Owner / Admin only]', deployCmd as any);
wrapAsSubcommand(data as any, 'webhook', 'Manage and send webhook messages (Discohook-style wizard)', webhookCmd as any);
wrapAsSubcommand(data as any, 'announce', 'Make an announcement', announceCmd as any);
wrapAsSubcommand(data as any, 'commands', 'Enable or disable specific commands for this server [Admin only]', commandsCmd as any);
wrapAsSubcommand(data as any, 'config-audit', 'Show who changed which security/config setting, and when', configAuditCmd as any);

copyAsSubcommandGroup(data as any, 'custom-commands', 'Manage custom slash commands for this server [Admins only]', cmdAdminCmd as any);
copyAsSubcommandGroup(data as any, 'customize', "Customize the bot's identity on this server: nickname, avatar, banner", botCustomizeCmd as any);
copyAsSubcommandGroup(data as any, 'team-activity', 'Staff activity tracking: sponsors, leaderboard, settings', teamActivityCmd as any);
copyAsSubcommandGroup(data as any, 'errorlog', 'View internal error tracking [Bot Owner / Admin only]', errorlogCmd as any);
copyAsSubcommandGroup(data as any, 'partners', 'Partner-link tracking and weekly activity report', partnersCmd as any);
copyAsSubcommandGroup(data as any, 'stats', 'Configure real-time server statistics as voice channels', statsCmd as any);
copyAsSubcommandGroup(data as any, 'verification', 'Configure the verification system', vsetupCmd as any);

const FLAT_ROUTES: Record<string, any> = {
  disable: disableCmd, deploy: deployCmd, webhook: webhookCmd, announce: announceCmd,
  commands: commandsCmd, 'config-audit': configAuditCmd,
};
const GROUP_ROUTES: Record<string, any> = {
  'custom-commands': cmdAdminCmd, customize: botCustomizeCmd, 'team-activity': teamActivityCmd,
  errorlog: errorlogCmd, partners: partnersCmd, stats: statsCmd, verification: vsetupCmd,
};

export default {
  data,
  async execute(interaction: ChatInputCommandInteraction, client: any) {
    const group = interaction.options.getSubcommandGroup(false);
    if (group && GROUP_ROUTES[group]) return GROUP_ROUTES[group].execute(interaction, client);

    const sub = interaction.options.getSubcommand();
    if (sub === 'dashboard' || sub === 'moderation' || sub === 'tickets') {
      return dashboardCmd.execute(interaction);
    }
    if (FLAT_ROUTES[sub]) return FLAT_ROUTES[sub].execute(interaction, client);
  },
};
