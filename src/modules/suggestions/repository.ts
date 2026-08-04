/**
 * modules/suggestions/repository.ts
 *
 * Pure data-access layer for the /suggest feature. Same shape as
 * staffActivity/repository.ts — no Discord.js imports here on purpose.
 */

import db, { getGuild, setGuildValue } from '../../database/db';

export interface SuggestionsConfig {
  enabled: boolean;
  channel: string | null;
  viewerRole: string | null;
  /** Role allowed to vote (👍/👎). null = everyone may vote. */
  voteRole: string | null;
  anonymous: boolean;
}

/** Reads suggestions config for a guild (creates the guild row if missing). */
export function getConfig(guildId: string): SuggestionsConfig {
  const g = getGuild(guildId) as {
    suggestions_enabled: number;
    suggestions_channel: string | null;
    suggestions_viewer_role: string | null;
    suggestions_vote_role: string | null;
    suggestions_anonymous: number;
  };
  return {
    enabled:    !!g.suggestions_enabled,
    channel:    g.suggestions_channel ?? null,
    viewerRole: g.suggestions_viewer_role ?? null,
    voteRole:   g.suggestions_vote_role ?? null,
    anonymous:  !!g.suggestions_anonymous,
  };
}

/** Generic setter re-exported for /suggest config. */
export function setConfigValue(
  guildId: string,
  key: 'suggestions_enabled' | 'suggestions_channel' | 'suggestions_viewer_role' | 'suggestions_vote_role' | 'suggestions_anonymous',
  value: unknown,
): void {
  setGuildValue(guildId, key, value);
}

export type SuggestionStatus = 'pending' | 'approved' | 'denied';

export interface Suggestion {
  id: number;
  guild_id: string;
  author_id: string;
  content: string;
  message_id: string | null;
  status: SuggestionStatus;
  decided_by: string | null;
  decision_reason: string | null;
  upvotes: number;
  downvotes: number;
  created_at: number;
  decided_at: number | null;
}

/** Creates a new suggestion row. message_id is filled in afterwards via setSuggestionMessageId() — the message can only be sent AFTER we have an id to put in its buttons' custom IDs. */
export function createSuggestion(guildId: string, authorId: string, content: string): number {
  const res = db.prepare(
    'INSERT INTO suggestions (guild_id, author_id, content) VALUES (?, ?, ?)',
  ).run(guildId, authorId, content);
  return Number(res.lastInsertRowid);
}

export function setSuggestionMessageId(id: number, messageId: string): void {
  db.prepare('UPDATE suggestions SET message_id = ? WHERE id = ?').run(messageId, id);
}

export function getSuggestion(id: number): Suggestion | undefined {
  return db.prepare('SELECT * FROM suggestions WHERE id = ?').get(id) as Suggestion | undefined;
}

export type VoteType = 'up' | 'down';

/**
 * Registers (or changes) one user's vote on a suggestion.
 *
 * A user can only ever have ONE vote per suggestion — enforced by
 * suggestion_votes' PRIMARY KEY (suggestion_id, user_id), not just by
 * disabling the button client-side, since Discord lets the same button be
 * clicked from multiple devices/clients before any of them see an update.
 * INSERT OR REPLACE flips an existing up→down or down→up vote instead of
 * stacking a second row; suggestions.upvotes/downvotes are then recomputed
 * from the vote rows inside the same transaction, so the counters can never
 * drift out of sync with what's actually in suggestion_votes.
 */
export function setVote(suggestionId: number, userId: string, voteType: VoteType): { ok: boolean; reason?: 'not_found' | 'decided' } {
  const suggestion = getSuggestion(suggestionId);
  if (!suggestion) return { ok: false, reason: 'not_found' };
  if (suggestion.status !== 'pending') return { ok: false, reason: 'decided' };

  const tx = db.transaction(() => {
    db.prepare(
      'INSERT OR REPLACE INTO suggestion_votes (suggestion_id, user_id, vote_type) VALUES (?, ?, ?)',
    ).run(suggestionId, userId, voteType);

    const counts = db.prepare(`
      SELECT
        SUM(CASE WHEN vote_type = 'up'   THEN 1 ELSE 0 END) AS up,
        SUM(CASE WHEN vote_type = 'down' THEN 1 ELSE 0 END) AS down
      FROM suggestion_votes WHERE suggestion_id = ?
    `).get(suggestionId) as { up: number | null; down: number | null };

    db.prepare('UPDATE suggestions SET upvotes = ?, downvotes = ? WHERE id = ?')
      .run(counts.up ?? 0, counts.down ?? 0, suggestionId);
  });
  tx();

  return { ok: true };
}

export function decideSuggestion(id: number, decidedBy: string, status: 'approved' | 'denied', reason: string | null): void {
  db.prepare(
    'UPDATE suggestions SET status = ?, decided_by = ?, decision_reason = ?, decided_at = unixepoch() WHERE id = ?',
  ).run(status, decidedBy, reason, id);
}

/** Pending suggestions for a guild, newest first — for /suggest list. */
export function listPending(guildId: string, limit = 10): Suggestion[] {
  return db.prepare(
    "SELECT * FROM suggestions WHERE guild_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT ?",
  ).all(guildId, limit) as Suggestion[];
}
