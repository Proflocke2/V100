/**
 * ACTIVITY CALLOUT — periodically posts "who's been most active" for the
 * period just ended. Pure in-memory counters (guildId → userId → count),
 * reset on every tick — this is a rolling spotlight, not a permanent
 * leaderboard (the `users.messages` column already covers all-time totals
 * via /level's leaderboard).
 *
 * Deliberately silent when nobody said anything in the period — posting
 * "no activity" every hour in a quiet server does the opposite of what
 * this feature is for.
 */

import { Client, EmbedBuilder, TextChannel } from 'discord.js';
import { getGuild } from '../../database/db';

// guildId → userId → message count since last tick
const activityCounts = new Map<string, Map<string, number>>();

/** Call once per non-bot message that has already passed moderation. */
export function recordChatActivity(guildId: string, userId: string): void {
  const guildMap = activityCounts.get(guildId) ?? new Map<string, number>();
  guildMap.set(userId, (guildMap.get(userId) ?? 0) + 1);
  activityCounts.set(guildId, guildMap);
}

const TOP_N = 3;

export async function runActivityCalloutTick(client: Client): Promise<void> {
  for (const [guildId, counts] of activityCounts) {
    activityCounts.delete(guildId); // always reset, even if we end up skipping the post below
    if (counts.size === 0) continue;

    const guildRow = getGuild(guildId);
    if (!guildRow.activity_callout_enabled) continue;

    const channelId = guildRow.activity_callout_channel || guildRow.level_channel;
    if (!channelId) continue;

    const guild = client.guilds.cache.get(guildId);
    const channel = guild?.channels.cache.get(channelId);
    if (!channel || !channel.isTextBased()) continue;

    const top = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_N);

    if (!top.length) continue;

    const medals = ['🥇', '🥈', '🥉'];
    const lines = top.map(([userId, count], i) =>
      `${medals[i] ?? '▪️'} <@${userId}> — **${count}** message${count === 1 ? '' : 's'}`);

    await (channel as TextChannel).send({
      embeds: [new EmbedBuilder()
        .setColor('#ff6b35')
        .setTitle('🔥 Most active this hour')
        .setDescription(lines.join('\n'))
        .setTimestamp()],
    }).catch(() => {});
  }
}
