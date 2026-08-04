/**
 * /welcome — merged command.
 *   setup     ← former /welcome (opens the config wizard)
 *   simulate  ← former /simwelcome (run/here/leave/dm subcommands, nested as a group)
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { wrapAsSubcommand, copyAsSubcommandGroup } from '../../merged/mergeUtils';
import welcomeCmd from '../../merged/impl/welcome-base';
import simwelcomeCmd from '../../merged/impl/simwelcome';

const data = new SlashCommandBuilder()
  .setName('welcome')
  .setDescription('Configure and test the welcome system')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setDMPermission(false);

wrapAsSubcommand(data, 'setup', 'Configure the welcome system', welcomeCmd as any);
copyAsSubcommandGroup(data, 'simulate', 'Simulate welcome/leave messages for testing (admins only)', simwelcomeCmd as any);

export default {
  data,
  async execute(interaction: ChatInputCommandInteraction) {
    const group = interaction.options.getSubcommandGroup(false);
    if (group === 'simulate') return (simwelcomeCmd as any).execute(interaction);
    const sub = interaction.options.getSubcommand();
    if (sub === 'setup') return (welcomeCmd as any).execute(interaction);
  },
};
