/**
 * src/ui/session.ts
 *
 * In-memory state for an open wizard.
 *
 * Sessions are per-message, per-user and short-lived. They hold the navigation
 * position plus whatever parameters the user has filled in so far — never
 * anything security-relevant: permissions are re-resolved from the database on
 * every single interaction, so a stale session cannot outlive a role change.
 *
 * The store is capped and swept so a bot on 100+ guilds cannot leak memory on a
 * small host.
 */

import { AccessLevel } from './permissions';
import { HubId } from './placement';

export type OptionValue =
  | { kind: 'text'; raw: string }
  | { kind: 'number'; raw: number }
  | { kind: 'boolean'; raw: boolean }
  | { kind: 'user'; id: string }
  | { kind: 'role'; id: string }
  | { kind: 'channel'; id: string }
  | { kind: 'mentionable'; id: string; isRole: boolean };

export type UiView =
  | 'hub'
  | 'category'
  | 'leaf'
  | 'perm-home'
  | 'perm-level'
  | 'perm-list'
  | 'perm-node';

export interface UiSession {
  id: string;
  hub: HubId;
  guildId: string;
  userId: string;
  view: UiView;
  /** Index into the hub's category array. */
  categoryIndex: number;
  /** Key of the active catalog leaf. */
  leafKey?: string;
  page: number;
  values: Map<string, OptionValue>;
  /** Name of the parameter whose collector row is currently rendered. */
  activeOption?: string;
  /** Last validation problem, surfaced in the entry view. */
  notice?: string;
  /** Permission editor scratch space. */
  permLevel?: AccessLevel;
  permNode?: string;
  permPage: number;
  createdAt: number;
  lastTouched: number;
}

const TTL_MS = 15 * 60 * 1000;
const MAX_SESSIONS = 2000;

const sessions = new Map<string, UiSession>();

function sweep(): void {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastTouched > TTL_MS) sessions.delete(id);
  }
  // Hard cap: drop the oldest entries if a burst outruns the TTL sweep.
  if (sessions.size > MAX_SESSIONS) {
    const ordered = [...sessions.entries()].sort((a, b) => a[1].lastTouched - b[1].lastTouched);
    for (const [id] of ordered.slice(0, sessions.size - MAX_SESSIONS)) sessions.delete(id);
  }
}

function newId(): string {
  let id: string;
  do {
    id = Math.random().toString(36).slice(2, 10);
  } while (sessions.has(id));
  return id;
}

export function createSession(hub: HubId, guildId: string, userId: string): UiSession {
  sweep();
  const now = Date.now();
  const session: UiSession = {
    id: newId(),
    hub,
    guildId,
    userId,
    view: 'hub',
    categoryIndex: 0,
    page: 0,
    values: new Map(),
    permPage: 0,
    createdAt: now,
    lastTouched: now,
  };
  sessions.set(session.id, session);
  return session;
}

export function getSession(id: string): UiSession | undefined {
  const session = sessions.get(id);
  if (!session) return undefined;
  if (Date.now() - session.lastTouched > TTL_MS) {
    sessions.delete(id);
    return undefined;
  }
  session.lastTouched = Date.now();
  return session;
}

export function endSession(id: string): void {
  sessions.delete(id);
}

/** Clears collected parameters — used when switching entries or on reset. */
export function resetValues(session: UiSession): void {
  session.values.clear();
  session.activeOption = undefined;
  session.notice = undefined;
}

export function sessionCount(): number {
  return sessions.size;
}
