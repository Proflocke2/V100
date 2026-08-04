import db from '../database/db';
import { encrypt, decrypt, isEncrypted } from '../utils/secretBox';

db.exec(`
  CREATE TABLE IF NOT EXISTS saved_webhooks (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id  TEXT NOT NULL,
    name      TEXT NOT NULL,
    url       TEXT NOT NULL,
    UNIQUE(guild_id, name)
  );
`);

// One-time upgrade pass — encrypts any row still holding a plaintext URL
// from before this feature existed. Safe to run on every boot: rows already
// encrypted (enc:v1: prefix) are skipped, so this is a no-op after the
// first run. See utils/secretBox.ts for why the key is derived the way it is.
(function migrateLegacyPlaintextUrls() {
  try {
    const rows = db.prepare('SELECT id, url FROM saved_webhooks').all() as Array<{ id: number; url: string }>;
    const stmt = db.prepare('UPDATE saved_webhooks SET url = ? WHERE id = ?');
    let migrated = 0;
    for (const row of rows) {
      if (!isEncrypted(row.url)) {
        stmt.run(encrypt(row.url), row.id);
        migrated++;
      }
    }
    if (migrated > 0) console.log(`[webhookDB] Encrypted ${migrated} previously-plaintext saved webhook URL(s).`);
  } catch (err) {
    console.error('[webhookDB] Legacy URL migration failed (webhooks will still work, just unencrypted for now):', err);
  }
})();

export function saveWebhook(guildId: string, name: string, url: string): void {
  db.prepare('INSERT OR REPLACE INTO saved_webhooks (guild_id, name, url) VALUES (?, ?, ?)').run(guildId, name, encrypt(url));
}

export function getWebhook(guildId: string, name: string): { url: string } | null {
  const row = db.prepare('SELECT url FROM saved_webhooks WHERE guild_id = ? AND name = ?').get(guildId, name) as { url: string } | undefined;
  if (!row) return null;
  const url = decrypt(row.url);
  if (!url) {
    console.error(`[webhookDB] Decryption failed for webhook "${name}" in guild ${guildId}. Re-save it with /webhook → Manage.`);
    return null;
  }
  return { url };
}

export function listWebhooks(guildId: string): { name: string; url: string }[] {
  const rows = db.prepare('SELECT name, url FROM saved_webhooks WHERE guild_id = ? ORDER BY name').all(guildId) as Array<{ name: string; url: string }>;
  return rows.map(r => ({ name: r.name, url: decrypt(r.url) }));
}

export function deleteWebhook(guildId: string, name: string): void {
  db.prepare('DELETE FROM saved_webhooks WHERE guild_id = ? AND name = ?').run(guildId, name);
}

export function removeWebhook(guildId: string, name: string): void {
  deleteWebhook(guildId, name);
}
