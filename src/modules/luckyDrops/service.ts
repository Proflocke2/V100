/**
 * LUCKY DROPS — small, random chance per chat message to post a "coin
 * pouch" that the first person to react to wins. Rewards raw chat volume
 * directly (unlike XP, which is cooldown-gated), and creates a short burst
 * of attention/competition in the channel it fires in.
 *
 * Two independent throttles keep this from becoming spammy in
 * high-traffic channels:
 *   - LUCKY_DROP_CHANCE:   per-message probability gate.
 *   - LUCKY_DROP_COOLDOWN: minimum real time between drops in the SAME
 *     channel, tracked in-memory. A busy channel can still only get one
 *     drop per cooldown window no matter how many messages fly through.
 */

import { Message, TextChannel, EmbedBuilder } from 'discord.js';
import { getGuild } from '../../database/db';
import { addPoints } from '../../economy/db/EconomyDB';
import { EconomyConfig } from '../../economy/config/EconomyConfig';

const LUCKY_DROP_CHANCE      = 0.015; // 1.5% per eligible message
const LUCKY_DROP_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes, per channel
const DROP_MIN_AMOUNT        = 50;
const DROP_MAX_AMOUNT        = 150;
const DROP_WINDOW_MS         = 30_000;
const DROP_EMOJI             = '🪙';

const lastDropByChannel = new Map<string, number>();

/**
 * Fire-and-forget: call once per non-bot message that has already passed
 * moderation (so spam/deleted messages never trigger a drop). No-ops
 * quietly on any Discord API failure — a missed drop is never worth
 * surfacing an error for.
 */
export async function maybeTriggerLuckyDrop(message: Message): Promise<void> {
  if (!message.guild || !message.channel.isTextBased()) return;

  const guildRow = getGuild(message.guild.id);
  if (!guildRow.lucky_drops_enabled) return;

  if (Math.random() > LUCKY_DROP_CHANCE) return;

  const channelId = message.channelId;
  const lastDrop  = lastDropByChannel.get(channelId) ?? 0;
  if (Date.now() - lastDrop < LUCKY_DROP_COOLDOWN_MS) return;
  lastDropByChannel.set(channelId, Date.now());

  const amount = DROP_MIN_AMOUNT + Math.floor(Math.random() * (DROP_MAX_AMOUNT - DROP_MIN_AMOUNT + 1));
  const guildId = message.guild.id;

  let dropMsg: Message;
  try {
    dropMsg = await (message.channel as TextChannel).send({
      embeds: [new EmbedBuilder()
        .setColor('#f1c40f')
        .setTitle('💰 A coin pouch dropped!')
        .setDescription(`First to react with ${DROP_EMOJI} grabs **${EconomyConfig.fmt(amount)}**!`)
        .setFooter({ text: 'Grab it within 30 seconds' })],
    });
    await dropMsg.react(DROP_EMOJI);
  } catch {
    return;
  }

  const collector = dropMsg.createReactionCollector({
    filter: (reaction, user) => reaction.emoji.name === DROP_EMOJI && !user.bot,
    max: 1,
    time: DROP_WINDOW_MS,
  });

  collector.on('collect', async (_reaction, user) => {
    addPoints(user.id, guildId, amount);
    await dropMsg.edit({
      embeds: [new EmbedBuilder()
        .setColor('#57f287')
        .setTitle('💰 Coin pouch grabbed!')
        .setDescription(`<@${user.id}> grabbed **${EconomyConfig.fmt(amount)}**!`)],
    }).catch(() => {});
  });

  collector.on('end', (collected) => {
    if (collected.size === 0) {
      dropMsg.edit({
        embeds: [new EmbedBuilder()
          .setColor('#95a5a6')
          .setTitle('💰 Nobody grabbed it in time...')
          .setDescription(`The **${EconomyConfig.fmt(amount)}** pouch disappeared.`)],
      }).catch(() => {});
    }
  });
}
