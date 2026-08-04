/**
 * Runtime permission guards for slash commands.
 *
 * setDefaultMemberPermissions() is only a Discord UI restriction —
 * it doesn't prevent the API from being called directly.
 * These guards check permissions server-side in the execute() method.
 */

import {
  ChatInputCommandInteraction, PermissionResolvable, GuildMember, MessageFlags,
} from 'discord.js';
import { error } from './embeds';

export async function requirePermission(
  ix: ChatInputCommandInteraction,
  permission: PermissionResolvable,
  message = '❌ You do not have permission to use this command.',
): Promise<boolean> {
  const member = ix.member as GuildMember | null;
  if (!member?.permissions.has(permission)) {
    await ix.reply({
      embeds: [error('No permission', message)],
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});
    return false;
  }
  return true;
}

export async function requireAdmin(ix: ChatInputCommandInteraction): Promise<boolean> {
  return requirePermission(ix, 'ManageGuild', 'This command requires **Manage Server**.');
}

export async function requireModerator(ix: ChatInputCommandInteraction): Promise<boolean> {
  return requirePermission(ix, 'ModerateMembers', 'This command requires **Moderate Members**.');
}
