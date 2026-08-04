/**
 * /channel — merged command.
 *   lock     ← former /lock
 *   unlock   ← former /unlock
 *   slowmode ← former /slowmode
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { wrapAsSubcommand } from '../../merged/mergeUtils';
import lockCmd     from '../../merged/impl/lock';
import unlockCmd   from '../../merged/impl/unlock';
import slowmodeCmd from '../../merged/impl/slowmode';

const data = new SlashCommandBuilder()
  .setName('channel')
  .setDescription('Channel moderation: lock, unlock, slowmode')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

wrapAsSubcommand(data, 'lock',     'Lock this channel',           lockCmd as any);
wrapAsSubcommand(data, 'unlock',   'Unlock this channel',         unlockCmd as any);
wrapAsSubcommand(data, 'slowmode', 'Set slowmode in this channel', slowmodeCmd as any);

export default {
  data,
  async execute(interaction: ChatInputCommandInteraction) {
    switch (interaction.options.getSubcommand()) {
      case 'lock':     return (lockCmd as any).execute(interaction);
      case 'unlock':   return (unlockCmd as any).execute(interaction);
      case 'slowmode': return (slowmodeCmd as any).execute(interaction);
    }
  },
};
