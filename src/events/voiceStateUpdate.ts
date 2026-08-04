import { VoiceState } from 'discord.js';
import { logVoiceJoin, logVoiceLeave, logVoiceMove } from '../modules/moderation/modLog';
import { recordVoiceJoin, recordVoiceLeave, recordVoiceMove } from '../modules/voiceXp/service';

export default {
  async execute(oldState: VoiceState, newState: VoiceState) {
    const member = newState.member ?? oldState.member;
    if (!member || member.user.bot) return;

    const leftChannel   = oldState.channel;
    const joinedChannel = newState.channel;
    const guildId       = newState.guild.id;
    const afkChannelId  = newState.guild.afkChannelId;

    if (!leftChannel && joinedChannel) {
      await logVoiceJoin(member, joinedChannel).catch(() => {});
      recordVoiceJoin(guildId, joinedChannel.id, member.id, joinedChannel.id === afkChannelId);
    } else if (leftChannel && !joinedChannel) {
      await logVoiceLeave(member, leftChannel).catch(() => {});
      recordVoiceLeave(guildId, member.id);
    } else if (leftChannel && joinedChannel && leftChannel.id !== joinedChannel.id) {
      await logVoiceMove(member, leftChannel, joinedChannel).catch(() => {});
      recordVoiceMove(guildId, joinedChannel.id, member.id, joinedChannel.id === afkChannelId);
    }
    // Same channel (mute/deafen/streaming toggle etc.) — not a join/leave/move, ignored.
  },
};
