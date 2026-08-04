/**
 * src/commands/utility/bot-customize.ts
 *
 * Standalone `/bot-customize` — thin wrapper around the existing bot-customize
 * logic (src/merged/impl/util-bot-customize.ts). Registered publicly because
 * its avatar/banner subcommands take a file attachment, which the wizard menu
 * cannot collect through buttons. Logic is unchanged: this only re-exposes it
 * as its own slash command.
 */

import { ChatInputCommandInteraction } from 'discord.js';
import botCustomize from '../../merged/impl/util-bot-customize';
import { BotClient, Command } from '../../utils/types';

const command: Command = {
  data: (botCustomize as { data: Command['data'] }).data,
  async execute(interaction: ChatInputCommandInteraction, client: BotClient) {
    await (botCustomize as unknown as Command).execute(interaction, client);
  },
};

export default command;
