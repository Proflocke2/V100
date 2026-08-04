/**
 * GAMBLING COOLDOWN & SESSION-LIMIT SYSTEM
 *
 * Two protection mechanisms:
 *  1. Global cooldown  – 15 seconds between two gambling commands (per user+guild)
 *  2. Session limit    – max. SESSION_LIMIT games in a rolling 30-min window.
 *                          Once the limit is reached, a 15-minute lockout applies.
 *
 * Everything in-memory (no DB overhead for simple rate limits).
 */

export type CooldownReason = 'cooldown' | 'session';

export interface CooldownBlock {
  reason: CooldownReason;
  remainingMs: number;
}

interface Entry {
  /** Timestamp des letzten Spielstarts. */
  lastGame: number;
  /** Timestamps of all games in the rolling window. */
  sessionGames: number[];
  /** If the session limit was hit: locked until this point in time. */
  lockedUntil?: number;
}

export class GamblingCooldown {
  // ── Konfiguration ──────────────────────────────────────────────────────────
  /** Global cooldown in ms (15 seconds). */
  static GLOBAL_CD_MS = 15_000;
  /** Rolling time window for the session limit (30 minutes). */
  static SESSION_WINDOW_MS = 30 * 60_000;
  /** Lockout after hitting the session limit (15 minutes). */
  static SESSION_LOCKOUT_MS = 15 * 60_000;
  /**
   * Maximale Anzahl Spiele im SESSION_WINDOW_MS.
   * Taken from EconomyConfig.SETTINGS.sessionLimit (default: 20).
   */
  static SESSION_LIMIT = 20;

  // ── Internal state ─────────────────────────────────────────────────────────
  private static readonly map = new Map<string, Entry>();

  // FIX: Purge stale entries every 60 minutes to prevent unbounded map growth.
  static { setInterval(() => {
    const cutoff = Date.now() - GamblingCooldown.SESSION_WINDOW_MS;
    for (const [k, e] of GamblingCooldown.map) {
      if (e.lastGame < cutoff && !e.lockedUntil) GamblingCooldown.map.delete(k);
    }
  }, 60 * 60_000); }

  private static key(userId: string, guildId: string): string {
    return `${userId}_${guildId}`;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Checks whether the user is allowed to play.
   * @param cdMs Overrides GLOBAL_CD_MS (for per-guild settings).
   * @returns `null` if everything is OK, otherwise a `CooldownBlock` object.
   */
  static check(userId: string, guildId: string, cdMs?: number): CooldownBlock | null {
    const key  = this.key(userId, guildId);
    const now  = Date.now();
    const entry = this.map.get(key);
    const effectiveCd = cdMs ?? this.GLOBAL_CD_MS;

    if (!entry) return null;

    // ── 1. Check session lock ───────────────────────────────────────────
    if (entry.lockedUntil !== undefined && now < entry.lockedUntil) {
      return { reason: 'session', remainingMs: entry.lockedUntil - now };
    }
    // Clean up expired lock
    if (entry.lockedUntil !== undefined && now >= entry.lockedUntil) {
      entry.lockedUntil = undefined;
      entry.sessionGames = [];
    }

    // ── 2. Check global cooldown ───────────────────────────────────────
    const elapsed = now - entry.lastGame;
    if (elapsed < effectiveCd) {
      return { reason: 'cooldown', remainingMs: effectiveCd - elapsed };
    }

    return null;
  }

  /**
   * Registers a new game. Must be called after `check()` has returned `null`
   * and the game actually starts.
   */
  static record(userId: string, guildId: string): void {
    const key = this.key(userId, guildId);
    const now = Date.now();

    const entry: Entry = this.map.get(key) ?? {
      lastGame: 0,
      sessionGames: [],
    };

    // Globalen Cooldown-Timestamp setzen
    entry.lastGame = now;

    // Remove old entries outside the window
    entry.sessionGames = entry.sessionGames.filter(
      t => now - t < this.SESSION_WINDOW_MS,
    );
    entry.sessionGames.push(now);

    // Check session limit and set lock if needed
    if (entry.sessionGames.length >= this.SESSION_LIMIT) {
      entry.lockedUntil = now + this.SESSION_LOCKOUT_MS;
      entry.sessionGames = []; // Reset window
    }

    this.map.set(key, entry);
  }

  /** Resets all cooldowns for a user (e.g. for admins). */
  static reset(userId: string, guildId: string): void {
    this.map.delete(this.key(userId, guildId));
  }

  /** How many games has the user played in the current window? */
  static sessionCount(userId: string, guildId: string): number {
    const entry = this.map.get(this.key(userId, guildId));
    if (!entry) return 0;
    const now = Date.now();
    return entry.sessionGames.filter(t => now - t < this.SESSION_WINDOW_MS).length;
  }
}
