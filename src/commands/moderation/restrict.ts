/**
 * /restrict — merged command.
 *   lockdown   ← former /lockdown   (subcommand group: start / end)
 *   stickymute ← former /stickymute (subcommand group: add / remove)
 *   userslow   ← former /userslow   (subcommand group: set / list)
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { copyAsSubcommandGroup } from '../../merged/mergeUtils';
import lockdownCmd   from '../../merged/impl/lockdown';
import stickymuteCmd from '../../merged/impl/stickymute';
import userslowCmd   from '../../merged/impl/userslow';

const data = new SlashCommandBuilder()
  .setName('restrict')
  .setDescription('Restriction tools: lockdown, sticky mute, per-user slowmode')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

copyAsSubcommandGroup(data, 'lockdown',   'Manual server/channel lockdown',            lockdownCmd as any);
copyAsSubcommandGroup(data, 'stickymute', 'Sticky mute — persists through rejoins',    stickymuteCmd as any);
copyAsSubcommandGroup(data, 'userslow',   'Per-user slowmode in a channel',            userslowCmd as any);

export default {
  data,
  async execute(interaction: ChatInputCommandInteraction) {
    switch (interaction.options.getSubcommandGroup(false)) {
      case 'lockdown':   return (lockdownCmd as any).execute(interaction);
      case 'stickymute': return (stickymuteCmd as any).execute(interaction);
      case 'userslow':   return (userslowCmd as any).execute(interaction);
    }
  },
};
