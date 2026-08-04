/**
 * ANTI-RAID — Join-Spike-Schutz.
 */

import { Guild, GuildMember, TextChannel, EmbedBuilder } from 'discord.js';
import db from '../../database/db';

db.exec(`
  CREATE TABLE IF NOT EXISTS anti_raid_config (
    guild_id          TEXT PRIMARY KEY,
    enabled           INTEGER DEFAULT 0,
    threshold         INTEGER DEFAULT 10,
    window_seconds    INTEGER DEFAULT 10,
    action            TEXT    DEFAULT 'kick',
    min_age_minutes   INTEGER DEFAULT 0,
    log_channel_id    TEXT
  );
`);

export interface AntiRaidConfig {
  guild_id:        string;
  enabled:         number;
  threshold:       number;
  window_seconds:  number;
  action:          'kick' | 'ban' | 'timeout' | 'lockdown';
  min_age_minutes: number;
  log_channel_id:  string | null;
}

const joinLog       = new Map<string, number[]>();
const lockdownState = new Map<string, boolean>();

export function getAntiRaidConfig(guildId: string): AntiRaidConfig {
  let row = db.prepare('SELECT * FROM anti_raid_config WHERE guild_id = ?').get(guildId) as AntiRaidConfig | undefined;
  if (!row) {
    db.prepare('INSERT INTO anti_raid_config (guild_id) VALUES (?)').run(guildId);
    row = db.prepare('SELECT * FROM anti_raid_config WHERE guild_id = ?').get(guildId) as AntiRaidConfig;
  }
  return row;
}

const ANTI_RAID_ALLOWED_KEYS = new Set<string>(['enabled','threshold','window_seconds','action','min_age_minutes','log_channel_id']);

export function updateAntiRaidConfig(guildId: string, patch: Partial<AntiRaidConfig>): void {
  getAntiRaidConfig(guildId);
  const keys = Object.keys(patch).filter(k => k !== 'guild_id' && ANTI_RAID_ALLOWED_KEYS.has(k));
  if (keys.length === 0) return;
  const sets = keys.map(k => `${k} = ?`).join(', ');
  const vals = keys.map(k => (patch as Record<string, unknown>)[k] ?? null);
  db.prepare(`UPDATE anti_raid_config SET ${sets} WHERE guild_id = ?`).run(...vals, guildId);
}

export function isLockdownActive(guildId: string): boolean {
  return lockdownState.get(guildId) ?? false;
}

export async function handleMemberJoinAntiRaid(member: GuildMember): Promise<void> {
  const config = getAntiRaidConfig(member.guild.id);
  if (!config.enabled) return;

  const gid = member.guild.id;
  const now = Date.now();

  // Account age gate
  if (config.min_age_minutes > 0) {
    const ageMs = now - member.user.createdTimestamp;
    if (ageMs < config.min_age_minutes * 60 * 1000) {
      await executeMemberAction(member, config, 'Account too new (anti-raid age gate)');
      await logRaidEvent(member.guild, config,
        `🔰 Age gate: ${member.user.tag} — account age ${Math.floor(ageMs / 60000)}min < required ${config.min_age_minutes}min`,
      );
      return;
    }
  }

  // Join spike detection
  const joins = (joinLog.get(gid) ?? []).filter(t => now - t < config.window_seconds * 1000);
  joins.push(now);
  joinLog.set(gid, joins);

  if (joins.length >= config.threshold) {
    if (!lockdownState.get(gid)) {
      lockdownState.set(gid, true);
      await logRaidEvent(member.guild, config,
        `🚨 **RAID DETECTED** — ${joins.length} joins in ${config.window_seconds}s\nAction: **${config.action}**`,
      );
      // Auto-lift lockdown after 5 minutes
      setTimeout(() => { lockdownState.set(gid, false); joinLog.set(gid, []); }, 5 * 60 * 1000);
    }
    await executeMemberAction(member, config, 'Anti-raid: join spike detected');
  }
}

async function executeMemberAction(member: GuildMember, config: AntiRaidConfig, reason: string): Promise<void> {
  switch (config.action) {
    case 'kick':    await member.kick(reason).catch(() => {}); break;
    case 'ban':     await member.ban({ reason, deleteMessageSeconds: 86400 }).catch(() => {}); break;
    case 'timeout': await member.timeout(10 * 60 * 1000, reason).catch(() => {}); break;
    case 'lockdown': break; // Log only
  }
}

async function logRaidEvent(guild: Guild, config: AntiRaidConfig, message: string): Promise<void> {
  if (!config.log_channel_id) return;
  const ch = guild.channels.cache.get(config.log_channel_id) as TextChannel | undefined;
  if (!ch) return;
  await ch.send({
    embeds: [new EmbedBuilder().setTitle('🛡️ Anti-Raid Alert').setDescription(message).setColor('#ed4245').setTimestamp()],
  }).catch(() => {});
}
