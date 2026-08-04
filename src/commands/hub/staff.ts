/**
 * src/commands/hub/staff.ts
 *
 * `/staff` — the team hub. Moderation, member management, records and raid
 * tooling.
 *
 * setDefaultMemberPermissions only hides the command in the Discord client;
 * the authoritative check runs server-side in openHub() against the guild's
 * configured staff roles and node overrides.
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
    .setName('staff')
    .setDescription('Staff Hub — moderation, members, records, raid tools')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),

  async execute(interaction: ChatInputCommandInteraction, client: BotClient) {
    await openHub(interaction, 'staff', client);
  },
};

export default command;
