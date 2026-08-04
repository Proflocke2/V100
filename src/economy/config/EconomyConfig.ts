export interface SlotSymbol {
  emoji: string;
  name: string;
  weight: number;
  payout: number;
}

export interface EconomySettings {
  startingBalance: number;
  maxTransfer: number;
  maxBet: number;
  minBet: number;
  challengeTimeout: number;
  blackjackTimeout: number;
  currency: string;
  currencyName: string;
  /**
   * Maximum number of gambling games in a rolling 30-minute window.
   * Locked out for 15 minutes after that.
   */
  sessionLimit: number;
}

export type ChallengeGame = 'blackjack' | 'coinflip';

export class EconomyConfig {

  static readonly SETTINGS: EconomySettings = {
    startingBalance:  1_000,
    maxTransfer:     Number.MAX_SAFE_INTEGER,  // No transfer limit
    maxBet:          Number.MAX_SAFE_INTEGER,  // No bet limit
    minBet:          1,                        // Minimum 1 coin
    challengeTimeout: 60,
    blackjackTimeout: 120,
    currency:        '🪙',
    currencyName:    'Coins',
    sessionLimit:    20,       // max games in 30 min before a 15-min lockout
  };

  static readonly SLOT_SYMBOLS: SlotSymbol[] = [
    { emoji: '🍒', name: 'Cherry',  weight: 28, payout:   2 },
    { emoji: '🍋', name: 'Lemon',   weight: 24, payout:   4 },
    { emoji: '🍇', name: 'Grape',   weight: 20, payout:   6 },
    { emoji: '🔔', name: 'Bell',    weight: 13, payout:  12 },
    { emoji: '⭐', name: 'Star',    weight:  9, payout:  25 },
    { emoji: '💎', name: 'Diamond', weight:  4, payout:  80 },
    { emoji: '7️⃣', name: 'Seven',   weight:  2, payout: 200 },
  ];

  static readonly SLOT_LINES: number[][] = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];

  static readonly BLACKJACK = {
    dealerHitUntil:      17,
    blackjackMultiplier: 1.5,
    doubleDownAllowed:   true,
  };

  static readonly CHALLENGE_GAMES: ChallengeGame[] = ['blackjack', 'coinflip'];

  static calculateSlotRTP(): number {
    const total = this.SLOT_SYMBOLS.reduce((s, sym) => s + sym.weight, 0);
    return this.SLOT_SYMBOLS.reduce((ev, sym) => {
      return ev + Math.pow(sym.weight / total, 3) * sym.payout;
    }, 0);
  }

  static fmt(amount: number): string {
    return `${this.SETTINGS.currency} **${amount.toLocaleString('de-DE')}**`;
  }
}
