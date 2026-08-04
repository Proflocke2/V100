/**
 * /info — merged command.
 *   server ← former /serverinfo
 *   user   ← former /userinfo
 *   role   ← former /roleinfo
 *   bot    ← former /botinfo
 *   avatar ← former /avatar
 */

import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { wrapAsSubcommand } from '../../merged/mergeUtils';
import serverinfoCmd from '../../merged/impl/util-serverinfo';
import userinfoCmd from '../../merged/impl/util-userinfo';
import roleinfoCmd from '../../merged/impl/util-roleinfo';
import botinfoCmd from '../../merged/impl/util-botinfo';
import avatarCmd from '../../merged/impl/util-avatar';

const data = new SlashCommandBuilder()
  .setName('info')
  .setDescription('Look up info about the server, a user, a role, the bot, or an avatar');

wrapAsSubcommand(data, 'server', 'Show server info', serverinfoCmd as any);
wrapAsSubcommand(data, 'user', 'Show user info', userinfoCmd as any);
wrapAsSubcommand(data, 'role', 'Info about a role', roleinfoCmd as any);
wrapAsSubcommand(data, 'bot', 'Bot stats and info', botinfoCmd as any);
wrapAsSubcommand(data, 'avatar', 'Show avatar of a user', avatarCmd as any);

const ROUTES: Record<string, any> = {
  server: serverinfoCmd, user: userinfoCmd, role: roleinfoCmd, bot: botinfoCmd, avatar: avatarCmd,
};

export default {
  data,
  async execute(interaction: ChatInputCommandInteraction, client: any) {
    const sub = interaction.options.getSubcommand();
    if (ROUTES[sub]) return ROUTES[sub].execute(interaction, client);
  },
};
