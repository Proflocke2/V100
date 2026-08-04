/**
 * Shared bet validation helper used by all game commands.
 *
 * - Reads the guild's max bet from the DB
 * - Clamps the requested bet to the limit
 * - Returns the effective bet and a warning string if clamped
 */
import { getGuildMaxBet } from '../economy/db/EconomyDB';

export interface BetResult {
  bet: number;           // effective bet (may be clamped)
  clamped: boolean;      // true if the original bet exceeded the limit
  limit: number;         // the guild's current limit (0 = no limit)
  warning: string;       // human-readable warning, empty string if no clamp
}

/**
 * Validates and clamps a bet against the guild's max bet setting.
 *
 * @param requested  The amount the player wants to bet (0 = no bet)
 * @param guildId    The Discord guild ID
 */
export function validateBet(requested: number, guildId: string): BetResult {
  if (requested <= 0) return { bet: 0, clamped: false, limit: 0, warning: '' };

  const limit = getGuildMaxBet(guildId);
  if (limit <= 0 || requested <= limit) {
    return { bet: requested, clamped: false, limit, warning: '' };
  }

  return {
    bet: limit,
    clamped: true,
    limit,
    warning: `⚠️ Bet clamped to server max: **🪙 ${limit.toLocaleString()}**`,
  };
}
