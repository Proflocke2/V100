/**
 * /economy — merged command.
 *   shop      ← former /shop
 *   admin     ← former /eco-admin
 *   stats     ← former /eco-stats (balance/leaderboard)
 *   gambling  ← former /eco-config gambling  (flattened — eco-config itself
 *   lottery   ← former /eco-config lottery     already used one nesting level,
 *   activity  ← former /eco-config activity    Discord only allows one, so its
 *               three groups are attached directly here instead of double-nested)
 *
 * Standalone economy commands that stay flat (high-frequency, single-verb):
 *   /blackjack, /daily, /pay, /slots, /eco-challenge
 */

import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { copyAsSubcommandGroup } from '../../merged/mergeUtils';
import shopCmd from '../../merged/impl/shop';
import ecoAdminCmd from '../../merged/impl/eco-admin';
import ecoStatsCmd from '../../merged/impl/eco-stats';
import gambleConfigCmd from '../../merged/impl/gamble-config';
import lotteryCmd from '../../merged/impl/lottery';
import activityConfigCmd from '../../merged/impl/activity-config';

const data = new SlashCommandBuilder()
  .setName('economy')
  .setDescription('Server economy — shop, config, admin tools and stats');

copyAsSubcommandGroup(data, 'shop', 'Server item shop — spend your coins on roles and perks', shopCmd as any);
copyAsSubcommandGroup(data, 'admin', 'Economy admin commands [Admin only]', ecoAdminCmd as any);
copyAsSubcommandGroup(data, 'stats', 'Balance and leaderboard', ecoStatsCmd as any);
copyAsSubcommandGroup(data, 'gambling', 'Gambling cooldown and disclaimer settings [Admin only]', gambleConfigCmd as any);
copyAsSubcommandGroup(data, 'lottery', 'Server lottery system [Admin only]', lotteryCmd as any);
copyAsSubcommandGroup(data, 'activity', 'Voice-XP, lucky drops, activity callout [Admin only]', activityConfigCmd as any);

const ROUTES: Record<string, any> = {
  shop: shopCmd, admin: ecoAdminCmd, stats: ecoStatsCmd,
  gambling: gambleConfigCmd, lottery: lotteryCmd, activity: activityConfigCmd,
};

export default {
  data,
  async execute(interaction: ChatInputCommandInteraction, client: any) {
    const group = interaction.options.getSubcommandGroup(false);
    const target = group ? ROUTES[group] : null;
    if (target) return target.execute(interaction, client);
  },
};
