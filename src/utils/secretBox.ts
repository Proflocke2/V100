/**
 * secretBox — small AES-256-GCM helper for encrypting sensitive values
 * (currently: saved webhook URLs) before they go into SQLite.
 *
 * A leaked/copied bot.db previously handed over every saved webhook URL in
 * plain text — enough to spam any channel those webhooks point at, no bot
 * access needed. Encrypting the `url` column closes that specific hole.
 * This is NOT a general-purpose secrets vault; it only protects columns
 * that explicitly call encrypt()/decrypt() below.
 *
 * Key material:
 *   Preferred — set WEBHOOK_ENCRYPTION_KEY in the environment (any string,
 *   the longer/more random the better). Independent of the bot token, so
 *   rotating one doesn't affect the other.
 *
 *   Fallback — if that's not set, a key is derived from BOT_TOKEN (which
 *   every deployment already has) via scrypt with a fixed salt. This keeps
 *   encryption zero-config for existing deployments instead of silently
 *   staying plaintext until someone notices this file exists. It's weaker
 *   than a dedicated secret (anyone with BOT_TOKEN could derive it) but
 *   still turns "grep the DB file" into "you needed the bot token anyway,
 *   at which point you have bigger problems" — strictly better than plain
 *   text, at zero setup cost.
 *
 * Encrypted values are stored as `enc:v1:<iv>:<authTag>:<ciphertext>` (all
 * base64). Anything NOT starting with that prefix is treated as legacy
 * plaintext and returned as-is by decrypt() — see migrateWebhookUrls() in
 * webhookDB.ts for the one-time upgrade pass.
 */

import crypto from 'crypto';

const PREFIX = 'enc:v1:';
const ALGO = 'aes-256-gcm';

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  const explicit = process.env.WEBHOOK_ENCRYPTION_KEY;
  if (explicit) {
    cachedKey = crypto.createHash('sha256').update(explicit).digest();
    return cachedKey;
  }

  const botToken = process.env.BOT_TOKEN;
  if (botToken) {
    // Fixed salt is intentional — this only needs to be deterministic per
    // deployment (same BOT_TOKEN → same key across restarts), not unique
    // per-install-with-a-random-salt like a password hash would need.
    cachedKey = crypto.scryptSync(botToken, 'multibotv2-webhook-secretbox', 32);
    return cachedKey;
  }

  // No BOT_TOKEN and no explicit key — extremely unlikely (the bot can't
  // log in without BOT_TOKEN either), but fail loudly rather than silently
  // encrypting with a predictable all-zero key.
  throw new Error('[secretBox] Neither WEBHOOK_ENCRYPTION_KEY nor BOT_TOKEN is set — cannot derive an encryption key.');
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`;
}

export function decrypt(value: string): string {
  if (!value.startsWith(PREFIX)) return value; // legacy plaintext — pass through

  const [ivB64, tagB64, dataB64] = value.slice(PREFIX.length).split(':');
  if (!ivB64 || !tagB64 || !dataB64) return value; // malformed — don't crash the caller

  try {
    const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const plain = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
    return plain.toString('utf8');
  } catch {
    // Wrong/rotated key, corrupted row, etc. — log a warning so it's
    // visible in Render logs, then return empty string so callers can check.
    console.warn('[secretBox] decrypt() failed — key may have changed since this row was written. Re-save the webhook to fix.');
    return '';
  }
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}
