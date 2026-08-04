/**
 * SERVER-BACKUP — chat message logging.
 *
 * Deliberately its own table, separate from anything the bot itself
 * "owns" (tickets, economy, etc) — this is raw SERVER content (what
 * members said), not bot state, per Luka's explicit request to keep the
 * two kinds of data apart. Opt-in per guild (server_backup_messages_enabled,
 * defaults OFF — see db.ts migration comment for why this one doesn't
 * default on like the rest of this session's features).
 *
 * Forward-only: logging starts the moment a guild turns this on. No
 * attempt to backfill message history from before that point — bulk-
 * fetching full history across every channel would be a much bigger,
 * separately-scoped feature, and wasn't what was asked for ("ab jetzt").
 *
 * Retention: pruneOldMessages() runs daily (see schedulers.ts) and deletes
 * rows older than each guild's configured retention window, default 90
 * days, 0 = keep forever. This matters more here than anywhere else in the
 * bot — every-message-in-every-channel logging can grow the DB file fast,
 * and bot.db gets pushed to GitHub as the persistence backend, so unbounded
 * growth is a real operational problem, not just a disk-space nicety.
 */

import { Message } from 'discord.js';
import db, { getGuild } from '../../database/db';

db.exec(`
  CREATE TABLE IF NOT EXISTS server_backup_messages (
    id          TEXT PRIMARY KEY,
    guild_id    TEXT NOT NULL,
    channel_id  TEXT NOT NULL,
    author_id   TEXT NOT NULL,
    content     TEXT,
    attachments TEXT,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sbm_guild   ON server_backup_messages(guild_id);
  CREATE INDEX IF NOT EXISTS idx_sbm_channel ON server_backup_messages(channel_id);
  CREATE INDEX IF NOT EXISTS idx_sbm_author  ON server_backup_messages(author_id);
  CREATE INDEX IF NOT EXISTS idx_sbm_created ON server_backup_messages(created_at);
`);

/**
 * Call from messageCreate.ts, before any moderation deletes the message —
 * a backup that only captures messages moderation didn't touch would miss
 * exactly the content most likely to matter later. No-op if the guild
 * hasn't opted in.
 */
export function maybeLogMessage(message: Message): void {
  if (!message.guild) return;
  const guildRow = getGuild(message.guild.id) as { server_backup_messages_enabled: number };
  if (!guildRow.server_backup_messages_enabled) return;

  const attachments = message.attachments.size
    ? JSON.stringify([...message.attachments.values()].map(a => a.url))
    : null;

  try {
    db.prepare(
      'INSERT OR IGNORE INTO server_backup_messages (id, guild_id, channel_id, author_id, content, attachments, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(message.id, message.guild.id, message.channelId, message.author.id, message.content || null, attachments, Math.floor(message.createdTimestamp / 1000));
  } catch (err) {
    console.error('[ServerBackup] Failed to log message (non-fatal):', err);
  }
}

export interface MessageLogConfig {
  enabled: boolean;
  retentionDays: number;
}

export function getMessageLogConfig(guildId: string): MessageLogConfig {
  const g = getGuild(guildId) as { server_backup_messages_enabled: number; server_backup_messages_retention_days: number | null };
  return {
    enabled: !!g.server_backup_messages_enabled,
    retentionDays: g.server_backup_messages_retention_days ?? 90,
  };
}

export function countLoggedMessages(guildId: string): number {
  return (db.prepare('SELECT COUNT(*) AS c FROM server_backup_messages WHERE guild_id = ?').get(guildId) as { c: number }).c;
}

/** Called daily by the prune scheduler — deletes rows past each guild's own retention window. retentionDays = 0 means "keep forever", skipped entirely. */
export function pruneOldMessages(): { guildsPruned: number; rowsDeleted: number } {
  const rows = db.prepare(
    'SELECT id, server_backup_messages_retention_days AS days FROM guilds WHERE server_backup_messages_enabled = 1 AND server_backup_messages_retention_days > 0',
  ).all() as { id: string; days: number }[];

  let guildsPruned = 0;
  let rowsDeleted = 0;
  const now = Math.floor(Date.now() / 1000);

  for (const g of rows) {
    const cutoff = now - g.days * 86400;
    const res = db.prepare('DELETE FROM server_backup_messages WHERE guild_id = ? AND created_at < ?').run(g.id, cutoff);
    if (res.changes > 0) {
      guildsPruned++;
      rowsDeleted += res.changes;
    }
  }
  return { guildsPruned, rowsDeleted };
}

/**
 * GDPR hook — called from handlers/dataDeleteHandler.ts's /data delete
 * flow so a user's logged message content is included in that deletion,
 * not just the bot's own tables. Scoped to one guild, matching how every
 * other table in that deletion transaction works.
 */
export function deleteUserMessages(userId: string, guildId: string): number {
  return db.prepare('DELETE FROM server_backup_messages WHERE author_id = ? AND guild_id = ?').run(userId, guildId).changes;
}
