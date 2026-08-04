/**
 * /help — merged command.
 *   menu       ← former /help (browse commands by area)
 *   about      ← former /about
 *   changelog  ← former /changelog (nested group: post/config/list)
 *
 * Note: the old /help guide (website link) was removed — see /guide for the
 * new in-Discord, button-navigable command reference. /staff-guide is its
 * own top-level command again (it has its own wizard now).
 */

import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { wrapAsSubcommand, copyAsSubcommandGroup } from '../../merged/mergeUtils';
import helpCmd from '../../merged/impl/help-base';
import aboutCmd from '../../merged/impl/about';
import changelogCmd from '../../merged/impl/changelog';

const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Browse commands, docs and the changelog');

wrapAsSubcommand(data, 'menu', 'Browse bot commands by area', helpCmd as any);
wrapAsSubcommand(data, 'about', 'About MultiBotV2 — features, stats & invite link', aboutCmd as any);
copyAsSubcommandGroup(data, 'changelog', 'Post and browse bot/server changelog entries', changelogCmd as any);

export default {
  data,
  async execute(interaction: ChatInputCommandInteraction, client: any) {
    const group = interaction.options.getSubcommandGroup(false);
    if (group === 'changelog') return (changelogCmd as any).execute(interaction, client);

    const sub = interaction.options.getSubcommand();
    if (sub === 'menu') return (helpCmd as any).execute(interaction, client);
    if (sub === 'about') return (aboutCmd as any).execute(interaction, client);
  },
};
