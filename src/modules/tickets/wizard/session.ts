/**
 * modules/tickets/wizard/session.ts
 *
 * Shared in-memory session state for the whole /ticket setup wizard.
 * One session per (admin) user who ran /ticket setup — keyed by a short
 * random id embedded in every component's customId (`tw:<sessionId>:...`).
 * Sessions expire after 15 minutes of inactivity; this is a click-through
 * admin tool, not something meant to stay open for hours.
 */

export interface WizardSession {
  guildId: string;
  userId: string;
  lastTouched: number;
  /** Scratch space for whatever the current sub-flow needs to remember between steps (a panel being edited, a partially-built category, etc). Intentionally loose — each section owns its own keys. */
  data: Record<string, unknown>;
}

const sessions = new Map<string, WizardSession>();
const SESSION_TTL_MS = 15 * 60 * 1000;

function newSessionId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function sweep(): void {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.lastTouched > SESSION_TTL_MS) sessions.delete(id);
  }
}

export function createSession(guildId: string, userId: string): string {
  sweep();
  const id = newSessionId();
  sessions.set(id, { guildId, userId, lastTouched: Date.now(), data: {} });
  return id;
}

export function getSession(sessionId: string): WizardSession | undefined {
  return sessions.get(sessionId);
}

export function touchSession(sessionId: string): void {
  const s = sessions.get(sessionId);
  if (s) s.lastTouched = Date.now();
}

export function endSession(sessionId: string): void {
  sessions.delete(sessionId);
}

/** Parses `tw:<sessionId>:<section>:<action>:<...args>` into its parts. */
export function parseCustomId(customId: string): { sessionId: string; section: string; action: string; args: string[] } {
  const [, sessionId, section, action, ...args] = customId.split(':');
  return { sessionId, section: section ?? '', action: action ?? '', args };
}

export function buildCustomId(sessionId: string, section: string, action: string, ...args: (string | number)[]): string {
  return ['tw', sessionId, section, action, ...args].join(':');
}
