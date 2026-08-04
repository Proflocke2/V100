/**
 * modules/stickyMessage/repository.ts
 * Pure data-access layer for sticky messages — one per (guild, channel).
 */

import db from '../../database/db';

export interface StickyRow {
  guild_id: string;
  channel_id: string;
  content: string;
  message_id: string | null;
  created_by: string;
  updated_at: number;
}

export function getSticky(guildId: string, channelId: string): StickyRow | null {
  return db.prepare(
    'SELECT * FROM sticky_messages WHERE guild_id = ? AND channel_id = ?',
  ).get(guildId, channelId) as StickyRow | null;
}

export function setSticky(guildId: string, channelId: string, content: string, createdBy: string): void {
  db.prepare(`
    INSERT INTO sticky_messages (guild_id, channel_id, content, created_by, updated_at)
    VALUES (?, ?, ?, ?, unixepoch())
    ON CONFLICT (guild_id, channel_id)
    DO UPDATE SET content = excluded.content, created_by = excluded.created_by,
                  message_id = NULL, updated_at = unixepoch()
  `).run(guildId, channelId, content, createdBy);
}

export function removeSticky(guildId: string, channelId: string): void {
  db.prepare('DELETE FROM sticky_messages WHERE guild_id = ? AND channel_id = ?').run(guildId, channelId);
}

export function updateMessageId(guildId: string, channelId: string, messageId: string | null): void {
  db.prepare(
    'UPDATE sticky_messages SET message_id = ? WHERE guild_id = ? AND channel_id = ?',
  ).run(messageId, guildId, channelId);
}
