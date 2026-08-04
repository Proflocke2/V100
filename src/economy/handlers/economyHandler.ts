/**
 * ECONOMY INTERACTION HANDLER
 * Button routing for all economy/casino interactions.
 */

import {
  ButtonInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { BlackjackEngine, BJState, Card } from '../engine/BlackjackEngine';
import { ChallengeEngine } from '../engine/ChallengeEngine';
import { addPoints, getEconomyUser, reservePoints, recordLoss } from '../db/EconomyDB';
import { getGuild } from '../../database/db';
import { getLocalized, Language } from '../../utils/localization';
import { EconomyConfig } from '../config/EconomyConfig';
import { error } from '../../utils/embeds';

// ============================================================================
// AKTIVE SPIELE
// ============================================================================

interface ActiveBJGame { state: BJState; deck: Card[] }
const activeBJGames = new Map<string, ActiveBJGame>();

// ============================================================================
// ROUTING
// ============================================================================

export function isEconomyButton(customId: string): boolean {
  return (
    customId.startsWith('bj_') ||
    customId.startsWith('challenge_accept_') ||
    customId.startsWith('challenge_decline_')
  );
}

export async function handleEconomyButton(btn: ButtonInteraction): Promise<any> {
  const id = btn.customId;
  if (id.startsWith('bj_'))                return handleBJButton(btn);
  if (id.startsWith('challenge_accept_'))  return handleChallengeAccept(btn);
  if (id.startsWith('challenge_decline_')) return handleChallengeDecline(btn);
}

// ============================================================================
// BLACKJACK – GAME REGISTRATION
// ============================================================================

export function registerBJGame(playerId: string, guildId: string, game: ActiveBJGame): void {
  activeBJGames.set(`${playerId}_${guildId}`, game);
  setTimeout(() => {
    const key = `${playerId}_${guildId}`;
    const g = activeBJGames.get(key);
    if (g) {
      // FIX: Do NOT call addPoints here. The bet was already deducted by reservePoints()
      // at game start. Calling addPoints(-bet) again would double-charge the player.
      // Forfeited bet stays deducted — just clean up the in-memory game entry.
      recordLoss(playerId, guildId, g.state.currentBet);
      activeBJGames.delete(key);
    }
  }, EconomyConfig.SETTINGS.blackjackTimeout * 1_000);
}

// ============================================================================
// BLACKJACK – BUTTON HANDLER
// ============================================================================

async function handleBJButton(btn: ButtonInteraction): Promise<any> {
  const parts    = btn.customId.split('_');
  const action   = parts[1];
  const playerId = parts[2];
  const guildId  = btn.guildId!;
  const guild    = getGuild(guildId);
  const lang     = (guild.language || 'en') as Language;

  if (btn.user.id !== playerId) {
    return btn.reply({ embeds: [error(getLocalized('common.no_permission', lang))], ephemeral: true });
  }

  const key  = `${playerId}_${guildId}`;
  const game = activeBJGames.get(key);

  if (!game) {
    return btn.reply({ embeds: [error(getLocalized('economy.challenge.no_game', lang))], ephemeral: true });
  }
  if (game.state.status !== 'playing') {
    return btn.reply({ embeds: [error(getLocalized('economy.challenge.game_over', lang))], ephemeral: true });
  }

  await btn.deferUpdate();

  let { state, deck } = game;

  if (action === 'hit') {
    state = BlackjackEngine.hit(state, deck);
  } else if (action === 'stand') {
    state = BlackjackEngine.stand(state, deck);
  } else if (action === 'double') {
    const user = getEconomyUser(playerId, guildId);
    if (!user || user.points < state.bet) {
      state = BlackjackEngine.hit(state, deck);
    } else {
      reservePoints(playerId, guildId, state.bet);
      state = BlackjackEngine.doubleDown(state, deck);
    }
  }

  game.state = state;
  activeBJGames.set(key, game);

  const finished = state.status !== 'playing';
  if (finished) {
    const payout = BlackjackEngine.calculatePayout(state);
    if (payout > 0)       addPoints(playerId, guildId, payout + state.currentBet);
    else if (payout < 0)  { recordLoss(playerId, guildId, state.currentBet); }
    else                  addPoints(playerId, guildId, state.currentBet);
    activeBJGames.delete(key);
  }

  const embed      = buildBJEmbed(state, finished, lang);
  const components = finished ? [] : [buildBJButtons(playerId, state.canDoubleDown, lang)];
  await btn.editReply({ embeds: [embed], components });
}

// ============================================================================
// CHALLENGE – ACCEPT
// ============================================================================

async function handleChallengeAccept(btn: ButtonInteraction): Promise<any> {
  const messageId = btn.customId.replace('challenge_accept_', '');
  const ch        = ChallengeEngine.get(messageId);
  const guild     = getGuild(btn.guildId!);
  const lang      = (guild.language || 'en') as Language;

  if (!ch) {
    return btn.reply({ embeds: [error(getLocalized('economy.challenge.expired', lang))], ephemeral: true });
  }
  if (btn.user.id !== ch.challengedId) {
    return btn.reply({ embeds: [error(getLocalized('economy.challenge.not_challenger', lang))], ephemeral: true });
  }

  await btn.deferUpdate();
  ChallengeEngine.remove(messageId);

  const { challengerId, challengedId, guildId, game, bet } = ch;

  const ok = reservePoints(challengedId, guildId, bet);
  if (!ok) {
    addPoints(challengerId, guildId, bet);
    return btn.editReply({
      embeds: [error(
        getLocalized('economy.insufficient', lang),
        getLocalized('economy.challenge.no_funds', lang, { user: `<@${challengedId}>` }),
      )],
      components: [],
    });
  }

  if (game === 'coinflip') {
    await resolveCoinFlip(btn, challengerId, challengedId, guildId, bet, lang);
  } else if (game === 'blackjack') {
    await resolvePvPBlackjack(btn, challengerId, challengedId, guildId, bet, lang);
  }
}

// ============================================================================
// CHALLENGE – DECLINE
// ============================================================================

async function handleChallengeDecline(btn: ButtonInteraction): Promise<any> {
  const messageId = btn.customId.replace('challenge_decline_', '');
  const ch        = ChallengeEngine.get(messageId);
  const guild     = getGuild(btn.guildId!);
  const lang      = (guild.language || 'en') as Language;

  if (!ch) {
    return btn.reply({ embeds: [error(getLocalized('economy.challenge.expired', lang))], ephemeral: true });
  }
  if (btn.user.id !== ch.challengedId) {
    return btn.reply({ embeds: [error(getLocalized('economy.challenge.not_challenged', lang))], ephemeral: true });
  }

  await btn.deferUpdate();
  ChallengeEngine.remove(messageId);
  addPoints(ch.challengerId, ch.guildId, ch.bet);

  const embed = new EmbedBuilder()
    .setColor('#ed4245')
    .setTitle(getLocalized('economy.challenge.declined_title', lang))
    .setDescription(
      getLocalized('economy.challenge.declined_desc', lang, {
        user: `<@${btn.user.id}>`,
        bet:  EconomyConfig.fmt(ch.bet),
      })
    )
    .setTimestamp();

  await btn.editReply({ embeds: [embed], components: [] });
}

// ============================================================================
// COIN FLIP (PvP)
// ============================================================================

async function resolveCoinFlip(
  btn: ButtonInteraction,
  challengerId: string,
  challengedId: string,
  guildId: string,
  bet: number,
  lang: Language,
): Promise<any> {
  const result   = ChallengeEngine.coinFlip();
  const winnerId = result.winner === 'challenger' ? challengerId : challengedId;

  addPoints(winnerId, guildId, bet * 2);

  const sideKey   = result.side === 'heads' ? 'economy.coinflip.heads' : 'economy.coinflip.tails';
  const sideStr   = getLocalized(sideKey, lang);
  const sideEmoji = result.side === 'heads' ? '🌕' : '🌑';

  const embed = new EmbedBuilder()
    .setColor('#faa61a')
    .setTitle(getLocalized('economy.coinflip.result_title', lang, { emoji: sideEmoji }))
    .setDescription(
      getLocalized('economy.coinflip.winner', lang, {
        side:   sideStr,
        winner: `<@${winnerId}>`,
        amount: EconomyConfig.fmt(bet),
      })
    )
    .addFields(
      { name: getLocalized('economy.coinflip.challenger_label', lang), value: `<@${challengerId}>`, inline: true },
      { name: getLocalized('economy.coinflip.challenged_label', lang), value: `<@${challengedId}>`, inline: true },
    )
    .setTimestamp();

  await btn.editReply({ embeds: [embed], components: [] });
}

// ============================================================================
// PVP BLACKJACK
// ============================================================================

async function resolvePvPBlackjack(
  btn: ButtonInteraction,
  challengerId: string,
  challengedId: string,
  guildId: string,
  bet: number,
  lang: Language,
): Promise<any> {
  const { state: s1, deck: d1 } = BlackjackEngine.createGame(challengerId, guildId, bet);
  const { state: s2, deck: d2 } = BlackjackEngine.createGame(challengedId, guildId, bet);

  const r1 = BlackjackEngine.stand(s1, d1);
  const r2 = BlackjackEngine.stand(s2, d2);

  const p1 = r1.playerTotal <= 21 ? r1.playerTotal : 0;
  const p2 = r2.playerTotal <= 21 ? r2.playerTotal : 0;

  let desc: string;
  let color = '#5865f2';

  if (p1 > p2) {
    addPoints(challengerId, guildId, bet * 2);
    desc  = getLocalized('economy.bj.pvp_winner', lang, { winner: `<@${challengerId}>`, w: String(p1), l: String(p2) });
    color = '#57f287';
  } else if (p2 > p1) {
    addPoints(challengedId, guildId, bet * 2);
    desc  = getLocalized('economy.bj.pvp_winner', lang, { winner: `<@${challengedId}>`, w: String(p2), l: String(p1) });
    color = '#57f287';
  } else {
    addPoints(challengerId, guildId, bet);
    addPoints(challengedId, guildId, bet);
    desc  = getLocalized('economy.bj.pvp_draw', lang, { a: String(p1), b: String(p2) });
    color = '#faa61a';
  }

  const embed = new EmbedBuilder()
    .setColor(color as any)
    .setTitle(getLocalized('economy.bj.pvp_title', lang))
    .setDescription(desc)
    .addFields(
      {
        name:  `<@${challengerId}>`,
        value: `${BlackjackEngine.renderHand(r1.playerHand)}\n${getLocalized('economy.bj.value', lang, { total: String(p1) })}`,
        inline: true,
      },
      {
        name:  `<@${challengedId}>`,
        value: `${BlackjackEngine.renderHand(r2.playerHand)}\n${getLocalized('economy.bj.value', lang, { total: String(p2) })}`,
        inline: true,
      },
    )
    .setTimestamp();

  await btn.editReply({ embeds: [embed], components: [] });
}

// ============================================================================
// EMBED & BUTTON BUILDER
// ============================================================================

export function buildBJEmbed(state: BJState, finished: boolean, lang: Language = 'en'): EmbedBuilder {
  const isPlaying = state.status === 'playing';
  const payout    = finished ? BlackjackEngine.calculatePayout(state) : null;

  const color = !finished ? '#5865f2'
    : payout !== null && payout > 0 ? '#57f287'
    : payout === 0 ? '#faa61a'
    : '#ed4245';

  const statusKey = `economy.bj.status.${state.status}`;
  const statusLabel = getLocalized(statusKey, lang);

  const embed = new EmbedBuilder()
    .setColor(color as any)
    .setTitle(`🃏 ${statusLabel}`)
    .addFields(
      {
        name: getLocalized('economy.bj.your_hand', lang),
        value: `${BlackjackEngine.renderHand(state.playerHand)}\n${getLocalized('economy.bj.value', lang, { total: String(state.playerTotal) })}`,
        inline: true,
      },
      {
        name: getLocalized('economy.bj.dealer', lang),
        value: isPlaying
          ? `${BlackjackEngine.renderDealerHidden(state.dealerHand)}\n${getLocalized('economy.bj.visible', lang, { total: String(state.dealerVisibleTotal) })}`
          : `${BlackjackEngine.renderHand(state.dealerHand)}\n${getLocalized('economy.bj.value', lang, { total: String(state.dealerTotal) })}`,
        inline: true,
      },
      {
        name:  getLocalized('economy.bj.stake', lang),
        value: EconomyConfig.fmt(state.currentBet),
        inline: false,
      },
    )
    .setTimestamp();

  if (finished && payout !== null) {
    const text = payout > 0
      ? `✅ +${EconomyConfig.fmt(payout)}`
      : payout === 0
        ? getLocalized('economy.bj.push_result', lang)
        : `❌ -${EconomyConfig.fmt(Math.abs(payout))}`;
    embed.addFields({ name: getLocalized('economy.bj.result', lang), value: text });
  }

  return embed;
}

export function buildBJButtons(playerId: string, canDouble: boolean, lang: Language = 'en'): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`bj_hit_${playerId}`)
      .setLabel('Hit 🃏')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`bj_stand_${playerId}`)
      .setLabel('Stand ✋')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`bj_double_${playerId}`)
      .setLabel('Double Down 💰')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!canDouble),
  );
}
