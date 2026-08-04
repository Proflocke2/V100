/**
 * STATS TYPES
 * All interfaces and enums for the server statistics system.
 */

// ── Stat channel types ─────────────────────────────────────────────────────────

export type StatChannelType =
  | 'total'       // Total members (humans + bots)
  | 'humans'      // Real humans only
  | 'bots'        // Bots only
  | 'online'      // Online members (requires GUILD_PRESENCES intent)
  | 'boosts'      // Server boosts
  | 'boost_level' // Boost level (0–3)
  | 'role';       // Members with a specific role

// ── Stored channel configuration ────────────────────────────────────────

export interface StatChannel {
  channelId: string;
  type: StatChannelType;
  template: string;   // e.g. "👥 Members: {value}"
  roleId?: string;    // Only for type = 'role'
}

// ── Guild config in the DB ───────────────────────────────────────────────────

export interface StatsConfig {
  guildId: string;
  channels: StatChannel[];   // JSON array of stat channels
  updatedAt: number;         // Unix timestamp (ms) of the last update
}

// ── Real-time values ───────────────────────────────────────────────────────────

export interface GuildStats {
  total: number;
  humans: number;
  bots: number;
  online: number;
  boosts: number;
  boostLevel: number;
  roles: Record<string, number>;  // roleId → member count
}

// ── Default templates ──────────────────────────────────────────────────────
// Stored as a marker in the DB.
// When rendering, this value gets replaced by the localized text.

export const DEFAULT_TEMPLATE_SENTINEL = '__default__';

/** For backwards compatibility: recognize old hardcoded templates */
export const LEGACY_DEFAULT_TEMPLATES: string[] = [
  '👥 Mitglieder: {value}', '🧑 Menschen: {value}', '🤖 Bots: {value}',
  '🟢 Online: {value}', '🚀 Boosts: {value}', '⭐ Boost-Level: {value}', '🎭 {role}: {value}',
  '👥 Members: {value}', '🧑 Humans: {value}', '🟢 Online: {value}',
  '🚀 Boosts: {value}', '⭐ Boost Level: {value}',
];
