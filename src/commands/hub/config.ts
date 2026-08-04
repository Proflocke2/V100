/**
 * src/commands/hub/config.ts
 *
 * `/config` — the administration hub: every setup wizard, module toggle,
 * backup routine and the permission editor itself.
 */

import {
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { openHub } from '../../ui/router';
import { BotClient, Command } from '../../utils/types';

const command: Command = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Server Config — modules, security, backups, permissions')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),

  async execute(interaction: ChatInputCommandInteraction, client: BotClient) {
    await openHub(interaction, 'config', client);
  },
};

export default command;
