/**
 * gameExecutor.ts
 *
 * Shared execution logic for all gambling games.
 * Called by:
 *  - disclaimerHandler.ts (after Accept button click)
 *  - GamblingGuard.ts     (when disclaimer is disabled → direct start)
 *
 * The `send` / `followUp` callbacks abstract the difference between
 * ButtonInteraction (update + followUp) and ChatInputCommandInteraction
 * (reply + followUp).
 */

import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  BaseMessageOptions,
} from 'discord.js';
import { getLocalized, Language } from '../../utils/localization';
import { GamblingCooldown } from '../cooldown/GamblingCooldown';
import { PendingGame } from './PendingGames';
import {
  reservePoints,
  addPoints,
  recordLoss,
  getEconomyUser,
} from '../db/EconomyDB';
import { EconomyConfig } from '../config/EconomyConfig';
import { SlotsEngine } from '../engine/SlotsEngine';
import { BlackjackEngine } from '../engine/BlackjackEngine';
import { ChallengeEngine } from '../engine/ChallengeEngine';
import { buildBJEmbed, buildBJButtons, registerBJGame } from '../handlers/economyHandler';
import { error } from '../../utils/embeds';

export interface GameSendContext {
  /** Sends the main game result (replaces disclaimer msg or is initial reply). */
  send: (opts: BaseMessageOptions) => Promise<void>;
  /** Sends a subsequent message into the same channel. */
  followUp: (opts: Record<string, unknown>) => Promise<any>;
  channelId: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// SLOTS
// ─────────────────────────────────────────────────────────────────────────────

export async function executeSlots(
  ctx: GameSendContext,
  pending: PendingGame,
  lang: Language,
): Promise<void> {
  const { userId, guildId, bet } = pending;

  const ok = reservePoints(userId, guildId, bet);
  if (!ok) {
    await ctx.send({
      embeds: [error(
        getLocalized('economy.insufficient', lang),
        `Need ${EconomyConfig.fmt(bet)} coins.`,
      )],
    });
    return;
  }

  GamblingCooldown.record(userId, guildId);
  await new Promise(r => setTimeout(r, 800));

  const result = SlotsEngine.spin(bet);

  if (result.totalPayout > 0) {
    addPoints(userId, guildId, bet + result.totalPayout);
  } else {
    recordLoss(userId, guildId, bet);
  }

  const isWin  = result.totalPayout > 0;
  const color  = result.isJackpot ? '#ffd700' : isWin ? '#57f287' : '#ed4245';
  const title  = result.isJackpot
    ? getLocalized('economy.slots.jackpot', lang)
    : isWin
      ? getLocalized('economy.slots.win', lang)
      : getLocalized('economy.slots.no_luck', lang);

  const netText = result.netResult > 0
    ? `✅ +${EconomyConfig.fmt(result.netResult)}`
    : result.netResult === 0
      ? getLocalized('economy.slots.break_even', lang)
      : `❌ -${EconomyConfig.fmt(Math.abs(result.netResult))}`;

  const user  = getEconomyUser(userId, guildId);
  const embed = new EmbedBuilder()
    .setColor(color as any)
    .setTitle(title)
    .addFields(
      { name: getLocalized('economy.slots.grid', lang),      value: `\`\`\`\n${SlotsEngine.renderGrid(result.grid)}\n\`\`\``, inline: false },
      { name: getLocalized('economy.slots.win_lines', lang), value: SlotsEngine.summarizeLines(result.lines), inline: true },
      { name: `💰 ${getLocalized('economy.balance', lang)}`, value: `${netText}\n**${user.points.toLocaleString()}** coins`, inline: true },
    )
    .setFooter({ text: getLocalized('economy.slots.footer', lang, { bet: String(bet), games: String(user.gamesPlayed) }) })
    .setTimestamp();

  await ctx.followUp({ embeds: [embed] });
}

// ─────────────────────────────────────────────────────────────────────────────
// BLACKJACK
// ─────────────────────────────────────────────────────────────────────────────

export async function executeBlackjack(
  ctx: GameSendContext,
  pending: PendingGame,
  lang: Language,
): Promise<void> {
  const { userId, guildId, bet } = pending;

  const ok = reservePoints(userId, guildId, bet);
  if (!ok) {
    await ctx.send({
      embeds: [error(getLocalized('economy.insufficient', lang), `Need ${EconomyConfig.fmt(bet)} coins.`)],
    });
    return;
  }

  GamblingCooldown.record(userId, guildId);

  const game      = BlackjackEngine.createGame(userId, guildId, bet);
  const { state } = game;
  const finished  = state.status !== 'playing';

  if (!finished) {
    registerBJGame(userId, guildId, game);
  } else {
    const payout = BlackjackEngine.calculatePayout(state);
    if (payout > 0)      addPoints(userId, guildId, payout + state.currentBet);
    else if (payout < 0) recordLoss(userId, guildId, state.currentBet);
    else                 addPoints(userId, guildId, state.currentBet);
  }

  const embed      = buildBJEmbed(state, finished, lang);
  const components = finished ? [] : [buildBJButtons(userId, state.canDoubleDown, lang)];

  await ctx.followUp({ embeds: [embed], components });
}

// ─────────────────────────────────────────────────────────────────────────────
// CHALLENGE
// ─────────────────────────────────────────────────────────────────────────────

export async function executeChallenge(
  ctx: GameSendContext,
  pending: PendingGame,
  lang: Language,
): Promise<void> {
  const { userId, guildId, bet, opponentId, challengeGame } = pending;
  if (!opponentId || !challengeGame) return;

  const ok = reservePoints(userId, guildId, bet);
  if (!ok) {
    await ctx.send({ embeds: [error(getLocalized('economy.insufficient', lang))] });
    return;
  }

  GamblingCooldown.record(userId, guildId);

  const titleKey  = challengeGame === 'blackjack'
    ? 'economy.challenge.title_bj'
    : 'economy.challenge.title_coinflip';
  const timeoutSec = EconomyConfig.SETTINGS.challengeTimeout;

  const challengeEmbed = new EmbedBuilder()
    .setColor('#5865f2')
    .setTitle(getLocalized(titleKey, lang))
    .setDescription(
      getLocalized('economy.challenge.desc', lang, {
        challenger: `<@${userId}>`,
        opponent:   `<@${opponentId}>`,
        bet:        EconomyConfig.fmt(bet),
        prize:      EconomyConfig.fmt(bet * 2),
        timeout:    String(timeoutSec),
      })
    )
    .setTimestamp();

  const result = await ctx.followUp({ embeds: [challengeEmbed], fetchReply: true });
  if (!result) return;
  const msg = result as any;

  ChallengeEngine.create(userId, opponentId, guildId, challengeGame, bet, msg.id, ctx.channelId);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`challenge_accept_${msg.id}`)
      .setLabel(getLocalized('economy.challenge.accept', lang))
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`challenge_decline_${msg.id}`)
      .setLabel(getLocalized('economy.challenge.decline', lang))
      .setStyle(ButtonStyle.Danger),
  );

  await msg.edit({ embeds: [challengeEmbed], components: [row] });

  setTimeout(async () => {
    const stillPending = ChallengeEngine.get(msg.id);
    if (stillPending) {
      ChallengeEngine.remove(msg.id);
      addPoints(userId, guildId, bet);
      const expiredEmbed = EmbedBuilder.from(challengeEmbed)
        .setColor('#ed4245')
        .setTitle(getLocalized('economy.challenge.expired', lang));
      await msg.edit({ embeds: [expiredEmbed], components: [] }).catch(() => {});
    }
  }, timeoutSec * 1_000);
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTER
// ─────────────────────────────────────────────────────────────────────────────

export async function executeGame(
  ctx: GameSendContext,
  pending: PendingGame,
  lang: Language,
): Promise<void> {
  switch (pending.type) {
    case 'slots':     return executeSlots(ctx, pending, lang);
    case 'blackjack': return executeBlackjack(ctx, pending, lang);
    case 'challenge': return executeChallenge(ctx, pending, lang);
  }
}
