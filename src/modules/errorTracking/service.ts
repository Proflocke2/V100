/**
 * modules/errorTracking/service.ts
 *
 * Self-built, DB-based error tracking — deliberately no Sentry/Winston,
 * same "Event → Embed → Discord-Channel" shape as modules/moderation/modLog.ts.
 *
 * Every error gets persisted to error_log (Render's own logs rotate and
 * aren't a reliable long-term record). Errors from CRITICAL_SOURCES
 * additionally get posted live to a configurable Discord channel
 * (bot_config.error_log_channel) — but rate-limited to max 1 post per 60s
 * per exact (source, message) pair, since a systematic failure (e.g. a DB
 * lock hit by many commands at once) could otherwise fire dozens of times a
 * second and flood that channel.
 */

import { Client, EmbedBuilder, TextChannel } from 'discord.js';
import * as Repo from './repository';

/**
 * Sources serious enough to warrant a live Discord alert, not just a silent
 * DB row. Deliberately short — most command/button errors are already
 * visible to the user as "Internal Error" and don't need to page anyone;
 * these are the ones that mean something is actually broken. 'scheduler' is
 * prefix-matched (see isCritical()) so every scheduler:<name> source counts,
 * without having to list each scheduler individually here.
 */
export const CRITICAL_SOURCES = [
  'process:uncaughtException',
  'process:unhandledRejection',
  'scheduler',
] as const;

function isCritical(source: string): boolean {
  return CRITICAL_SOURCES.some(c => source === c || source.startsWith(`${c}:`));
}

// In-memory only — resets on restart, which is fine here: this map's only
// job is to stop a burst of the same (source, message) pair from flooding
// the channel within one process lifetime. It is NOT the durable record —
// that's error_log, which every call still writes to regardless of rate limiting.
interface RateEntry { count: number; lastPosted: number; timer: NodeJS.Timeout | null; }
const rateMap = new Map<string, RateEntry>();
const RATE_WINDOW_MS = 60_000;

let clientRef: Client | null = null;

/** Call once from index.ts (client can be passed before login — we only read from it lazily when an alert actually needs posting). */
export function initErrorTracking(client: Client): void {
  clientRef = client;
}

async function postCriticalAlert(source: string, message: string, occurredDuringWindow: number): Promise<void> {
  if (!clientRef) return;

  try {
    const cfg = Repo.getBotConfig();
    if (!cfg.errorLogChannel || !cfg.errorLogGuild) return;

    const guild = clientRef.guilds.cache.get(cfg.errorLogGuild);
    const channel = guild?.channels.cache.get(cfg.errorLogChannel) as TextChannel | undefined;
    if (!channel || !channel.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setTitle('🚨 Critical Error')
      .setColor('#ed4245')
      .addFields(
        { name: 'Quelle',    value: `\`${source}\``, inline: true },
        { name: 'Message', value: message.slice(0, 1000) },
      )
      .setTimestamp();

    if (occurredDuringWindow > 0) {
      embed.addFields({
        name: 'Frequency',
        value: `This error has occurred **${occurredDuringWindow + 1}** times in the last 60s.`,
      });
    }

    await channel.send({ embeds: [embed] }).catch(() => {});
  } catch {
    // Alerting itself must never throw — see logError()'s own guarantee below.
  }
}

/**
 * Logs an error. NEVER throws — logging must never become a NEW source of
 * crashes, which matters a lot here specifically because this gets called
 * from uncaughtException/unhandledRejection handlers themselves. Falls back
 * to console.error only, if even the DB write fails.
 */
export function logError(source: string, err: unknown, context?: { guildId?: string; userId?: string }): void {
  try {
    const message = err instanceof Error ? err.message : String(err);
    const stack    = err instanceof Error ? (err.stack ?? null) : null;

    try {
      Repo.insertError(source, message, stack, context?.guildId ?? null, context?.userId ?? null);
    } catch (dbErr) {
      console.error('[ErrorTracking] Failed to persist error to error_log:', dbErr);
    }

    if (!isCritical(source)) return;

    const key = `${source}::${message}`;
    const now = Date.now();
    const entry = rateMap.get(key);

    if (!entry || now - entry.lastPosted >= RATE_WINDOW_MS) {
      // First time we've seen this exact (source, message) — or the last
      // window already closed — so post immediately instead of waiting.
      rateMap.set(key, { count: 0, lastPosted: now, timer: null });
      void postCriticalAlert(source, message, 0);
      return;
    }

    // Within the 60s window since the last post — don't post again, just
    // count it. One deferred summary fires once the window closes, so a
    // burst of e.g. 500 identical errors becomes exactly 2 Discord messages
    // (the initial alert + one "occurred Y times" summary), never 500.
    entry.count++;
    if (!entry.timer) {
      const remaining = RATE_WINDOW_MS - (now - entry.lastPosted);
      entry.timer = setTimeout(() => {
        const finalEntry = rateMap.get(key);
        rateMap.delete(key);
        if (finalEntry && finalEntry.count > 0) {
          void postCriticalAlert(source, message, finalEntry.count);
        }
      }, remaining);
    }
  } catch (outerErr) {
    // Absolute last resort — logError() itself must never throw.
    console.error('[ErrorTracking] logError() itself failed:', outerErr);
  }
}

export function getRecentErrors(limit = 20, source?: string) {
  return Repo.getRecentErrors(limit, source);
}

export function getErrorStats(hoursBack = 24) {
  return Repo.getErrorStats(hoursBack);
}
