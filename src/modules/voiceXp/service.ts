/**
 * VOICE-XP — grants XP + coins for time spent together in a voice channel,
 * feeding the same leveling system as chat-XP so voice time counts toward
 * the same level (see modules/leveling/service.ts).
 *
 * IMPORTANT — why this tracks occupancy itself instead of reading
 * discord.js's cache: index.ts's makeCache config deliberately sets
 * `VoiceStateManager: 0` ("voiceStateUpdate reads the event's own
 * old/newState directly, never guild.voiceStates.cache — safe to keep at
 * 0" — see that file's comment). That means `guild.voiceStates.cache` and
 * therefore `VoiceChannel.members` are always effectively empty in this
 * bot. A tick-based reward loop that read `channel.members` would silently
 * never find anyone. Instead, occupancy is rebuilt purely from
 * voiceStateUpdate events via recordVoiceJoin/Move/Leave (called from
 * events/voiceStateUpdate.ts) into a plain in-memory Map here.
 *
 * Reward is granted on a periodic tick (runVoiceXpTick, wired into
 * schedulers.ts) rather than on join/leave, so a bot restart never loses
 * more than one tick's worth of reward for anyone, and the co-presence
 * check (>=2 non-bot members) is re-evaluated fresh every tick rather than
 * only at session start — someone who ends up alone mid-session simply
 * stops earning from that tick onward, no separate leave/rejoin needed.
 *
 * Known gap: members already sitting in voice at bot boot aren't tracked
 * until their next join/leave/move fires an event (no reliable way to
 * backfill "who's already connected" without the voice-state cache this
 * bot intentionally doesn't keep). Acceptable — matches this bot's general
 * best-effort approach to non-critical rewards elsewhere.
 */

import { Client, Guild } from 'discord.js';
import { getGuild } from '../../database/db';
import { addPoints } from '../../economy/db/EconomyDB';
import { grantXp, announceLevelUp } from '../leveling/service';
import { Language } from '../../utils/localization';

const XP_PER_TICK    = 25; // base, plus variance below — roughly one light chat message's worth per tick
const XP_VARIANCE     = 10;
const COINS_PER_TICK = 20;

// channelId → set of non-bot member IDs currently connected (per this bot's own tracking)
const channelOccupants = new Map<string, Set<string>>();
// "guildId:userId" → channelId, so leave/move know which occupant set to clean up
const memberChannel = new Map<string, string>();

function addOccupant(channelId: string, guildId: string, userId: string): void {
  memberChannel.set(`${guildId}:${userId}`, channelId);
  const set = channelOccupants.get(channelId) ?? new Set<string>();
  set.add(userId);
  channelOccupants.set(channelId, set);
}

function removeOccupant(guildId: string, userId: string): void {
  const key       = `${guildId}:${userId}`;
  const channelId = memberChannel.get(key);
  if (!channelId) return;
  memberChannel.delete(key);
  const set = channelOccupants.get(channelId);
  if (!set) return;
  set.delete(userId);
  if (set.size === 0) channelOccupants.delete(channelId);
}

/** Call from voiceStateUpdate.ts when a non-bot member joins a voice channel. */
export function recordVoiceJoin(guildId: string, channelId: string, userId: string, isAfkChannel: boolean): void {
  if (isAfkChannel) return;
  addOccupant(channelId, guildId, userId);
}

/** Call from voiceStateUpdate.ts when a non-bot member disconnects from voice entirely. */
export function recordVoiceLeave(guildId: string, userId: string): void {
  removeOccupant(guildId, userId);
}

/** Call from voiceStateUpdate.ts when a non-bot member moves between voice channels. */
export function recordVoiceMove(guildId: string, newChannelId: string, userId: string, isAfkChannel: boolean): void {
  removeOccupant(guildId, userId);
  if (!isAfkChannel) addOccupant(newChannelId, guildId, userId);
}

/** Guilds that had at least one qualifying (>=2 occupants) voice channel on the last tick — exposed for /botinfo-style diagnostics if ever wanted. */
export function getTrackedChannelCount(): number {
  return channelOccupants.size;
}

export async function runVoiceXpTick(client: Client): Promise<void> {
  for (const [channelId, occupants] of channelOccupants) {
    if (occupants.size < 2) continue; // co-presence required — no solo AFK farming

    const channel = client.channels.cache.get(channelId);
    if (!channel || !('guild' in channel) || !(channel as { guild?: Guild }).guild) continue;
    const guild = (channel as unknown as { guild: Guild }).guild;

    const guildRow = getGuild(guild.id);
    if (!guildRow.level_enabled) continue;   // piggybacks on the main leveling toggle
    if (!guildRow.voice_xp_enabled) continue; // ...but can be turned off independently

    const lang = (guildRow.language || 'en') as Language;

    for (const userId of occupants) {
      const member  = guild.members.cache.get(userId) ?? null;
      const xpGain  = XP_PER_TICK + Math.floor(Math.random() * XP_VARIANCE);
      const result  = grantXp(userId, guild.id, xpGain);
      addPoints(userId, guild.id, COINS_PER_TICK);

      if (result.leveledUp) {
        await announceLevelUp(guild, member, guildRow, lang, result.newLevel, result.newXp).catch(() => {});
      }
    }
  }
}
