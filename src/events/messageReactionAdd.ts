/**
 * events/messageReactionAdd.ts
 *
 * Reactions on old/uncached messages arrive as PARTIAL MessageReaction (and
 * sometimes a partial User too) — Discord only sends the emoji + message/
 * channel/user IDs in that case, not the full objects. We fetch() them
 * before logging so the embed always has real data instead of "undefined".
 *
 * If a fetch fails (message was deleted in the meantime, DM channel we lack
 * access to, etc.) we just skip logging that one reaction rather than throw.
 */

import { MessageReaction, PartialMessageReaction, User, PartialUser } from 'discord.js';
import { logReactionAdd } from '../modules/moderation/modLog';

export default {
  async execute(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser) {
    try {
      if (reaction.partial) await reaction.fetch();
      if (reaction.message.partial) await reaction.message.fetch();
      if (user.partial) await user.fetch();
    } catch {
      return; // uncoverable — message/reaction no longer exists
    }

    await logReactionAdd(reaction, user).catch(() => {});
  },
};
