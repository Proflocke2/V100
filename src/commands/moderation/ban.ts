/**
 * /ban — merged command.
 *   add    ← former /ban
 *   remove ← former /unban
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { wrapAsSubcommand } from '../../merged/mergeUtils';
import banCmd   from '../../merged/impl/ban';
import unbanCmd from '../../merged/impl/unban';

const data = new SlashCommandBuilder()
  .setName('ban')
  .setDescription('Ban a user or lift an existing ban')
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers);

wrapAsSubcommand(data, 'add',    'Ban a user',            banCmd as any);
wrapAsSubcommand(data, 'remove', 'Unban a user by ID',    unbanCmd as any);

export default {
  data,
  async execute(interaction: ChatInputCommandInteraction) {
    switch (interaction.options.getSubcommand()) {
      case 'add':    return (banCmd as any).execute(interaction);
      case 'remove': return (unbanCmd as any).execute(interaction);
    }
  },
};
