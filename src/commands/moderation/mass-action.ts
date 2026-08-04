/**
 * /mass-action — merged command.
 *   ban  ← former /massban  (subcommand group)
 *   role ← former /massrole (subcommand group)
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { copyAsSubcommandGroup } from '../../merged/mergeUtils';
import massbanCmd  from '../../merged/impl/massban';
import massroleCmd from '../../merged/impl/massrole';

const data = new SlashCommandBuilder()
  .setName('mass-action')
  .setDescription('Bulk actions: mass-ban, mass-role (raid control)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

copyAsSubcommandGroup(data, 'ban',  'Ban multiple users at once',                  massbanCmd as any);
copyAsSubcommandGroup(data, 'role', 'Add or remove a role from all server members', massroleCmd as any);

export default {
  data,
  async execute(interaction: ChatInputCommandInteraction) {
    switch (interaction.options.getSubcommandGroup(false)) {
      case 'ban':  return (massbanCmd as any).execute(interaction);
      case 'role': return (massroleCmd as any).execute(interaction);
    }
  },
};
