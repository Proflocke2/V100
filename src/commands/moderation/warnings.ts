/**
 * /warnings — merged command.
 *   add   ← former /warn
 *   list  ← former /warnings
 *   clear ← former /clearwarnings
 *
 * All original logic is untouched; this only re-exposes it as subcommands.
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { wrapAsSubcommand } from '../../merged/mergeUtils';
import warnCmd      from '../../merged/impl/warn';
import warningsCmd  from '../../merged/impl/warnings';
import clearCmd     from '../../merged/impl/clearwarnings';

const data = new SlashCommandBuilder()
  .setName('warnings')
  .setDescription('Manage member warnings')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

wrapAsSubcommand(data, 'add',   'Warn a member',                 warnCmd as any);
wrapAsSubcommand(data, 'list',  "Show a member's warnings",      warningsCmd as any);
wrapAsSubcommand(data, 'clear', "Clear all of a member's warnings", clearCmd as any);

export default {
  data,
  async execute(interaction: ChatInputCommandInteraction) {
    switch (interaction.options.getSubcommand()) {
      case 'add':   return (warnCmd as any).execute(interaction);
      case 'list':  return (warningsCmd as any).execute(interaction);
      case 'clear': return (clearCmd as any).execute(interaction);
    }
  },
};
