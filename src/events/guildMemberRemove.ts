/**
 * guildMemberRemove event.
 */

import { GuildMember, PartialGuildMember } from 'discord.js';
import { BotClient } from '../utils/types';
import { StatsService } from '../stats/StatsService';
import { onMemberLeave } from '../modules/welcome/service';
import { logMemberLeave } from '../modules/moderation/modLog';

export default {
  async execute(member: GuildMember | PartialGuildMember, _client: BotClient) {
    StatsService.triggerUpdate(member.guild);

    try {
      await logMemberLeave(member);
    } catch (err) {
      console.error('[ModLog] logMemberLeave failed:', err);
    }

    try {
      await onMemberLeave(member);
    } catch (err) {
      console.error('[Welcome] onMemberLeave failed:', err);
    }
  },
};
