/**
 * ANTI-NUKE — protection against compromised staff accounts.
 *
 * Monitors audit-log events in real time:
 *   • Mass channel deletions
 *   • Mass role deletions
 *   • Mass bans by a single moderator
 *   • Mass webhook creation
 *   • Permission escalation (a user grants themselves admin)
 *
 * When a threshold is exceeded:
 *   1. The attacker's account is banned immediately
 *   2. All of the attacker's roles are stripped (before the ban)
 *   3. Alert posted to the configured log channel
 *   4. Action is logged and visible in /antinuke status
 *
 * Whitelisted admins (via /antinuke whitelist) are exempt.
 */

import {
  Client, Guild, GuildAuditLogsEntry, AuditLogEvent,
  TextChannel, EmbedBuilder, GuildMember,
} from 'discord.js';
import db, { logModAction, ModAction } from '../../database/db';

// ── Schema ─────────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS antinuke_config (
    guild_id          TEXT PRIMARY KEY,
    enabled           INTEGER DEFAULT 0,
    log_channel_id    TEXT,
    channel_delete_limit  INTEGER DEFAULT 3,
    role_delete_limit     INTEGER DEFAULT 3,
    ban_limit             INTEGER DEFAULT 5,
    webhook_limit         INTEGER DEFAULT 5,
    window_seconds        INTEGER DEFAULT 10,
    action            TEXT DEFAULT 'ban'
  );

  CREATE TABLE IF NOT EXISTS antinuke_whitelist (
    guild_id  TEXT NOT NULL,
    user_id   TEXT NOT NULL,
    added_by  TEXT NOT NULL,
    added_at  INTEGER DEFAULT (unixepoch()),
    PRIMARY KEY (guild_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS antinuke_incidents (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id    TEXT NOT NULL,
    attacker_id TEXT NOT NULL,
    event_type  TEXT NOT NULL,
    count       INTEGER NOT NULL,
    action_taken TEXT NOT NULL,
    created_at  INTEGER DEFAULT (unixepoch())
  );
`);

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AntiNukeConfig {
  guild_id: string;
  enabled: number;
  log_channel_id: string | null;
  channel_delete_limit: number;
  role_delete_limit: number;
  ban_limit: number;
  webhook_limit: number;
  window_seconds: number;
  action: 'ban' | 'kick' | 'strip';
}

export interface AntiNukeIncident {
  id: number;
  guild_id: string;
  attacker_id: string;
  event_type: string;
  count: number;
  action_taken: string;
  created_at: number;
}

// ── Config helpers ─────────────────────────────────────────────────────────────

export function getAntiNukeConfig(guildId: string): AntiNukeConfig {
  let row = db.prepare('SELECT * FROM antinuke_config WHERE guild_id = ?').get(guildId) as AntiNukeConfig | undefined;
  if (!row) {
    db.prepare('INSERT INTO antinuke_config (guild_id) VALUES (?)').run(guildId);
    row = db.prepare('SELECT * FROM antinuke_config WHERE guild_id = ?').get(guildId) as AntiNukeConfig;
  }
  return row;
}

const ANTI_NUKE_ALLOWED_KEYS = new Set<string>(['enabled','log_channel_id','channel_delete_limit','role_delete_limit','ban_limit','webhook_limit','window_seconds','action']);

export function updateAntiNukeConfig(guildId: string, patch: Partial<AntiNukeConfig>): void {
  getAntiNukeConfig(guildId);
  const keys = Object.keys(patch).filter(k => k !== 'guild_id' && ANTI_NUKE_ALLOWED_KEYS.has(k));
  if (!keys.length) return;
  const sets = keys.map(k => `${k} = ?`).join(', ');
  const vals = keys.map(k => (patch as Record<string, unknown>)[k] ?? null);
  db.prepare(`UPDATE antinuke_config SET ${sets} WHERE guild_id = ?`).run(...vals, guildId);
}

// ── Whitelist helpers ──────────────────────────────────────────────────────────

export function isWhitelisted(guildId: string, userId: string): boolean {
  return !!db.prepare('SELECT 1 FROM antinuke_whitelist WHERE guild_id = ? AND user_id = ?').get(guildId, userId);
}

export function addToWhitelist(guildId: string, userId: string, addedBy: string): void {
  db.prepare('INSERT OR IGNORE INTO antinuke_whitelist (guild_id, user_id, added_by) VALUES (?, ?, ?)').run(guildId, userId, addedBy);
}

export function removeFromWhitelist(guildId: string, userId: string): void {
  db.prepare('DELETE FROM antinuke_whitelist WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
}

export function getWhitelist(guildId: string): { user_id: string; added_by: string; added_at: number }[] {
  return db.prepare('SELECT user_id, added_by, added_at FROM antinuke_whitelist WHERE guild_id = ?').all(guildId) as any[];
}

export function getIncidents(guildId: string, limit = 10): AntiNukeIncident[] {
  return db.prepare('SELECT * FROM antinuke_incidents WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?').all(guildId, limit) as AntiNukeIncident[];
}

// ── Action tracking (sliding window per user per event type) ──────────────────

interface ActionEntry { count: number; times: number[] }
// Map: `guildId:userId:eventType` → entries
const actionLog = new Map<string, ActionEntry>();

// Cleanup stale entries every 30s
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of actionLog.entries()) {
    entry.times = entry.times.filter(t => now - t < 60_000);
    if (!entry.times.length) actionLog.delete(key);
    else entry.count = entry.times.length;
  }
}, 30_000);

function trackAction(guildId: string, userId: string, eventType: string, windowSeconds: number): number {
  const key = `${guildId}:${userId}:${eventType}`;
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const entry = actionLog.get(key) ?? { count: 0, times: [] };
  entry.times = entry.times.filter(t => now - t < windowMs);
  entry.times.push(now);
  entry.count = entry.times.length;
  actionLog.set(key, entry);
  return entry.count;
}

// ── Neutralize attacker ────────────────────────────────────────────────────────

async function neutralize(
  guild: Guild,
  attackerId: string,
  config: AntiNukeConfig,
  eventType: string,
  count: number,
): Promise<void> {
  // Don't act on the bot itself
  if (attackerId === guild.client.user?.id) return;

  let member: GuildMember | null = null;
  try { member = await guild.members.fetch(attackerId); } catch { /* already left */ }

  let actionTaken = 'none';

  try {
    if (config.action === 'strip' || config.action === 'kick' || config.action === 'ban') {
      // Strip all roles first (fastest way to stop damage)
      if (member) {
        const manageable = member.roles.cache.filter(r => r.id !== guild.id && r.managed === false);
        for (const [, role] of manageable) {
          await member.roles.remove(role, `[Anti-Nuke] ${eventType} — roles stripped`).catch(() => {});
        }
        actionTaken = 'roles stripped';
      }
    }
    if (config.action === 'kick' && member?.kickable) {
      await member.kick(`[Anti-Nuke] ${eventType}`);
      actionTaken = 'kicked';
    }
    if (config.action === 'ban') {
      await guild.members.ban(attackerId, { reason: `[Anti-Nuke] ${eventType}`, deleteMessageSeconds: 0 });
      actionTaken = 'banned';
    }
  } catch (err) {
    console.error('[AntiNuke] neutralize error:', err);
    actionTaken = 'failed';
  }

  // Log incident to DB
  db.prepare('INSERT INTO antinuke_incidents (guild_id, attacker_id, event_type, count, action_taken) VALUES (?, ?, ?, ?, ?)')
    .run(guild.id, attackerId, eventType, count, actionTaken);

  // Mirror into the shared mod-case system (mod_history) so an Anti-Nuke
  // ban/kick shows up in /records case and /history, not just
  // /antinuke incidents — same reasoning as the Security Engine wiring.
  // 'roles stripped'/'none'/'failed' don't map to a real mod action, so
  // those are left out; only an actual kick or ban gets a case.
  const botId = guild.client.user?.id;
  if (botId) {
    let modAction: ModAction | null = null;
    if (actionTaken === 'banned') modAction = 'ban';
    else if (actionTaken === 'kicked') modAction = 'kick';
    if (modAction) {
      logModAction(guild.id, attackerId, botId, modAction, `[Anti-Nuke] ${eventType} (${count}x in ${config.window_seconds}s)`);
    }
  }

  // Send alert
  if (config.log_channel_id) {
    const ch = guild.channels.cache.get(config.log_channel_id) as TextChannel | undefined;
    if (ch) {
      const embed = new EmbedBuilder()
        .setColor('#ed4245')
        .setTitle('🚨 Anti-Nuke — Intervention!')
        .addFields(
          { name: '⚠️ Angreifer',    value: `<@${attackerId}> (\`${attackerId}\`)`, inline: true },
          { name: '📌 Trigger',      value: eventType, inline: true },
          { name: '🔢 Count',        value: `${count}x in ${config.window_seconds}s`, inline: true },
          { name: '⚡ Action',       value: actionTaken, inline: true },
        )
        .setTimestamp()
        .setFooter({ text: 'Check /antinuke incidents for the full list' });
      await ch.send({ embeds: [embed] }).catch(() => {});
    }
  }
}

// ── Main audit log handler ─────────────────────────────────────────────────────

export async function handleAntiNukeEvent(
  guild: Guild,
  entry: GuildAuditLogsEntry,
): Promise<void> {
  const config = getAntiNukeConfig(guild.id);
  if (!config.enabled) return;

  const executorId = entry.executor?.id;
  if (!executorId) return;
  if (executorId === guild.client.user?.id) return;
  if (isWhitelisted(guild.id, executorId)) return;

  // Check if executor is bot owner / guild owner
  if (executorId === guild.ownerId) return;

  let eventType: string | null = null;
  let limit: number = 0;

  switch (entry.action) {
    case AuditLogEvent.ChannelDelete:
      eventType = 'channel_delete';
      limit = config.channel_delete_limit;
      break;
    case AuditLogEvent.RoleDelete:
      eventType = 'role_delete';
      limit = config.role_delete_limit;
      break;
    case AuditLogEvent.MemberBanAdd:
      eventType = 'mass_ban';
      limit = config.ban_limit;
      break;
    case AuditLogEvent.WebhookCreate:
      eventType = 'webhook_create';
      limit = config.webhook_limit;
      break;
    case AuditLogEvent.MemberRoleUpdate: {
      // Check if someone gave themselves or another admin perms
      const changes = entry.changes ?? [];
      const addedRoles = changes.find(c => c.key === '$add')?.new as { id: string }[] | undefined;
      if (addedRoles?.length) {
        // Check if any added role has Administrator
        for (const r of addedRoles) {
          const role = guild.roles.cache.get(r.id);
          if (role?.permissions.has('Administrator')) {
            eventType = 'permission_escalation';
            limit = 1; // any single escalation triggers immediately
          }
        }
      }
      break;
    }
    default:
      return;
  }

  if (!eventType) return;

  const count = trackAction(guild.id, executorId, eventType, config.window_seconds);
  if (count >= limit) {
    await neutralize(guild, executorId, config, eventType, count);
  }
}

// ── Register audit log listener on client ─────────────────────────────────────

export function registerAntiNuke(client: Client): void {
  client.on('guildAuditLogEntryCreate', async (entry, guild) => {
    await handleAntiNukeEvent(guild, entry).catch(err =>
      console.error('[AntiNuke] guildAuditLogEntryCreate error:', err)
    );
  });
  console.log('[AntiNuke] Audit-Log-Listener registriert');
}
