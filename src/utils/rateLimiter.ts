/**
 * Globales Command Rate-Limiting.
 *
 * Sliding-Window: max. 10 Commands pro User in 10 Sekunden.
 * Prevents bot flood attacks and SQLite overload.
 *
 * NOTE: This is an in-memory store. It resets on process restart/crash.
 * This is intentional — a crash already disrupts service, and persistent
 * rate-limit state would require a Redis dependency. The window is short
 * (10s) so the attack surface from a reset is minimal. For production
 * deployments with multiple replicas, replace with a Redis-backed limiter.
 */

interface WindowEntry {
  count:       number;
  windowStart: number;
}

const store      = new Map<string, WindowEntry>();
const WINDOW_MS  = 10_000;
const MAX_CALLS  = 10;

// Cleanup of old entries every 5 minutes — prevents memory leak
setInterval(() => {
  const cutoff = Date.now() - WINDOW_MS;
  for (const [key, entry] of store) {
    if (entry.windowStart < cutoff) store.delete(key);
  }
}, 5 * 60_000);

export function isRateLimited(userId: string, guildId: string): boolean {
  const key   = `${guildId}:${userId}`;
  const now   = Date.now();
  const entry = store.get(key);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    store.set(key, { count: 1, windowStart: now });
    return false;
  }

  entry.count++;
  return entry.count > MAX_CALLS;
}
