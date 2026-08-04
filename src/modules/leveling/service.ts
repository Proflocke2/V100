/**
 * LEVELING — shared XP-grant and level-up-announce logic.
 *
 * Extracted out of events/messageCreate.ts so that voice-XP
 * (modules/voiceXp/service.ts) produces byte-for-byte identical level-up
 * behavior (role grant + announcement) as chat-XP, instead of duplicating
 * ~20 lines in two places that could quietly drift apart over time — the
 * exact kind of duplication this codebase has already been bitten by once
 * (wizardKit navRow() defaults, see HANDOVER.md).
 */

import { Guild, GuildMember, TextChannel } from 'discord.js';
import db, { getUser } from '../../database/db';
import { xpForLevel, levelFromXp } from '../../utils/helpers';
import { getLocalized, Language } from '../../utils/localization';

export interface XpGrantResult {
  oldLevel: number;
  newLevel: number;
  newXp: number;
  leveledUp: boolean;
}

/**
 * Adds xp to a user and persists the recalculated level. Does NOT touch
 * `messages` / `last_xp` — those are message-specific bookkeeping the
 * chat-XP cooldown gate in messageCreate.ts owns separately; voice-XP has
 * no equivalent fields to update.
 */
export function grantXp(userId: string, guildId: string, xpAmount: number): XpGrantResult {
  const user     = getUser(userId, guildId);
  const newXp    = user.xp + xpAmount;
  const oldLevel = user.level;
  const newLevel = levelFromXp(newXp);

  // Seasonal XP — only accumulate if seasonal is enabled for this guild.
  const guildRow = db.prepare('SELECT seasonal_enabled FROM guilds WHERE id = ?').get(guildId) as { seasonal_enabled: number } | undefined;
  const seasonalEnabled = guildRow?.seasonal_enabled;
  const newSeasonalXp    = (user.seasonal_xp ?? 0) + xpAmount;
  const newSeasonalLevel = levelFromXp(newSeasonalXp);

  if (seasonalEnabled) {
    db.prepare('UPDATE users SET xp = ?, level = ?, seasonal_xp = ?, seasonal_level = ? WHERE id = ? AND guild_id = ?').run(newXp, newLevel, newSeasonalXp, newSeasonalLevel, userId, guildId);
  } else {
    db.prepare('UPDATE users SET xp = ?, level = ? WHERE id = ? AND guild_id = ?').run(newXp, newLevel, userId, guildId);
  }

  return { oldLevel, newLevel, newXp, leveledUp: newLevel > oldLevel };
}

export interface LevelGuildRow {
  level_roles: string;
  level_channel: string | null;
}

/**
 * Assigns any configured level-role and posts the level-up announcement.
 * `fallbackChannel` is used only if the guild has no dedicated level_channel
 * configured — chat-XP passes the channel the triggering message was sent
 * in; voice-XP has no natural fallback channel, so it's omitted there and
 * the announcement is simply skipped if level_channel also isn't set.
 */
export async function announceLevelUp(
  guild: Guild,
  member: GuildMember | null,
  guildRow: LevelGuildRow,
  lang: Language,
  newLevel: number,
  newXp: number,
  fallbackChannel?: TextChannel,
): Promise<void> {
  const levelRoles: Record<string, string> = JSON.parse(guildRow.level_roles || '{}');
  if (levelRoles[String(newLevel)] && member) {
    member.roles.add(levelRoles[String(newLevel)]).catch(() => {});
  }

  const levelChannel = guildRow.level_channel
    ? guild.channels.cache.get(guildRow.level_channel)
    : null;
  const target = levelChannel?.isTextBased() ? levelChannel : fallbackChannel;
  if (!target || !('send' in target)) return;

  const xpNeeded = xpForLevel(newLevel + 1);
  const msg = getLocalized('level.levelup', lang, {
    user:   member ? member.toString() : '',
    level:  String(newLevel),
    xp:     String(newXp),
    needed: String(xpNeeded),
  });
  await (target as TextChannel).send({ content: msg }).catch(() => {});
}
