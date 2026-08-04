import { Message, PartialMessage } from 'discord.js';
import { logMessageDelete } from '../modules/moderation/modLog';

export default {
  async execute(message: Message | PartialMessage) {
    await logMessageDelete(message).catch(() => {});
  },
};
