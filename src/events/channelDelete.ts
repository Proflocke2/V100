import { DMChannel, NonThreadGuildBasedChannel } from 'discord.js';
import { logChannelDelete } from '../modules/moderation/modLog';

export default {
  async execute(channel: DMChannel | NonThreadGuildBasedChannel) {
    if (channel.isDMBased()) return; // DMs have no guild / mod-log channel
    await logChannelDelete(channel).catch(() => {});
  },
};
