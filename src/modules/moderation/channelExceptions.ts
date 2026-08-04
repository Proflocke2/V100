/**
 * modules/moderation/channelExceptions.ts
 *
 * Per-channel opt-outs for specific automod/security checks — e.g. a
 * channel where the server explicitly allows spamming. Shared by all THREE
 * message-scanning systems this project has accumulated (legacy automod in
 * events/messageCreate.ts, automod3Handler.ts, and securityEngine.ts), via
 * a canonical feature name — turning off 'antispam' for a channel silences
 * spam detection in whichever of the three actually run there, without the
 * admin needing to know there are three separate systems under the hood.
 */

import db from '../../database/db';

/**
 * Canonical feature names. Each of the three scanners maps its own
 * feature flag (automod_antispam / feat_antispam / automod3's spam check,
 * etc.) onto ONE of these before checking the exception table, so a single
 * per-channel toggle covers every system that implements that behavior.
 */
export const EXEMPTABLE_FEATURES = [
  'antispam', 'antilink', 'antiinvite', 'anticaps', 'badwords',
  'regex', 'massping', 'phishing',
] as const;
export type ExemptableFeature = typeof EXEMPTABLE_FEATURES[number];

export const FEATURE_LABELS: Record<ExemptableFeature, string> = {
  antispam:   '🚫 Anti-Spam',
  antilink:   '🔗 Anti-Link',
  antiinvite: '📨 Anti-Invite',
  anticaps:   '🔠 Anti-Caps',
  badwords:   '🤐 Wortfilter',
  regex:      '🔍 Regex-Filter',
  massping:   '🔔 Mass-Ping-Guard',
  phishing:   '🎣 Phishing-Filter',
};

/** True if `feature` is switched off for this specific channel. Checked on every message in the hot path — indexed on (guild_id, channel_id), cheap. */
export function isChannelExempt(guildId: string, channelId: string, feature: ExemptableFeature): boolean {
  const row = db.prepare(
    'SELECT 1 FROM automod_channel_exceptions WHERE guild_id = ? AND channel_id = ? AND feature = ?',
  ).get(guildId, channelId, feature);
  return !!row;
}

export function setChannelException(guildId: string, channelId: string, feature: ExemptableFeature, exempt: boolean): void {
  if (exempt) {
    db.prepare('INSERT OR IGNORE INTO automod_channel_exceptions (guild_id, channel_id, feature) VALUES (?, ?, ?)').run(guildId, channelId, feature);
  } else {
    db.prepare('DELETE FROM automod_channel_exceptions WHERE guild_id = ? AND channel_id = ? AND feature = ?').run(guildId, channelId, feature);
  }
}

/** All exempted features for one channel — used to pre-fill the management UI. */
export function getChannelExceptions(guildId: string, channelId: string): ExemptableFeature[] {
  const rows = db.prepare(
    'SELECT feature FROM automod_channel_exceptions WHERE guild_id = ? AND channel_id = ?',
  ).all(guildId, channelId) as { feature: string }[];
  return rows.map(r => r.feature) as ExemptableFeature[];
}

/** Every channel in the guild that has at least one exception — used for the overview list. */
export function listExemptChannels(guildId: string): Array<{ channel_id: string; features: ExemptableFeature[] }> {
  const rows = db.prepare(
    'SELECT channel_id, feature FROM automod_channel_exceptions WHERE guild_id = ? ORDER BY channel_id',
  ).all(guildId) as { channel_id: string; feature: string }[];

  const byChannel = new Map<string, ExemptableFeature[]>();
  for (const r of rows) {
    const list = byChannel.get(r.channel_id) ?? [];
    list.push(r.feature as ExemptableFeature);
    byChannel.set(r.channel_id, list);
  }
  return [...byChannel.entries()].map(([channel_id, features]) => ({ channel_id, features }));
}
