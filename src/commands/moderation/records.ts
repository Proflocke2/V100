/**
 * /records — merged command.
 *   infractions ← former /infractions (plain subcommand)
 *   notes       ← former /notes       (subcommand group: add / list / ...)
 *   warnconfig  ← former /warnconfig  (subcommand group: view / set)
 *   case        ← former /modcase     (subcommand group: view / user / list / note / delete)
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { wrapAsSubcommand, copyAsSubcommandGroup } from '../../merged/mergeUtils';
import infractionsCmd from '../../merged/impl/infractions';
import notesCmd       from '../../merged/impl/notes';
import warnconfigCmd  from '../../merged/impl/warnconfig';
import modcaseCmd     from '../../merged/impl/modcase';

const data = new SlashCommandBuilder()
  .setName('records')
  .setDescription('Member records: infraction history, mod notes, warn escalation config, case log')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

wrapAsSubcommand(data, 'infractions', 'Show full infraction history of a member', infractionsCmd as any);
copyAsSubcommandGroup(data, 'notes',      'Internal moderator notes on members',      notesCmd as any);
copyAsSubcommandGroup(data, 'warnconfig', 'Configure warn escalation thresholds',     warnconfigCmd as any);
copyAsSubcommandGroup(data, 'case',       'Searchable moderation case log — kicks, bans, timeouts, warns, unbans', modcaseCmd as any);

export default {
  data,
  async execute(interaction: ChatInputCommandInteraction) {
    switch (interaction.options.getSubcommandGroup(false)) {
      case 'notes':      return (notesCmd as any).execute(interaction);
      case 'warnconfig': return (warnconfigCmd as any).execute(interaction);
      case 'case':       return (modcaseCmd as any).execute(interaction);
    }
    if (interaction.options.getSubcommand() === 'infractions') {
      return (infractionsCmd as any).execute(interaction);
    }
  },
};
