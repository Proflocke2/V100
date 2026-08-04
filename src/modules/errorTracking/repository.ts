/**
 * modules/errorTracking/repository.ts
 *
 * Pure data-access layer for the self-built error tracking system. No
 * Discord.js imports here on purpose — same shape as every other
 * repository.ts in this project.
 */

import db from '../../database/db';

export interface ErrorLogRow {
  id: number;
  guild_id: string | null;
  source: string;
  message: string;
  stack: string | null;
  user_id: string | null;
  created_at: number;
}

/** Truncated so one gigantic stack trace or message can't blow up bot.db row size. */
export function insertError(
  source: string,
  message: string,
  stack: string | null,
  guildId: string | null,
  userId: string | null,
): void {
  db.prepare(
    'INSERT INTO error_log (guild_id, source, message, stack, user_id) VALUES (?, ?, ?, ?, ?)',
  ).run(guildId, source, message.slice(0, 2000), stack ? stack.slice(0, 4000) : null, userId);
}

export function getRecentErrors(limit = 20, source?: string): ErrorLogRow[] {
  if (source) {
    return db.prepare(
      'SELECT * FROM error_log WHERE source = ? ORDER BY created_at DESC LIMIT ?',
    ).all(source, limit) as ErrorLogRow[];
  }
  return db.prepare(
    'SELECT * FROM error_log ORDER BY created_at DESC LIMIT ?',
  ).all(limit) as ErrorLogRow[];
}

export interface ErrorStatRow {
  source: string;
  count: number;
}

export function getErrorStats(hoursBack = 24): ErrorStatRow[] {
  const since = Math.floor(Date.now() / 1000) - hoursBack * 3600;
  return db.prepare(
    'SELECT source, COUNT(*) as count FROM error_log WHERE created_at >= ? GROUP BY source ORDER BY count DESC',
  ).all(since) as ErrorStatRow[];
}

// ── Global bot config (single row, NOT per-guild — see db.ts's bot_config table) ─

export interface BotConfig {
  errorLogChannel: string | null;
  errorLogGuild: string | null;
}

export function getBotConfig(): BotConfig {
  const row = db.prepare(
    'SELECT error_log_channel, error_log_guild FROM bot_config WHERE id = 1',
  ).get() as { error_log_channel: string | null; error_log_guild: string | null } | undefined;
  return {
    errorLogChannel: row?.error_log_channel ?? null,
    errorLogGuild:   row?.error_log_guild ?? null,
  };
}

export function setErrorLogChannel(channelId: string, guildId: string): void {
  db.prepare('UPDATE bot_config SET error_log_channel = ?, error_log_guild = ? WHERE id = 1').run(channelId, guildId);
}
