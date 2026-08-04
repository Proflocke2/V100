/**
 * /timeout — merged command.
 *   set    ← former /timeout
 *   remove ← former /untimeout
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { wrapAsSubcommand } from '../../merged/mergeUtils';
import timeoutCmd   from '../../merged/impl/timeout';
import untimeoutCmd from '../../merged/impl/untimeout';

const data = new SlashCommandBuilder()
  .setName('timeout')
  .setDescription('Timeout a member or remove their timeout')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

wrapAsSubcommand(data, 'set',    'Put a member in timeout',        timeoutCmd as any);
wrapAsSubcommand(data, 'remove', "Remove a member's timeout",      untimeoutCmd as any);

export default {
  data,
  async execute(interaction: ChatInputCommandInteraction) {
    switch (interaction.options.getSubcommand()) {
      case 'set':    return (timeoutCmd as any).execute(interaction);
      case 'remove': return (untimeoutCmd as any).execute(interaction);
    }
  },
};
