/**
 * /raid-tools — merged command.
 *   raidsim   ← former /raidsim            (subcommand group)
 *   simulate  ← former /simulate           (subcommand group)
 *   rollback  ← former /attacksim-rollback (plain subcommand)
 *   end       ← former /raid-end           (plain subcommand)
 *
 * /attacksim itself already uses subcommand groups internally, so it can't
 * be nested a level deeper (Discord only allows one level of subcommand
 * groups) and stays its own top-level command.
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { wrapAsSubcommand, copyAsSubcommandGroup } from '../../merged/mergeUtils';
import raidsimCmd  from '../../merged/impl/raidsim';
import simulateCmd from '../../merged/impl/simulate';
import rollbackCmd from '../../merged/impl/attacksim-rollback';
import raidEndCmd  from '../../merged/impl/raid-end';

const data = new SlashCommandBuilder()
  .setName('raid-tools')
  .setDescription('Raid/attack simulation tools: raidsim, simulate, rollback, end')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

copyAsSubcommandGroup(data, 'raidsim',  'Simulate join/spam/phishing attacks',        raidsimCmd as any);
copyAsSubcommandGroup(data, 'simulate', 'Simulate raid/spam/phishing to test filters', simulateCmd as any);
wrapAsSubcommand(data, 'rollback', 'Complete rollback of all simulation data', rollbackCmd as any);
wrapAsSubcommand(data, 'end',      'End an active raid: unlock server, reset tracking', raidEndCmd as any);

export default {
  data,
  async execute(interaction: ChatInputCommandInteraction) {
    const group = interaction.options.getSubcommandGroup(false);
    switch (group) {
      case 'raidsim':  return (raidsimCmd as any).execute(interaction);
      case 'simulate': return (simulateCmd as any).execute(interaction);
    }
    switch (interaction.options.getSubcommand()) {
      case 'rollback': return (rollbackCmd as any).execute(interaction);
      case 'end':       return (raidEndCmd as any).execute(interaction);
    }
  },
};
