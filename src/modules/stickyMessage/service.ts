/**
 * modules/stickyMessage/service.ts
 *
 * onChannelMessage(message) is the hook — call it from your messageCreate
 * event, AFTER the `if (message.author.bot) return;` guard (this project's
 * events/messageCreate.ts already has that guard at the very top, so the
 * bot's own sticky repost can never re-trigger itself — no infinite loop
 * risk by construction).
 */

import { EmbedBuilder, Message, TextChannel } from 'discord.js';
import * as Repo from './repository';

// Per-channel lock so a burst of near-simultaneous messages can't cause two
// overlapping delete+repost cycles (which would leave duplicate stickies).
const busyChannels = new Set<string>();

function buildStickyEmbed(content: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor('#ff6b35')
    .setDescription(content)
    .setFooter({ text: '📌 Sticky message' });
}

async function repost(channel: TextChannel, guildId: string, row: Repo.StickyRow): Promise<void> {
  // Delete the previous sticky post, if it's still there.
  if (row.message_id) {
    const old = await channel.messages.fetch(row.message_id).catch(() => null);
    if (old) await old.delete().catch(() => {});
  }

  const sent = await channel.send({ embeds: [buildStickyEmbed(row.content)] }).catch(() => null);
  Repo.updateMessageId(guildId, channel.id, sent?.id ?? null);
}

/**
 * Call this for every human message in a guild text channel. No-op (cheap
 * DB lookup, nothing else) for channels without a sticky message configured.
 */
export async function onChannelMessage(message: Message): Promise<void> {
  if (!message.guild || !message.channel.isTextBased() || message.channel.isThread()) return;

  const guildId = message.guild.id;
  const channelId = message.channelId;

  const row = Repo.getSticky(guildId, channelId);
  if (!row) return;

  if (busyChannels.has(channelId)) return; // a repost for this channel is already in flight
  busyChannels.add(channelId);
  try {
    await repost(message.channel as TextChannel, guildId, row);
  } catch {
    // Never let a sticky-repost failure break normal message handling.
  } finally {
    busyChannels.delete(channelId);
  }
}

/** Sets (or replaces) the sticky message for a channel and posts it immediately. */
export async function setStickyMessage(
  channel: TextChannel, content: string, createdBy: string,
): Promise<void> {
  Repo.setSticky(channel.guild.id, channel.id, content, createdBy);
  const row = Repo.getSticky(channel.guild.id, channel.id)!;
  await repost(channel, channel.guild.id, row);
}

/** Removes the sticky message for a channel and deletes the last posted copy. */
export async function removeStickyMessage(channel: TextChannel): Promise<boolean> {
  const row = Repo.getSticky(channel.guild.id, channel.id);
  if (!row) return false;
  if (row.message_id) {
    const old = await channel.messages.fetch(row.message_id).catch(() => null);
    if (old) await old.delete().catch(() => {});
  }
  Repo.removeSticky(channel.guild.id, channel.id);
  return true;
}
