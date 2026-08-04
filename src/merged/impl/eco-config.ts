/**
 * /eco-config — merged command.
 *   gambling ← former /gamble-config (subcommand group)
 *   lottery  ← former /lottery       (subcommand group)
 *
 * Neither original command used setDefaultMemberPermissions (both mix
 * public and admin-only subcommands, checking permissions inside execute()
 * to avoid Discord hiding the command client-side) — the parent preserves
 * that and stays visible to everyone too.
 */

import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { copyAsSubcommandGroup } from '../../merged/mergeUtils';
import gambleConfigCmd  from '../../merged/impl/gamble-config';
import lotteryCmd       from '../../merged/impl/lottery';
import activityConfigCmd from '../../merged/impl/activity-config';

const data = new SlashCommandBuilder()
  .setName('eco-config')
  .setDescription('Economy settings: gambling cooldown/disclaimer, lottery, engagement features');

copyAsSubcommandGroup(data, 'gambling', 'Gambling cooldown and disclaimer settings', gambleConfigCmd as any);
copyAsSubcommandGroup(data, 'lottery',  'Server lottery system',                     lotteryCmd as any);
copyAsSubcommandGroup(data, 'activity', 'Voice-XP, lucky drops, activity callout',   activityConfigCmd as any);

export default {
  data,
  async execute(interaction: ChatInputCommandInteraction) {
    switch (interaction.options.getSubcommandGroup(false)) {
      case 'gambling': return (gambleConfigCmd as any).execute(interaction);
      case 'lottery':  return (lotteryCmd as any).execute(interaction);
      case 'activity': return (activityConfigCmd as any).execute(interaction);
    }
  },
};
