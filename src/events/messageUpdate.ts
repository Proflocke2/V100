import { Message, PartialMessage } from 'discord.js';
import { logMessageEdit } from '../modules/moderation/modLog';

export default {
  async execute(oldMessage: Message | PartialMessage, newMessage: Message | PartialMessage) {
    await logMessageEdit(oldMessage, newMessage).catch(() => {});
  },
};
