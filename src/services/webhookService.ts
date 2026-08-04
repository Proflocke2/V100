/**
 * WEBHOOK SERVICE
 * HTTP calls to Discord webhook URLs via axios.
 *
 * Three operations:
 *   sendWebhook        — POST  {url}?wait=true
 *   editWebhookMessage — PATCH {url}/messages/{id}
 *   deleteWebhookMessage — DELETE {url}/messages/{id}
 *
 * Key fix: Discord returns 400/500 when the payload contains an empty
 * embed object `{}`. stripPayload() removes such objects before every
 * outbound call so the API never sees malformed data regardless of what
 * the builder session accumulated.
 */

import axios from 'axios';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WebhookEmbed {
  title?:       string;
  description?: string;
  url?:         string;
  color?:       number;
  timestamp?:   string;
  author?:  { name: string; url?: string; icon_url?: string };
  thumbnail?: { url: string };
  image?:     { url: string };
  footer?: { text: string; icon_url?: string };
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
}

export interface WebhookPayload {
  content?:    string;
  username?:   string;
  avatar_url?: string;
  embeds?:     WebhookEmbed[];
}

export interface WebhookResult {
  ok:         boolean;
  status?:    number;
  error?:     string;
  messageId?: string;
}

// ── Payload sanitisation ──────────────────────────────────────────────────────

/**
 * Remove embed objects that have no displayable fields — Discord rejects
 * them with 400 "Invalid Form Body" (surfaces as an Internal Server Error
 * in the UI because the fetch itself doesn't throw, just returns ok:false).
 * Also removes undefined/null top-level keys so axios doesn't serialise
 * them into the JSON body.
 */
function stripPayload(raw: WebhookPayload): WebhookPayload {
  const out: WebhookPayload = {};

  if (raw.content?.trim())   out.content    = raw.content.trim();
  if (raw.username?.trim())  out.username   = raw.username.trim();
  if (raw.avatar_url?.trim()) out.avatar_url = raw.avatar_url.trim();

  const EMBED_DISPLAY_KEYS = new Set([
    'title', 'description', 'url', 'color', 'timestamp',
    'author', 'thumbnail', 'image', 'footer', 'fields',
  ]);

  const embeds = (raw.embeds ?? []).filter(e => {
    if (!e || typeof e !== 'object') return false;
    return Object.keys(e).some(k => {
      if (!EMBED_DISPLAY_KEYS.has(k)) return false;
      const v = (e as any)[k];
      if (v === null || v === undefined) return false;
      if (typeof v === 'string' && !v.trim()) return false;
      if (Array.isArray(v) && v.length === 0) return false;
      return true;
    });
  });

  if (embeds.length) out.embeds = embeds;
  return out;
}

/** Returns true if the cleaned payload has at least something to send. */
function isPayloadSendable(p: WebhookPayload): boolean {
  return !!(p.content || (p.embeds && p.embeds.length > 0));
}

// ── URL helpers ───────────────────────────────────────────────────────────────

/** Strips trailing slashes and any stray query string before we append paths. */
function baseUrl(webhookUrl: string): string {
  return webhookUrl.split('?')[0].replace(/\/+$/, '');
}

// ── API calls ─────────────────────────────────────────────────────────────────

const HEADERS = { 'Content-Type': 'application/json' };

/** POST — sends a new webhook message. Returns the message ID when ok. */
export async function sendWebhook(
  url: string,
  payload: WebhookPayload,
): Promise<WebhookResult> {
  const clean = stripPayload(payload);

  if (!isPayloadSendable(clean)) {
    return {
      ok:    false,
      error: 'Nothing to send — add some content or fill in at least one embed field first.',
    };
  }

  try {
    const res = await axios.post(`${baseUrl(url)}?wait=true`, clean, { headers: HEADERS });
    return { ok: true, status: res.status, messageId: res.data?.id };
  } catch (e) {
    return formatError(e);
  }
}

/** PATCH — edits an existing webhook message in-place. */
export async function editWebhookMessage(
  webhookUrl: string,
  messageId:  string,
  payload:    WebhookPayload,
): Promise<WebhookResult> {
  if (!messageId?.trim()) {
    return { ok: false, error: 'No message ID provided for edit.' };
  }

  const clean = stripPayload(payload);

  // For edits, an empty payload is valid (it clears content/embeds) — so we
  // don't gate on isPayloadSendable here. Discord accepts empty PATCH bodies.

  try {
    const res = await axios.patch(
      `${baseUrl(webhookUrl)}/messages/${messageId.trim()}`,
      clean,
      { headers: HEADERS },
    );
    return { ok: true, status: res.status };
  } catch (e) {
    return formatError(e);
  }
}

/** DELETE — removes a webhook message. */
export async function deleteWebhookMessage(
  webhookUrl: string,
  messageId:  string,
): Promise<WebhookResult> {
  if (!messageId?.trim()) {
    return { ok: false, error: 'No message ID provided for delete.' };
  }

  try {
    const res = await axios.delete(
      `${baseUrl(webhookUrl)}/messages/${messageId.trim()}`,
    );
    return { ok: true, status: res.status };
  } catch (e) {
    return formatError(e);
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/** Checks whether a URL is a valid Discord webhook URL. */
export function isValidWebhookUrl(url: string): boolean {
  return /^https:\/\/discord(?:app)?\.com\/api\/webhooks\/\d+\/.+$/.test(url.trim());
}

/**
 * Parses a Discord message link and returns channelId + messageId.
 * Accepts: https://discord.com/channels/{guild}/{channel}/{message}
 *       or https://discord.com/channels/@me/{channel}/{message}
 */
export function parseMessageLink(link: string): { channelId: string; messageId: string } | null {
  const m = link.match(/channels\/(?:\d+|@me)\/(\d+)\/(\d+)/);
  if (!m) return null;
  return { channelId: m[1], messageId: m[2] };
}

/** Converts a #rrggbb hex string to a decimal integer for embed color. */
export function hexToDecimal(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

function formatError(e: unknown): WebhookResult {
  const err = e as any;
  const status  = err?.response?.status;
  const discord = err?.response?.data?.message
    ?? err?.response?.data?.errors
    ?? err?.message
    ?? String(e);
  const detail  = typeof discord === 'object' ? JSON.stringify(discord) : String(discord);
  return { ok: false, status, error: `HTTP ${status ?? '?'}: ${detail}` };
}
