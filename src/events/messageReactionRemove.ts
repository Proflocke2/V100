/**
 * events/messageReactionRemove.ts
 * Mirror of messageReactionAdd.ts — see that file for the partial-handling
 * explanation. Discord fires this once per user per removed reaction.
 */

import { MessageReaction, PartialMessageReaction, User, PartialUser } from 'discord.js';
import { logReactionRemove } from '../modules/moderation/modLog';

export default {
  async execute(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) {
    try {
      if (reaction.partial) await reaction.fetch();
      if (reaction.message.partial) await reaction.message.fetch();
      if (user.partial) await user.fetch();
    } catch {
      return; // uncoverable — message/reaction no longer exists
    }

    await logReactionRemove(reaction, user).catch(() => {});
  },
};
