/**
 * /higherorlower — Higher or Lower card game
 * A card is shown. Guess if the next card is higher or lower.
 * Streak-based scoring: longer streak = more coins.
 * PvE (vs AI streak) + Economy bets.
 */
import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType,
  ButtonInteraction, MessageFlags,
} from 'discord.js';
import { getGuild } from '../../database/db';
import { getLocalized, Language } from '../../utils/localization';
import { reservePoints, addPoints, recordLoss } from '../../economy/db/EconomyDB';
import { validateBet } from '../../utils/betHelper';

// ── Deck ──────────────────────────────────────────────────────────────────────

const SUITS   = ['♠️','♥️','♦️','♣️'] as const;
const VALUES  = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'] as const;
const VALUE_RANK: Record<string, number> = {
  '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14,
};

interface Card { suit: typeof SUITS[number]; value: typeof VALUES[number]; rank: number; }

function makeShuffledDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS)
    for (const value of VALUES)
      deck.push({ suit, value, rank: VALUE_RANK[value] });
  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function cardStr(c: Card): string {
  return `**${c.value}${c.suit}**`;
}

// ── Session ───────────────────────────────────────────────────────────────────

interface HLGame {
  deck: Card[]; current: Card; streak: number;
  bet: number; guildId: string; userId: string;
  done: boolean; createdAt: number;
}

const sessions = new Map<string, HLGame>();
setInterval(() => {
  const now = Date.now();
  sessions.forEach((v, k) => { if (now - v.createdAt > 15 * 60_000) sessions.delete(k); });
}, 5 * 60_000);

// ── Streak multiplier ─────────────────────────────────────────────────────────

function streakMultiplier(streak: number): number {
  if (streak >= 10) return 5;
  if (streak >= 7)  return 4;
  if (streak >= 5)  return 3;
  if (streak >= 3)  return 2;
  return 1;
}

function streakBar(streak: number): string {
  const milestones = [3, 5, 7, 10];
  return milestones.map(m => streak >= m ? '🟡' : '⚫').join('');
}

// ── Embed ─────────────────────────────────────────────────────────────────────

function gameEmbed(g: HLGame, label = ''): EmbedBuilder {
  const mult = streakMultiplier(g.streak);
  const potential = g.bet > 0 ? g.bet * mult : 0;
  return new EmbedBuilder()
    .setTitle('🃏 Higher or Lower')
    .setColor('#e67e22')
    .setDescription(
      `**Current card:** ${cardStr(g.current)}\n\n` +
      `Is the next card **higher** or **lower**?\n\n` +
      `**Streak:** ${'🔥'.repeat(Math.min(g.streak, 10))} **${g.streak}**  ${streakBar(g.streak)}\n` +
      `**Multiplier:** ×${mult}` +
      (g.bet > 0 ? `\n**Win now:** 🪙 ${potential.toLocaleString()} coins` : '') +
      (label ? `\n\n${label}` : ''),
    )
    .setFooter({ text: 'Streak 3=×2 | 5=×3 | 7=×4 | 10=×5 | Equal = loss' });
}

function buildButtons(gid: string, disabled = false): ActionRowBuilder<ButtonBuilder>[] {
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`hl_higher_${gid}`).setLabel('⬆️ Higher').setStyle(ButtonStyle.Success).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`hl_lower_${gid}`).setLabel('⬇️ Lower').setStyle(ButtonStyle.Danger).setDisabled(disabled),
    new ButtonBuilder().setCustomId(`hl_cashout_${gid}`).setLabel('💰 Cash Out').setStyle(ButtonStyle.Secondary).setDisabled(disabled || true),
  )];
}

function buildCashoutButtons(gid: string): ActionRowBuilder<ButtonBuilder>[] {
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`hl_higher_${gid}`).setLabel('⬆️ Higher').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`hl_lower_${gid}`).setLabel('⬇️ Lower').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`hl_cashout_${gid}`).setLabel('💰 Cash Out').setStyle(ButtonStyle.Primary),
  )];
}

// ── Command ───────────────────────────────────────────────────────────────────

export default {
  data: new SlashCommandBuilder()
    .setName('higherorlower')
    .setDescription('Higher or Lower — guess the next card! 🃏')
    .setDMPermission(false)
    .addIntegerOption(o => o
      .setName('bet')
      .setDescription('Bet coins — multiplied by your streak (×2 at 3, ×3 at 5, ×4 at 7, ×5 at 10)')
      .setMinValue(1)),

  async execute(ix: ChatInputCommandInteraction) {
    const lang = (getGuild(ix.guildId!)?.language || 'en') as Language;
    const t = (k: string, v?: Record<string, string>) => getLocalized(k, lang, v);

    const rawBet = ix.options.getInteger('bet') ?? 0;
    const { bet, warning: betWarning } = validateBet(rawBet, ix.guildId!);

    if (bet > 0 && !reservePoints(ix.user.id, ix.guildId!, bet))
      return ix.reply({ embeds: [new EmbedBuilder().setColor('#ed4245').setDescription(t('game.noCoins'))], flags: MessageFlags.Ephemeral });

    const deck = makeShuffledDeck();
    const firstCard = deck.shift()!;
    const gid = `hl_${ix.user.id}_${Date.now()}`;

    const g: HLGame = {
      deck, current: firstCard, streak: 0,
      bet, guildId: ix.guildId!, userId: ix.user.id,
      done: false, createdAt: Date.now(),
    };
    sessions.set(ix.user.id, g);

    const msg = await ix.reply({
      embeds: [gameEmbed(g)],
      components: buildButtons(gid),
      fetchReply: true,
    });

    if (betWarning) await ix.followUp({ content: betWarning, flags: MessageFlags.Ephemeral }).catch(() => {});

    const col = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: b => b.user.id === ix.user.id && b.customId.includes(gid),
      time: 10 * 60_000,
    });

    col.on('collect', async (btn: ButtonInteraction) => {
      const gg = sessions.get(ix.user.id);
      if (!gg || gg.done) return btn.deferUpdate();

      // ── Cash out ────────────────────────────────────────────────────────────
      if (btn.customId === `hl_cashout_${gid}`) {
        if (gg.streak === 0) return btn.reply({ content: 'Win at least one round before cashing out!', flags: MessageFlags.Ephemeral });
        gg.done = true; sessions.delete(ix.user.id); col.stop();
        const mult = streakMultiplier(gg.streak);
        const winnings = gg.bet > 0 ? gg.bet * mult : 0;
        if (gg.bet > 0) addPoints(ix.user.id, gg.guildId, winnings);
        return btn.update({
          embeds: [new EmbedBuilder().setTitle('💰 Cashed Out!').setColor('#57f287')
            .setDescription(`Streak: **${gg.streak}** 🔥\n${gg.bet > 0 ? `🪙 You won **${winnings.toLocaleString()}** coins! (×${mult})` : 'No bet — play with coins next time!'}`)],
          components: [],
        });
      }

      // ── Draw next card ──────────────────────────────────────────────────────
      if (!gg.deck.length) {
        // Deck exhausted — reshuffle (minus current card)
        const fresh = makeShuffledDeck().filter(c => !(c.value === gg.current.value && c.suit === gg.current.suit));
        gg.deck.push(...fresh);
      }

      const next = gg.deck.shift()!;
      const guessedHigher = btn.customId === `hl_higher_${gid}`;
      const prevRank = gg.current.rank;
      const nextRank = next.rank;

      // Equal = loss (house edge)
      const correct = guessedHigher
        ? nextRank > prevRank
        : nextRank < prevRank;

      const prevCard = gg.current;
      gg.current = next;

      if (!correct) {
        // ── Wrong guess ───────────────────────────────────────────────────────
        gg.done = true; sessions.delete(ix.user.id); col.stop();
        if (gg.bet > 0) recordLoss(ix.user.id, gg.guildId, gg.bet);

        return btn.update({
          embeds: [new EmbedBuilder().setTitle('❌ Wrong!').setColor('#ed4245')
            .setDescription(
              `${cardStr(prevCard)} → ${cardStr(next)}\n\n` +
              `You guessed **${guessedHigher ? 'Higher' : 'Lower'}** — it was **${nextRank === prevRank ? 'Equal (loss!)' : guessedHigher ? 'Lower' : 'Higher'}**.\n\n` +
              `Streak ended at **${gg.streak}**${gg.bet > 0 ? `\n🪙 -${gg.bet.toLocaleString()} coins.` : ''}`,
            )],
          components: [],
        });
      }

      // ── Correct guess ─────────────────────────────────────────────────────
      gg.streak++;
      const mult = streakMultiplier(gg.streak);
      const label = `${cardStr(prevCard)} → ${cardStr(next)} ✅ ${guessedHigher ? '⬆️' : '⬇️'} Correct!`;

      // Enable cash out after first correct guess
      await btn.update({
        embeds: [gameEmbed(gg, label)],
        components: gg.streak >= 1 ? buildCashoutButtons(gid) : buildButtons(gid),
      });
    });

    col.on('end', (_, reason) => {
      if (reason === 'time') {
        const gg = sessions.get(ix.user.id);
        if (gg && !gg.done) {
          // Auto cash out on timeout if streak > 0
          if (gg.streak > 0 && gg.bet > 0) {
            const mult = streakMultiplier(gg.streak);
            addPoints(ix.user.id, gg.guildId, gg.bet * mult);
            ix.editReply({ embeds: [new EmbedBuilder().setColor('#fee75c').setDescription(`⏱️ Timed out — auto cashed out! Streak ${gg.streak} × ${mult} = 🪙 ${(gg.bet * mult).toLocaleString()}`)], components: [] }).catch(() => {});
          } else {
            if (gg.bet > 0) addPoints(ix.user.id, gg.guildId, gg.bet); // refund if no streak
            ix.editReply({ embeds: [new EmbedBuilder().setColor('#ed4245').setDescription('⏱️ Game expired. Bet refunded.')], components: [] }).catch(() => {});
          }
          sessions.delete(ix.user.id);
        }
      }
    });
  },
};
