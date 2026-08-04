/**
 * CHALLENGE ENGINE
 * ──────────────────────────────────────────────────────────────────────────
 * PvP challenges between two players.
 * Manages pending challenges in memory (Map).
 * Contains coin-flip game logic and BJ-start delegation.
 * ──────────────────────────────────────────────────────────────────────────
 */

import { EconomyConfig, ChallengeGame } from '../config/EconomyConfig';

// ============================================================================
// TYPES
// ============================================================================

export interface PendingChallenge {
  challengerId: string;
  challengedId: string;
  guildId: string;
  game: ChallengeGame;
  bet: number;
  expiresAt: number;          // Unix timestamp (ms)
  messageId: string;          // Discord message with the buttons
  channelId: string;
}

export type ChallengeResult = 'challenger_win' | 'challenged_win' | 'cancelled';

export interface CoinFlipResult {
  side: 'heads' | 'tails';
  challengerSide: 'heads' | 'tails';
  winner: 'challenger' | 'challenged';
}

// ============================================================================
// CHALLENGE ENGINE CLASS
// ============================================================================

export class ChallengeEngine {

  /** Aktive Pending-Challenges: messageId → PendingChallenge */
  private static pending = new Map<string, PendingChallenge>();

  // ── Create challenge ───────────────────────────────────────────────────────

  static create(
    challengerId: string,
    challengedId: string,
    guildId: string,
    game: ChallengeGame,
    bet: number,
    messageId: string,
    channelId: string,
  ): PendingChallenge {
    const challenge: PendingChallenge = {
      challengerId,
      challengedId,
      guildId,
      game,
      bet,
      expiresAt: Date.now() + EconomyConfig.SETTINGS.challengeTimeout * 1_000,
      messageId,
      channelId,
    };

    this.pending.set(messageId, challenge);

    // Auto-expire after timeout
    setTimeout(() => {
      this.pending.delete(messageId);
    }, EconomyConfig.SETTINGS.challengeTimeout * 1_000);

    return challenge;
  }

  // ── Challenge abrufen & validieren ───────────────────────────────────────

  static get(messageId: string): PendingChallenge | null {
    const ch = this.pending.get(messageId);
    if (!ch) return null;

    // Abgelaufen?
    if (Date.now() > ch.expiresAt) {
      this.pending.delete(messageId);
      return null;
    }

    return ch;
  }

  static remove(messageId: string): void {
    this.pending.delete(messageId);
  }

  static hasPending(userId: string, guildId: string): boolean {
    for (const ch of this.pending.values()) {
      if (ch.guildId !== guildId) continue;
      if (ch.challengerId === userId || ch.challengedId === userId) return true;
    }
    return false;
  }

  // ── Coin Flip Logik ───────────────────────────────────────────────────────

  /**
   * Runs a coin flip.
   * The challenger always "picks" heads, the challenged always tails.
   */
  static coinFlip(): CoinFlipResult {
    const side: 'heads' | 'tails' = Math.random() < 0.5 ? 'heads' : 'tails';
    const challengerSide = 'heads';
    const winner: 'challenger' | 'challenged' =
      side === challengerSide ? 'challenger' : 'challenged';

    return { side, challengerSide, winner };
  }

  // ── Validierungen ─────────────────────────────────────────────────────────

  static validateBet(bet: number): string | null {
    if (!Number.isInteger(bet) || bet < EconomyConfig.SETTINGS.minBet) {
      return `Minimum bet is ${EconomyConfig.SETTINGS.minBet} coins.`;
    }
    if (bet > EconomyConfig.SETTINGS.maxBet) {
      return `Maximum bet is ${EconomyConfig.SETTINGS.maxBet} coins.`;
    }
    return null;
  }

  static isValidGame(game: string): game is ChallengeGame {
    return (EconomyConfig.CHALLENGE_GAMES as string[]).includes(game);
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  /** Clean up all expired challenges */
  static cleanup(): void {
    const now = Date.now();
    for (const [id, ch] of this.pending.entries()) {
      if (now > ch.expiresAt) this.pending.delete(id);
    }
  }
}
