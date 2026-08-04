/**
 * ECONOMY DATABASE LAYER
 * All SQLite operations for the economy system.
 * Uses the existing better-sqlite3 instance from db.ts
 */

import db from '../../database/db';
import { EconomyConfig } from '../config/EconomyConfig';

export interface IEconomyUser {
  userId: string;
  guildId: string;
  points: number;
  totalWon: number;
  totalLost: number;
  gamesPlayed: number;
  createdAt: number;
}

// ============================================================================
// TABLE INITIALIZATION
// ============================================================================

export function initEconomyTables(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS economy_users (
      user_id      TEXT    NOT NULL,
      guild_id     TEXT    NOT NULL,
      points       INTEGER NOT NULL DEFAULT 1000,
      total_won    INTEGER NOT NULL DEFAULT 0,
      total_lost   INTEGER NOT NULL DEFAULT 0,
      games_played INTEGER NOT NULL DEFAULT 0,
      created_at   INTEGER DEFAULT (unixepoch()),
      PRIMARY KEY (user_id, guild_id)
    );

    CREATE INDEX IF NOT EXISTS idx_economy_guild_points
      ON economy_users(guild_id, points DESC);

    CREATE TABLE IF NOT EXISTS eco_guild_settings (
      guild_id     TEXT PRIMARY KEY,
      max_bet      INTEGER DEFAULT 0,
      max_transfer INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS eco_admin_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id    TEXT NOT NULL,
      admin_id    TEXT NOT NULL,
      target_id   TEXT NOT NULL,
      action      TEXT NOT NULL,
      amount      INTEGER,
      old_balance INTEGER,
      new_balance INTEGER,
      ts          INTEGER DEFAULT (unixepoch())
    );
  `);
  // Runtime migration for existing DBs
  for (const col of [
    "ALTER TABLE eco_guild_settings ADD COLUMN max_transfer INTEGER DEFAULT 0",
  ]) {
    try { db.exec(col); } catch { /* already exists */ }
  }
  console.log('[Economy] Database tables initialized');
}

// ── Per-guild max bet ─────────────────────────────────────────────────────────

/** Returns the guild's max bet, or 0 if no limit is set. */
export function getGuildMaxBet(guildId: string): number {
  const row = db.prepare('SELECT max_bet FROM eco_guild_settings WHERE guild_id = ?').get(guildId) as { max_bet: number } | undefined;
  return row?.max_bet ?? 0;
}

/** Set or remove the guild's max bet. Pass 0 to remove the limit. */
export function setGuildMaxBet(guildId: string, maxBet: number): void {
  db.prepare('INSERT INTO eco_guild_settings (guild_id, max_bet) VALUES (?, ?) ON CONFLICT(guild_id) DO UPDATE SET max_bet = excluded.max_bet').run(guildId, maxBet);
}

/** Returns the guild's max transfer limit, or 0 if no limit is set. */
export function getGuildMaxTransfer(guildId: string): number {
  const row = db.prepare('SELECT max_transfer FROM eco_guild_settings WHERE guild_id = ?').get(guildId) as { max_transfer: number } | undefined;
  return row?.max_transfer ?? 0;
}

/** Set or remove the guild's max transfer limit. Pass 0 to remove the limit. */
export function setGuildMaxTransfer(guildId: string, maxTransfer: number): void {
  db.prepare('INSERT INTO eco_guild_settings (guild_id, max_transfer) VALUES (?, ?) ON CONFLICT(guild_id) DO UPDATE SET max_transfer = excluded.max_transfer').run(guildId, maxTransfer);
}

/** Write an admin-action audit record. */
export function logAdminAction(
  guildId: string,
  adminId: string,
  targetId: string,
  action: 'add' | 'set',
  amount: number,
  oldBalance: number,
  newBalance: number,
): void {
  db.prepare(
    'INSERT INTO eco_admin_log (guild_id, admin_id, target_id, action, amount, old_balance, new_balance) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(guildId, adminId, targetId, action, amount, oldBalance, newBalance);
}


export function getEconomyUser(userId: string, guildId: string): IEconomyUser {
  let row = db
    .prepare('SELECT * FROM economy_users WHERE user_id = ? AND guild_id = ?')
    .get(userId, guildId) as any;

  if (!row) {
    db.prepare(
      'INSERT OR IGNORE INTO economy_users (user_id, guild_id, points) VALUES (?, ?, ?)'
    ).run(userId, guildId, EconomyConfig.SETTINGS.startingBalance);

    row = db
      .prepare('SELECT * FROM economy_users WHERE user_id = ? AND guild_id = ?')
      .get(userId, guildId) as any;
  }

  return mapRow(row);
}

/** Change points relatively (+/−). Also updates statistics. */
export function addPoints(userId: string, guildId: string, amount: number): IEconomyUser {
  getEconomyUser(userId, guildId);

  if (amount > 0) {
    db.prepare(
      'UPDATE economy_users SET points = points + ?, total_won = total_won + ?, games_played = games_played + 1 WHERE user_id = ? AND guild_id = ?'
    ).run(amount, amount, userId, guildId);
  } else {
    const loss = Math.abs(amount);
    db.prepare(
      'UPDATE economy_users SET points = MAX(0, points + ?), total_lost = total_lost + ?, games_played = games_played + 1 WHERE user_id = ? AND guild_id = ?'
    ).run(amount, loss, userId, guildId);
  }

  return getEconomyUser(userId, guildId);
}

/** Punkte absolut setzen (Admin-Only). */
export function setPoints(userId: string, guildId: string, amount: number): IEconomyUser {
  getEconomyUser(userId, guildId);
  db.prepare(
    'UPDATE economy_users SET points = ? WHERE user_id = ? AND guild_id = ?'
  ).run(Math.max(0, amount), userId, guildId);
  return getEconomyUser(userId, guildId);
}

/**
 * Atomic transfer between two users.
 *
 * FIX (TOCTOU): The balance check now happens as a re-read INSIDE the
 * transaction (SELECT … FOR UPDATE equivalent in SQLite = exclusive lock).
 * The old "read outside, write inside" pattern allowed a race condition
 * during parallel games: a user could transfer more than they had.
 *
 * @returns false if the sender doesn't have enough points
 */
export function transferPoints(
  fromId: string,
  toId: string,
  guildId: string,
  amount: number,
): boolean {
  // Zeilen sicherstellen
  getEconomyUser(fromId, guildId);
  getEconomyUser(toId, guildId);

  let success = false;

  db.transaction(() => {
    // Re-Read inside the transaction — SQLite now holds an exclusive lock
    const sender = db
      .prepare('SELECT points FROM economy_users WHERE user_id = ? AND guild_id = ?')
      .get(fromId, guildId) as { points: number } | undefined;

    if (!sender || sender.points < amount) {
      success = false;
      return; // rollback (SQLite transaction never gets committed)
    }

    db.prepare(
      'UPDATE economy_users SET points = points - ? WHERE user_id = ? AND guild_id = ?'
    ).run(amount, fromId, guildId);
    db.prepare(
      'UPDATE economy_users SET points = points + ? WHERE user_id = ? AND guild_id = ?'
    ).run(amount, toId, guildId);

    success = true;
  })();

  return success;
}

/**
 * Reserves points (deducts them) for an active game.
 *
 * FIX (TOCTOU): balance check also re-read inside the transaction.
 * Prevents double-spend when a user fires two gambling commands at the exact same time.
 *
 * @returns false if there isn't enough balance
 */
export function reservePoints(userId: string, guildId: string, amount: number): boolean {
  getEconomyUser(userId, guildId);

  let success = false;

  db.transaction(() => {
    const user = db
      .prepare('SELECT points FROM economy_users WHERE user_id = ? AND guild_id = ?')
      .get(userId, guildId) as { points: number } | undefined;

    if (!user || user.points < amount) {
      success = false;
      return;
    }

    db.prepare(
      'UPDATE economy_users SET points = points - ? WHERE user_id = ? AND guild_id = ?'
    ).run(amount, userId, guildId);

    success = true;
  })();

  return success;
}

/**
 * Record a game loss — updates total_lost and games_played without touching points.
 * Call this when the bet was already removed via reservePoints() and the player lost.
 */
export function recordLoss(userId: string, guildId: string, amount: number): void {
  getEconomyUser(userId, guildId); // ensure user row exists first
  db.prepare(
    'UPDATE economy_users SET total_lost = total_lost + ?, games_played = games_played + 1 WHERE user_id = ? AND guild_id = ?'
  ).run(amount, userId, guildId);
}

/** Top-N leaderboard for a guild. */
export function getLeaderboard(guildId: string, limit = 10): IEconomyUser[] {
  const rows = db.prepare(
    'SELECT * FROM economy_users WHERE guild_id = ? ORDER BY points DESC LIMIT ?'
  ).all(guildId, limit) as any[];
  return rows.map(mapRow);
}

function mapRow(row: any): IEconomyUser {
  return {
    userId:      row.user_id,
    guildId:     row.guild_id,
    points:      row.points,
    totalWon:    row.total_won,
    totalLost:   row.total_lost,
    gamesPlayed: row.games_played,
    createdAt:   row.created_at,
  };
}
