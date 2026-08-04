/**
 * modules/tickets/wizard/i18n.ts
 *
 * Thin translation helpers for the ticket-setup wizard. Every wizard string
 * lives under the `twizard` locale namespace (src/locales/<loc>/twizard.json).
 *
 * Two entry points because render functions receive either a sessionId
 * (from which the guild — and thus the locale — is resolved) or a guildId
 * directly:
 *   tw(sessionId, key, vars)  — resolves guild via the wizard session
 *   twg(guildId,  key, vars)  — when the guild id is already in hand
 *
 * Missing keys fall back to en-US automatically (see i18n/index.ts), so a
 * partially-translated fr/ru bundle still renders — just in English for the
 * gaps. en-US is the one bundle that must always be complete.
 */

import { tGuild } from '../../../i18n';
import { getSession } from './session';

type Vars = Record<string, string | number>;

export function twg(guildId: string, key: string, vars?: Vars): string {
  return tGuild(guildId, `twizard.${key}`, vars ? { vars } : {});
}

export function tw(sessionId: string, key: string, vars?: Vars): string {
  const session = getSession(sessionId);
  // If the session vanished mid-render, fall back to a neutral guild-less
  // lookup — it still resolves to en-US, which is fine for the brief window
  // before the "session expired" screen takes over.
  if (!session) return tGuild('0', `twizard.${key}`, vars ? { vars } : {});
  return twg(session.guildId, key, vars);
}
