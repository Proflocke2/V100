/**
 * /member — merged command.
 *   kick      ← former /kick   (plain subcommand)
 *   nickname  ← former /nick   (plain subcommand)
 *   role      ← former /role   (subcommand group: add / remove)
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { wrapAsSubcommand, copyAsSubcommandGroup } from '../../merged/mergeUtils';
import kickCmd from '../../merged/impl/kick';
import nickCmd from '../../merged/impl/nick';
import roleCmd from '../../merged/impl/role';

const data = new SlashCommandBuilder()
  .setName('member')
  .setDescription('Member actions: kick, nickname, role')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

wrapAsSubcommand(data, 'kick',     'Kick a user',        kickCmd as any);
wrapAsSubcommand(data, 'nickname', "Change a user's nickname", nickCmd as any);
copyAsSubcommandGroup(data, 'role', 'Add or remove a role from a user', roleCmd as any);

export default {
  data,
  async execute(interaction: ChatInputCommandInteraction) {
    if (interaction.options.getSubcommandGroup(false) === 'role') {
      return (roleCmd as any).execute(interaction);
    }
    switch (interaction.options.getSubcommand()) {
      case 'kick':     return (kickCmd as any).execute(interaction);
      case 'nickname': return (nickCmd as any).execute(interaction);
    }
  },
};
