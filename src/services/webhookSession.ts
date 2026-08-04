/**
 * WEBHOOK SESSION STORE
 * Holds the embed builder state between modals and button clicks.
 * TTL: 30 minutes.
 *
 * FIX: Sessions are now persisted in SQLite instead of a plain in-memory Map.
 * The original Map implementation was wiped on every Render free-tier restart
 * (which happens after ~15 min of inactivity) — any user mid-way through a
 * webhook build would hit "session expired" and have to start over. Storing
 * in the DB means sessions survive restarts and cold starts transparently.
 *
 * The payload is serialized to JSON. TTL is enforced on read: expired rows
 * are deleted at that point rather than by a background cleaner, which is
 * simpler and fine given the low write volume of this feature.
 */

import db from '../database/db';
import { WebhookEmbed, WebhookPayload } from '../services/webhookService';

db.exec(`
  CREATE TABLE IF NOT EXISTS webhook_sessions (
    session_key TEXT PRIMARY KEY,
    webhook_url TEXT NOT NULL,
    payload     TEXT NOT NULL DEFAULT '{}',
    edit_msg_id TEXT,
    expires_at  INTEGER NOT NULL
  );
`);

export interface WebhookSession {
  webhookUrl:  string;
  payload:     WebhookPayload;
  editMsgId?:  string;
}

const TTL_MS = 30 * 60_000; // 30 minutes

function skey(userId: string, guildId: string): string {
  return `${userId}_${guildId}`;
}

export function setSession(userId: string, guildId: string, s: WebhookSession): void {
  const key       = skey(userId, guildId);
  const expiresAt = Math.floor((Date.now() + TTL_MS) / 1000);
  db.prepare(`
    INSERT INTO webhook_sessions (session_key, webhook_url, payload, edit_msg_id, expires_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(session_key) DO UPDATE SET
      webhook_url  = excluded.webhook_url,
      payload      = excluded.payload,
      edit_msg_id  = excluded.edit_msg_id,
      expires_at   = excluded.expires_at
  `).run(key, s.webhookUrl, JSON.stringify(s.payload), s.editMsgId ?? null, expiresAt);
}

export function getSession(userId: string, guildId: string): WebhookSession | null {
  const key = skey(userId, guildId);
  const now = Math.floor(Date.now() / 1000);
  const row = db.prepare('SELECT * FROM webhook_sessions WHERE session_key = ?').get(key) as any;
  if (!row) return null;
  if (row.expires_at < now) {
    db.prepare('DELETE FROM webhook_sessions WHERE session_key = ?').run(key);
    return null;
  }
  // Bump TTL on every read so active sessions don't expire mid-flow
  db.prepare('UPDATE webhook_sessions SET expires_at = ? WHERE session_key = ?').run(
    Math.floor((Date.now() + TTL_MS) / 1000), key,
  );
  return {
    webhookUrl: row.webhook_url,
    payload:    JSON.parse(row.payload),
    editMsgId:  row.edit_msg_id ?? undefined,
  };
}

export function updateSession(userId: string, guildId: string, patch: Partial<WebhookSession>): void {
  const existing = getSession(userId, guildId);
  if (!existing) return;
  setSession(userId, guildId, { ...existing, ...patch });
}

export function patchEmbed(userId: string, guildId: string, embedPatch: Partial<WebhookEmbed>): void {
  const s = getSession(userId, guildId);
  if (!s) return;
  const embed  = s.payload.embeds?.[0] ?? {};
  const merged = { ...embed, ...embedPatch };
  updateSession(userId, guildId, { payload: { ...s.payload, embeds: [merged] } });
}

export function clearSession(userId: string, guildId: string): void {
  db.prepare('DELETE FROM webhook_sessions WHERE session_key = ?').run(skey(userId, guildId));
}
