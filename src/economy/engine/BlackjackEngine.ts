/**
 * BLACKJACK ENGINE
 * ──────────────────────────────────────────────────────────────────────────
 * Full blackjack game logic. No discord.js, no DB calls.
 *
 * Rules:
 *  - Standard deck (52 cards), reshuffled after every game
 *  - Dealer draws until ≥ 17 (soft 17 included)
 *  - Ace can be 1 or 11 (flexible calculation)
 *  - Blackjack (ace + 10-card): 3:2 payout
 *  - Double down: double the bet, draw exactly 1 card
 * ──────────────────────────────────────────────────────────────────────────
 */

import { EconomyConfig } from '../config/EconomyConfig';

// ============================================================================
// TYPES
// ============================================================================

export interface Card {
  suit:  '♠' | '♥' | '♦' | '♣';
  rank:  string;     // 'A', '2'–'10', 'J', 'Q', 'K'
  value: number;     // Numerischer Basiswert (As = 11 als Default)
}

export type BJAction = 'hit' | 'stand' | 'doubleDown';

export type BJStatus =
  | 'playing'        // Player's turn
  | 'dealer_turn'    // Dealer draws (no more player turns)
  | 'player_bust'    // Player busts
  | 'dealer_bust'    // Dealer busts → player wins
  | 'player_win'     // Spieler gewinnt normalen Vergleich
  | 'dealer_win'     // Dealer wins
  | 'push'           // Tie
  | 'player_bj'      // Blackjack (21 with 2 cards)
  | 'doubled_win'    // Win after double down
  | 'doubled_loss';  // Loss after double down

export interface BJState {
  playerHand: Card[];
  dealerHand: Card[];
  playerTotal: number;
  dealerTotal: number;
  dealerVisibleTotal: number;  // Dealer only shows 1st card
  bet: number;
  currentBet: number;          // Can change on double down
  status: BJStatus;
  canDoubleDown: boolean;
  playerId: string;
  guildId: string;
  startedAt: number;
}

// ============================================================================
// BLACKJACK ENGINE CLASS
// ============================================================================

export class BlackjackEngine {

  // ── Create & shuffle deck ──────────────────────────────────────────────────

  static createDeck(): Card[] {
    const suits: Card['suit'][] = ['♠', '♥', '♦', '♣'];
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

    const deck: Card[] = [];
    for (const suit of suits) {
      for (const rank of ranks) {
        let value: number;
        if (rank === 'A')                               value = 11;
        else if (['J', 'Q', 'K'].includes(rank))       value = 10;
        else                                            value = parseInt(rank);
        deck.push({ suit, rank, value });
      }
    }

    // Fisher-Yates Shuffle
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    return deck;
  }

  // ── Handwert berechnen (flexible As-Logik) ────────────────────────────────

  static calcHand(hand: Card[]): number {
    let total = 0;
    let aces  = 0;

    for (const card of hand) {
      if (card.rank === 'A') {
        aces++;
        total += 11;
      } else {
        total += card.value;
      }
    }

    // Reduce ace from 11 to 1 if needed
    while (total > 21 && aces > 0) {
      total -= 10;
      aces--;
    }

    return total;
  }

  // ── Blackjack check: 21 with exactly 2 cards ─────────────────────────────

  static isBlackjack(hand: Card[]): boolean {
    if (hand.length !== 2) return false;
    const total = this.calcHand(hand);
    const hasAce = hand.some(c => c.rank === 'A');
    const hasTen = hand.some(c => c.value === 10);
    return total === 21 && hasAce && hasTen;
  }

  // ── Neues Spiel starten ────────────────────────────────────────────────────

  static createGame(playerId: string, guildId: string, bet: number): {
    state: BJState;
    deck: Card[];
  } {
    const deck = this.createDeck();

    // Deal two cards each to player and dealer (alternating)
    const playerHand: Card[] = [deck.pop()!, deck.pop()!];
    const dealerHand: Card[] = [deck.pop()!, deck.pop()!];

    const playerTotal = this.calcHand(playerHand);
    const dealerTotal = this.calcHand(dealerHand);

    // Dealer only shows their first card
    const dealerVisibleTotal = this.calcHand([dealerHand[0]]);

    // Sofortiger Blackjack?
    let status: BJStatus = 'playing';
    if (this.isBlackjack(playerHand)) {
      if (this.isBlackjack(dealerHand)) {
        status = 'push';
      } else {
        status = 'player_bj';
      }
    }

    // Double down only with 2 cards and a total of 9–11
    const canDoubleDown =
      EconomyConfig.BLACKJACK.doubleDownAllowed &&
      playerHand.length === 2 &&
      playerTotal >= 9 &&
      playerTotal <= 11 &&
      status === 'playing';

    const state: BJState = {
      playerHand,
      dealerHand,
      playerTotal,
      dealerTotal,
      dealerVisibleTotal,
      bet,
      currentBet: bet,
      status,
      canDoubleDown,
      playerId,
      guildId,
      startedAt: Date.now(),
    };

    return { state, deck };
  }

  // ── Spieleraktion: Hit ────────────────────────────────────────────────────

  static hit(state: BJState, deck: Card[]): BJState {
    const newCard = deck.pop()!;
    state.playerHand.push(newCard);
    state.playerTotal = this.calcHand(state.playerHand);
    state.canDoubleDown = false;

    if (state.playerTotal > 21) {
      state.status = 'player_bust';
    } else if (state.playerTotal === 21) {
      // Automatically stand at 21
      return this.stand(state, deck);
    }

    return state;
  }

  // ── Spieleraktion: Stand → Dealer zieht ──────────────────────────────────

  static stand(state: BJState, deck: Card[]): BJState {
    state.status = 'dealer_turn';
    state.canDoubleDown = false;

    // Dealer-KI: zieht bis ≥ 17
    while (this.calcHand(state.dealerHand) < EconomyConfig.BLACKJACK.dealerHitUntil) {
      state.dealerHand.push(deck.pop()!);
    }

    state.dealerTotal = this.calcHand(state.dealerHand);

    // Gewinner ermitteln
    if (state.dealerTotal > 21) {
      state.status = 'dealer_bust';
    } else if (state.playerTotal > state.dealerTotal) {
      state.status = 'player_win';
    } else if (state.dealerTotal > state.playerTotal) {
      state.status = 'dealer_win';
    } else {
      state.status = 'push';
    }

    return state;
  }

  // ── Spieleraktion: Double Down ────────────────────────────────────────────

  static doubleDown(state: BJState, deck: Card[]): BJState {
    // Einsatz verdoppeln
    state.currentBet = state.bet * 2;
    state.canDoubleDown = false;

    // Genau eine weitere Karte
    const newCard = deck.pop()!;
    state.playerHand.push(newCard);
    state.playerTotal = this.calcHand(state.playerHand);

    if (state.playerTotal > 21) {
      state.status = 'player_bust';
      return state;
    }

    // Direkt zu Stand
    const resolved = this.stand(state, deck);

    // Rename status for double-down context
    if (resolved.status === 'player_win') resolved.status = 'doubled_win';
    if (resolved.status === 'dealer_win') resolved.status = 'doubled_loss';

    return resolved;
  }

  // ── Auszahlung berechnen ──────────────────────────────────────────────────

  /**
   * Returns the net win/loss.
   * Positiv = Spieler gewinnt, Negativ = Spieler verliert.
   */
  static calculatePayout(state: BJState): number {
    const bet = state.currentBet;

    switch (state.status) {
      case 'player_bj':
        // 3:2 Auszahlung
        return Math.floor(bet * EconomyConfig.BLACKJACK.blackjackMultiplier);

      case 'player_win':
      case 'dealer_bust':
      case 'doubled_win':
        return bet;

      case 'dealer_win':
      case 'player_bust':
      case 'doubled_loss':
        return -bet;

      case 'push':
        return 0;  // push — return bet

      default:
        return 0;
    }
  }

  // ── Renderer ─────────────────────────────────────────────────────────────

  static renderHand(hand: Card[]): string {
    return hand.map(c => `\`${c.rank}${c.suit}\``).join(' ');
  }

  static renderDealerHidden(hand: Card[]): string {
    return `\`${hand[0].rank}${hand[0].suit}\` \`🂠\``;
  }

  static statusLabel(status: BJStatus): string {
    const labels: Record<BJStatus, string> = {
      playing:       '🃏 Dein Zug',
      dealer_turn:   '🤖 Dealer zieht...',
      player_bust:   '💥 Bust!',
      dealer_bust:   '🎉 Dealer bust!',
      player_win:    '✅ Du gewinnst!',
      dealer_win:    '❌ Dealer gewinnt',
      push:          '🤝 Unentschieden',
      player_bj:     '🃏🎰 BLACKJACK!',
      doubled_win:   '✅ Double Down – Gewinn!',
      doubled_loss:  '❌ Double Down – Verlust',
    };
    return labels[status] ?? status;
  }
}
