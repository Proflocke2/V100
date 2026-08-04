/**
 * pvpChallenge — Shared challenge/lobby system for all PvP games.
 *
 * Flow:
 *   1. Challenger runs /game pvp @opponent bet:500
 *   2. This module sends a challenge embed to the channel
 *   3. Opponent sees:
 *      - What game, who challenged them
 *      - Challenger's proposed bet
 *      - Buttons: Accept (match bet) | Counter-offer | Decline
 *   4. If counter-offer: opponent picks their own amount via select menu
 *   5. Both amounts confirmed → lower amount taken as final pot each side
 *      (e.g. challenger bets 500, opponent bets 300 → each puts in 300, winner gets 600)
 *   6. onAccepted(finalBet) called → game starts
 *
 * Returns: ChallengeResult
 */

import {
  ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder, ComponentType, ButtonInteraction,
  User, Message, MessageFlags,
} from 'discord.js';
import { getLocalized, Language } from './localization';
import { getGuild } from '../database/db';
import { reservePoints, addPoints, getEconomyUser, getGuildMaxBet } from '../economy/db/EconomyDB';

export interface ChallengeResult {
  accepted: boolean;
  finalBet: number;         // the agreed-upon bet per player
  challengerBet: number;    // what challenger reserved
  opponentBet: number;      // what opponent reserved
}

export interface ChallengeOptions {
  ix: ChatInputCommandInteraction;
  opponent: User;
  gameName: string;         // e.g. "Battleship 🎯"
  gameEmoji: string;
  proposedBet: number;      // challenger's bet (0 = free)
  lang: Language;
  onAccepted: (finalBet: number) => Promise<void>;
  onDeclined?: () => void;
}

// ── Counter-offer amounts ─────────────────────────────────────────────────────

function buildCounterOptions(proposedBet: number, opponentBalance: number, maxBet: number, lang: Language): StringSelectMenuOptionBuilder[] {
  const t = (k: string, v?: Record<string, string>) => getLocalized(k, lang, v);
  const cap = maxBet > 0 ? Math.min(opponentBalance, maxBet) : opponentBalance;
  const amounts = new Set<number>();

  // Preset percentages of proposed bet
  for (const pct of [0.25, 0.5, 0.75, 1.0, 1.5, 2.0]) {
    const v = Math.round(proposedBet * pct);
    if (v > 0 && v <= cap) amounts.add(v);
  }
  // Fixed common amounts
  for (const v of [50, 100, 250, 500, 1000, 2500, 5000, 10000]) {
    if (v > 0 && v <= cap) amounts.add(v);
  }
  // Always offer 0 (free game)
  amounts.add(0);

  return [...amounts]
    .sort((a, b) => a - b)
    .slice(0, 25)
    .map(v => new StringSelectMenuOptionBuilder()
      .setLabel(v === 0 ? t('challenge.nobet') : `🪙 ${v.toLocaleString()} coins`)
      .setValue(String(v))
      .setDefault(v === proposedBet),
    );
}

// ── Main challenge flow ───────────────────────────────────────────────────────

export async function sendChallenge(opts: ChallengeOptions): Promise<void> {
  const { ix, opponent, gameName, gameEmoji, proposedBet, lang, onAccepted, onDeclined } = opts;
  const t = (k: string, v?: Record<string, string>) => getLocalized(k, lang, v);
  const guildId = ix.guildId!;
  const maxBet = getGuildMaxBet(guildId);

  // Clamp challenger's bet to max
  const effectivePropBet = maxBet > 0 ? Math.min(proposedBet, maxBet) : proposedBet;

  // Reserve challenger's bet
  if (effectivePropBet > 0 && !reservePoints(ix.user.id, guildId, effectivePropBet)) {
    await ix.reply({
      embeds: [new EmbedBuilder().setColor('#ed4245').setDescription(t('game.noCoins'))],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const challengeId = `chal_${ix.user.id}_${Date.now()}`;

  const challengeEmbed = () => new EmbedBuilder()
    .setTitle(t('challenge.title', {game:`${gameEmoji} ${gameName}`}))
    .setColor('#e67e22')
    .setDescription(
      `<@${ix.user.id}> challenges <@${opponent.id}>!\n\n` +
      (effectivePropBet > 0
        ? t('challenge.proposed', {bet: effectivePropBet.toLocaleString()}) + '\n' +
          t('challenge.prizePool', {pot: (effectivePropBet*2).toLocaleString()}) + '\n\n' +
          t('challenge.counterDesc')
        : t('challenge.nobet')) +
      `\n\n⏳ 60s`,
    )
    .setFooter({ text: t('challenge.footerHint') });

  const acceptBtn  = new ButtonBuilder().setCustomId(`${challengeId}_accept`).setLabel(t('game.accept')).setStyle(ButtonStyle.Success);
  const counterBtn = new ButtonBuilder().setCustomId(`${challengeId}_counter`).setLabel(t('challenge.counterBtn')).setStyle(ButtonStyle.Primary)
    .setDisabled(effectivePropBet === 0);
  const declineBtn = new ButtonBuilder().setCustomId(`${challengeId}_decline`).setLabel(t('game.decline')).setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(acceptBtn, counterBtn, declineBtn);

  const msg = await ix.reply({
    content: `<@${opponent.id}>`,
    embeds: [challengeEmbed()],
    components: [row],
    fetchReply: true,
  }) as Message;

  const col = msg.createMessageComponentCollector({
    filter: b => b.user.id === opponent.id && b.customId.startsWith(challengeId),
    time: 60_000,
  });

  let resolved = false;

  col.on('collect', async (btn: ButtonInteraction) => {
    if (resolved) return btn.deferUpdate();

    // ── Decline ──────────────────────────────────────────────────────────────
    if (btn.customId === `${challengeId}_decline`) {
      resolved = true; col.stop();
      if (effectivePropBet > 0) addPoints(ix.user.id, guildId, effectivePropBet); // refund
      onDeclined?.();
      return btn.update({
        embeds: [new EmbedBuilder().setColor('#ed4245')
          .setDescription(`${gameEmoji} <@${opponent.id}> declined the challenge.`)],
        components: [],
      });
    }

    // ── Accept at proposed bet ───────────────────────────────────────────────
    if (btn.customId === `${challengeId}_accept`) {
      resolved = true; col.stop();

      if (effectivePropBet > 0) {
        const oppBalance = getEconomyUser(opponent.id, guildId).points;
        if (oppBalance < effectivePropBet) {
          addPoints(ix.user.id, guildId, effectivePropBet); // refund challenger
          return btn.update({
            embeds: [new EmbedBuilder().setColor('#ed4245')
              .setDescription(t('game.noCoins'))],
            components: [],
          });
        }
        reservePoints(opponent.id, guildId, effectivePropBet);
      }

      await btn.update({
        embeds: [new EmbedBuilder().setColor('#57f287')
          .setTitle(t('challenge.title', {game:`${gameEmoji} ${gameName}`})+' — '+t('game.accept'))
          .setDescription(
            `<@${opponent.id}> accepted!\n\n` +
            (effectivePropBet > 0 ? t('challenge.finalBet', {bet: effectivePropBet.toLocaleString(), pot: (effectivePropBet*2).toLocaleString()}) : t('challenge.nobet')),
          )],
        components: [],
      });

      await onAccepted(effectivePropBet);
      return;
    }

    // ── Counter-offer ────────────────────────────────────────────────────────
    if (btn.customId === `${challengeId}_counter`) {
      const oppBalance = getEconomyUser(opponent.id, guildId).points;
      const opts = buildCounterOptions(effectivePropBet, oppBalance, maxBet, lang);

      const menu = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`${challengeId}_counterpick`)
          .setPlaceholder(t('challenge.pickAmount'))
          .addOptions(opts),
      );
      const cancelRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`${challengeId}_cancelcounter`).setLabel('↩️ Back').setStyle(ButtonStyle.Secondary),
      );

      await btn.update({
        embeds: [new EmbedBuilder().setColor('#5865f2')
          .setTitle(t('challenge.counterBtn'))
          .setDescription(
            `<@${ix.user.id}> proposed **🪙 ${effectivePropBet.toLocaleString()}**.\n\n` +
            t('challenge.counterHow') + '\n' +
            `**The lower of the two amounts is used** — so you can bet less than proposed.\n\n` +
            `Your balance: **🪙 ${oppBalance.toLocaleString()}**`,
          )],
        components: [menu, cancelRow],
      });

      // Wait for counter selection
      const counterCol = msg.createMessageComponentCollector({
        filter: b => b.user.id === opponent.id && b.customId.startsWith(challengeId),
        time: 30_000,
        max: 1,
      });

      counterCol.on('collect', async (inner: any) => {
        if (inner.customId === `${challengeId}_cancelcounter`) {
          return inner.update({ embeds: [challengeEmbed()], components: [row] });
        }

        if (inner.customId === `${challengeId}_counterpick`) {
          const oppBet = parseInt(inner.values[0]);
          const finalBet = Math.min(effectivePropBet, oppBet); // lower wins

          // Reserve opponent's amount
          if (oppBet > 0 && !reservePoints(opponent.id, guildId, oppBet)) {
            return inner.update({
              embeds: [new EmbedBuilder().setColor('#ed4245').setDescription(`❌ Insufficient coins.`)],
              components: [],
            });
          }

          // Refund difference to challenger if they bet more
          if (effectivePropBet > finalBet && effectivePropBet > 0) {
            addPoints(ix.user.id, guildId, effectivePropBet - finalBet);
          }
          // Refund difference to opponent if they bet more  
          if (oppBet > finalBet && oppBet > 0) {
            addPoints(opponent.id, guildId, oppBet - finalBet);
          }

          resolved = true; col.stop();

          await inner.update({
            embeds: [new EmbedBuilder().setColor('#57f287')
              .setTitle(t('challenge.dealAgreed'))
              .setDescription(
                `<@${ix.user.id}> proposed 🪙 ${effectivePropBet.toLocaleString()} — ` +
                `<@${opponent.id}> countered 🪙 ${oppBet.toLocaleString()}\n\n` +
                (finalBet > 0
                  ? `✅ **Final bet: 🪙 ${finalBet.toLocaleString()} each**\n🏆 **Prize pool: 🪙 ${(finalBet * 2).toLocaleString()}**`
                  : t('challenge.nobet')),
              )],
            components: [],
          });

          await onAccepted(finalBet);
        }
      });

      counterCol.on('end', (_, reason) => {
        if (reason === 'time' && !resolved) {
          resolved = true;
          if (effectivePropBet > 0) addPoints(ix.user.id, guildId, effectivePropBet);
          ix.editReply({ embeds: [new EmbedBuilder().setColor('#ed4245').setDescription(t('challenge.counterBtn')+' timed out.')], components: [] }).catch(() => {});
        }
      });
    }
  });

  col.on('end', (_, reason) => {
    if (reason === 'time' && !resolved) {
      resolved = true;
      if (effectivePropBet > 0) addPoints(ix.user.id, guildId, effectivePropBet); // refund
      ix.editReply({
        embeds: [new EmbedBuilder().setColor('#ed4245')
          .setDescription(t('challenge.title', {game:gameEmoji})+' — '+t('game.expired'))],
        components: [],
      }).catch(() => {});
    }
  });
}
