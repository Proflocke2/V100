/**
 * /mod — bundles the moderation commands that can legally be nested.
 *
 * Discord only allows ONE level of nesting: a subcommand group may contain
 * subcommands, but never another group. These stay standalone top-level
 * commands because they already use groups internally:
 *   /member, /restrict, /mass-action, /raid-tools, /records, /security
 *
 * Also standalone on purpose (high-frequency, single-action):
 *   /ban, /timeout, /purge, /warnings
 *
 * Groups here:
 *   channel    ← former /channel (lock, unlock, slowmode)
 *   attacksim  ← former /attacksim (start, status, rollback)
 * Flat subcommands:
 *   history    ← former /history
 *   setup      ← former /mod-setup
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { copyAsSubcommandGroup, wrapAsSubcommand } from '../../merged/mergeUtils';

import channelCmd from '../../merged/impl/mod-channel';
import attacksimCmd from '../../merged/impl/mod-attacksim';
import historyCmd from '../../merged/impl/mod-history';
import modSetupCmd from '../../merged/impl/mod-mod-setup';

const data = new SlashCommandBuilder()
  .setName('mod')
  .setDescription('Moderation tools & configuration')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .setDMPermission(false);

copyAsSubcommandGroup(data, 'channel', 'Channel moderation: lock, unlock, slowmode', channelCmd as any);
copyAsSubcommandGroup(data, 'attacksim', 'Attack simulator wizard — pick a scenario and configure it', attacksimCmd as any);
wrapAsSubcommand(data, 'history', "Show a member's warn / timeout / kick / ban history", historyCmd as any);
wrapAsSubcommand(data, 'setup', 'Complete moderation setup — filters, security, anti-raid, anti-nuke, escalation', modSetupCmd as any);

const GROUP_ROUTES: Record<string, any> = { channel: channelCmd, attacksim: attacksimCmd };
const FLAT_ROUTES: Record<string, any> = { history: historyCmd, setup: modSetupCmd };

export default {
  data,
  async execute(interaction: ChatInputCommandInteraction, client: any) {
    const group = interaction.options.getSubcommandGroup(false);
    if (group && GROUP_ROUTES[group]) return GROUP_ROUTES[group].execute(interaction, client);
    const sub = interaction.options.getSubcommand();
    if (FLAT_ROUTES[sub]) return FLAT_ROUTES[sub].execute(interaction, client);
  },
};
