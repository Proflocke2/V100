import { NonThreadGuildBasedChannel } from 'discord.js';
import { logChannelCreate } from '../modules/moderation/modLog';

export default {
  async execute(channel: NonThreadGuildBasedChannel) {
    await logChannelCreate(channel).catch(() => {});
  },
};
