/**
 * SECURITY ENGINE — Unified fast-path module with full i18n support.
 * All user-facing strings are localized via getLocalized().
 */

import {
  Guild, GuildMember, Message, TextChannel,
  EmbedBuilder, PermissionFlagsBits, ChannelType,
} from 'discord.js';
import db, { logModAction, ModAction } from '../../database/db';
import { getLocalized, Language } from '../../utils/localization';
import { isChannelExempt } from '../moderation/channelExceptions';

// ── Schema ────────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS security_config (
    guild_id              TEXT PRIMARY KEY,
    enabled               INTEGER DEFAULT 1,
    severity              TEXT    DEFAULT 'medium',
    feat_antiraid         INTEGER DEFAULT 1,
    feat_antispam         INTEGER DEFAULT 1,
    feat_linkfilter       INTEGER DEFAULT 0,
    feat_accountage       INTEGER DEFAULT 0,
    feat_antinuke         INTEGER DEFAULT 1,
    feat_antiphing        INTEGER DEFAULT 1,
    feat_masspinggard     INTEGER DEFAULT 1,
    feat_anticaps         INTEGER DEFAULT 0,
    ultra_mode            INTEGER DEFAULT 0,
    ultra_score_threshold INTEGER DEFAULT 60,
    raid_threshold        INTEGER DEFAULT 10,
    raid_window_seconds   INTEGER DEFAULT 10,
    spam_threshold        INTEGER DEFAULT 5,
    spam_window_seconds   INTEGER DEFAULT 3,
    min_account_age_min   INTEGER DEFAULT 0,
    mass_ping_limit       INTEGER DEFAULT 5,
    log_channel_id        TEXT,
    lockdown_whitelist    TEXT    DEFAULT '[]',
    auto_defend           INTEGER DEFAULT 0,
    defend_raid           TEXT    DEFAULT 'lockdown',
    defend_spam           TEXT    DEFAULT 'timeout',
    defend_phishing       TEXT    DEFAULT 'ban',
    defend_mass_ping      TEXT    DEFAULT 'kick',
    defend_link           TEXT    DEFAULT 'warn',
    updated_at            INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS security_lockdown_state (
    guild_id    TEXT NOT NULL,
    channel_id  TEXT NOT NULL,
    locked_at   INTEGER DEFAULT (unixepoch()),
    PRIMARY KEY (guild_id, channel_id)
  );

  CREATE TABLE IF NOT EXISTS security_incidents (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id    TEXT NOT NULL,
    type        TEXT NOT NULL,
    target_id   TEXT,
    action      TEXT NOT NULL,
    detail      TEXT,
    ts          INTEGER DEFAULT (unixepoch())
  );
`);

// Runtime schema migration — add new columns to existing DBs
for (const col of [
  "ALTER TABLE security_config ADD COLUMN ultra_mode INTEGER DEFAULT 0",
  "ALTER TABLE security_config ADD COLUMN ultra_score_threshold INTEGER DEFAULT 60",
  "ALTER TABLE security_config ADD COLUMN auto_defend INTEGER DEFAULT 0",
  "ALTER TABLE security_config ADD COLUMN defend_raid TEXT DEFAULT 'lockdown'",
  "ALTER TABLE security_config ADD COLUMN defend_spam TEXT DEFAULT 'timeout'",
  "ALTER TABLE security_config ADD COLUMN defend_phishing TEXT DEFAULT 'ban'",
  "ALTER TABLE security_config ADD COLUMN defend_mass_ping TEXT DEFAULT 'kick'",
  "ALTER TABLE security_config ADD COLUMN defend_link TEXT DEFAULT 'warn'",
]) {
  try { db.exec(col); } catch { /* column already exists */ }
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type Severity = 'low' | 'medium' | 'high';

export interface SecurityConfig {
  guild_id:             string;
  enabled:              number;
  severity:             Severity;
  feat_antiraid:        number;
  feat_antispam:        number;
  feat_linkfilter:      number;
  feat_accountage:      number;
  feat_antinuke:        number;
  feat_antiphing:       number;
  feat_masspinggard:    number;
  feat_anticaps:        number;
  ultra_mode:           number;
  ultra_score_threshold: number;
  raid_threshold:       number;
  raid_window_seconds:  number;
  spam_threshold:       number;
  spam_window_seconds:  number;
  min_account_age_min:  number;
  mass_ping_limit:      number;
  log_channel_id:       string | null;
  lockdown_whitelist:   string;
  // Auto-defend
  auto_defend:          number;
  defend_raid:          string;
  defend_spam:          string;
  defend_phishing:      string;
  defend_mass_ping:     string;
  defend_link:          string;
}

// ── Guild language helper ─────────────────────────────────────────────────────

function getGuildLang(guildId: string): Language {
  try {
    const row = db.prepare('SELECT language FROM guilds WHERE id = ?').get(guildId) as { language?: string } | undefined;
    return (row?.language || 'en') as Language;
  } catch { return 'en'; }
}

// ── Config cache ──────────────────────────────────────────────────────────────

const configCache = new Map<string, SecurityConfig>();

export function getSecurityConfig(guildId: string): SecurityConfig {
  if (configCache.has(guildId)) return configCache.get(guildId)!;
  let row = db.prepare('SELECT * FROM security_config WHERE guild_id = ?').get(guildId) as SecurityConfig | undefined;
  if (!row) {
    db.prepare('INSERT INTO security_config (guild_id) VALUES (?)').run(guildId);
    row = db.prepare('SELECT * FROM security_config WHERE guild_id = ?').get(guildId) as SecurityConfig;
  }
  configCache.set(guildId, row);
  return row;
}

const SECURITY_ALLOWED_KEYS = new Set<string>(['enabled','severity','feat_antiraid','feat_antispam','feat_linkfilter','feat_accountage','feat_antinuke','feat_antiphing','feat_masspinggard','feat_anticaps','ultra_mode','ultra_score_threshold','raid_threshold','raid_window_seconds','spam_threshold','spam_window_seconds','min_account_age_min','mass_ping_limit','log_channel_id','lockdown_whitelist','auto_defend','defend_raid','defend_spam','defend_phishing','defend_mass_ping','defend_link']);

export function updateSecurityConfig(guildId: string, patch: Partial<SecurityConfig>): void {
  getSecurityConfig(guildId);
  const keys = Object.keys(patch).filter(k => k !== 'guild_id' && SECURITY_ALLOWED_KEYS.has(k));
  if (!keys.length) return;
  const sets = keys.map(k => `${k} = ?`).join(', ');
  const vals = keys.map(k => (patch as Record<string, unknown>)[k] ?? null);
  db.prepare(`UPDATE security_config SET ${sets}, updated_at = unixepoch() WHERE guild_id = ?`).run(...vals, guildId);
  configCache.delete(guildId);
}

// ── Hot-path state ────────────────────────────────────────────────────────────

const joinWindows    = new Map<string, number[]>();
const spamWindows    = new Map<string, number[]>();
const lockdownActive = new Map<string, NodeJS.Timeout>();

// ── Ultra-mode state ──────────────────────────────────────────────────────────
/** guilds where ultra-mode is currently active */
const ultraModeActive = new Map<string, { activatedAt: number; activatedBy: string }>();

/** recent message content fingerprints for coordinated-spam detection: guildId → hash[] */
const contentHashes  = new Map<string, number[]>();
/** member score cache: guildId:userId → risk score 0–100 */
const scoreCache     = new Map<string, number>();

export function resetJoinWindows(): void { joinWindows.clear(); scoreCache.clear(); }
export function resetSpamWindows(): void { spamWindows.clear(); contentHashes.clear(); }

/** Activate ultra-mode for a guild (manual or automatic) */
export function activateUltraMode(guildId: string, activatedBy = 'auto'): void {
  ultraModeActive.set(guildId, { activatedAt: Date.now(), activatedBy });
}
/** Deactivate ultra-mode */
export function deactivateUltraMode(guildId: string): void {
  ultraModeActive.delete(guildId);
  scoreCache.clear();
}
/** Check if ultra-mode is active */
export function isUltraModeActive(guildId: string): boolean {
  return ultraModeActive.has(guildId);
}
export function getUltraModeInfo(guildId: string) {
  return ultraModeActive.get(guildId) ?? null;
}

setInterval(() => {
  const cutoff = Date.now() - 60_000;
  for (const [k, ts] of joinWindows)    { const f = ts.filter(t => t > cutoff); if (!f.length) joinWindows.delete(k); else joinWindows.set(k, f); }
  for (const [k, ts] of spamWindows)    { const f = ts.filter(t => t > cutoff); if (!f.length) spamWindows.delete(k); else spamWindows.set(k, f); }
  for (const [k, hs] of contentHashes)  { if (hs.length === 0) contentHashes.delete(k); }
}, 60_000);

// ── Alert helper ──────────────────────────────────────────────────────────────

async function postAlert(guild: Guild, config: SecurityConfig, embed: EmbedBuilder): Promise<void> {
  if (config.log_channel_id) {
    const ch = guild.channels.cache.get(config.log_channel_id) as TextChannel | undefined;
    if (ch) { await ch.send({ embeds: [embed] }).catch(() => {}); return; }
  }
  if (guild.systemChannel) await guild.systemChannel.send({ embeds: [embed] }).catch(() => {});
}

// ── Incident DB ───────────────────────────────────────────────────────────────

function logIncident(guildId: string, type: string, targetId: string | null, action: string, detail?: string) {
  db.prepare('INSERT INTO security_incidents (guild_id, type, target_id, action, detail) VALUES (?, ?, ?, ?, ?)').run(guildId, type, targetId, action, detail ?? null);
}

/**
 * Mirrors an automated enforcement action into the shared mod-case system
 * (mod_history / logModAction) so it shows up in /records case and
 * /history alongside manually-issued kicks/bans/timeouts. Previously
 * Security Engine actions only landed in security_incidents, which isn't
 * searchable/filterable the way mod-case is — a raid auto-ban was
 * invisible to /history entirely. Moderator on the case is the bot itself,
 * matching the convention already used for automod3's auto-warns.
 *
 * Silently no-ops for outcomes that didn't actually act on the member
 * (DM-only warnings, permission failures, lockdown-only with no kick) —
 * there's nothing moderation-relevant to file a case for in those.
 */
function recordSecurityCase(guild: Guild, targetId: string, resultAction: string, reason: string): void {
  const botId = guild.client.user?.id;
  if (!botId) return;
  let action: ModAction;
  let durationMs: number | undefined;
  switch (resultAction) {
    case 'banned':
      action = 'ban';
      break;
    case 'kicked':
    case 'kicked_no_ban_perms':
    case 'kicked+lockdown':
      action = 'kick';
      break;
    case 'timeout_10m':
    case 'timeout_fallback':
      action = 'timeout';
      durationMs = 10 * 60 * 1000;
      break;
    default:
      return; // warned_dm, deleted, *_skipped_*, lockdown_only — no case to file
  }
  logModAction(guild.id, targetId, botId, action, `[Security Engine] ${reason}`, durationMs);
}

export function getRecentIncidents(guildId: string, limit = 20) {
  return db.prepare('SELECT * FROM security_incidents WHERE guild_id = ? ORDER BY ts DESC LIMIT ?').all(guildId, limit) as { id: number; type: string; target_id: string | null; action: string; detail: string | null; ts: number }[];
}

// ── Severity actions ──────────────────────────────────────────────────────────

export async function applySeverityAction(member: GuildMember, config: SecurityConfig, reason: string): Promise<string> {
  const lang = getGuildLang(member.guild.id);
  const t    = (k: string, v?: Record<string, string>) => getLocalized(k, lang, v);

  switch (config.severity) {
    case 'low':
      await member.send({ embeds: [new EmbedBuilder().setColor('#fee75c').setTitle(t('security.warning_title')).setDescription(t('security.warning_desc', { server: member.guild.name, reason })).setTimestamp()] }).catch(() => {});
      return 'warned_dm';

    case 'medium':
      if (member.moderatable) { await member.timeout(10 * 60 * 1000, reason).catch(() => {}); return 'timeout_10m'; }
      await member.send({ embeds: [new EmbedBuilder().setColor('#e67e22').setTitle(t('security.slowdown_title')).setDescription(t('security.slowdown_desc', { server: member.guild.name }))] }).catch(() => {});
      return 'timeout_skipped_warned';

    case 'high':
      if (member.bannable)    { await member.ban({ reason, deleteMessageSeconds: 86400 }).catch(() => {}); return 'banned'; }
      if (member.kickable)    { await member.kick(reason).catch(() => {}); return 'kicked'; }
      if (member.moderatable) { await member.timeout(10 * 60 * 1000, reason).catch(() => {}); return 'timeout_fallback'; }
      return 'action_skipped_no_perms';
  }
}

// ── Auto-Defend action executor ───────────────────────────────────────────────

export type DefendAction = 'ban' | 'kick' | 'timeout' | 'lockdown' | 'warn';

/**
 * Executes a specific configured auto-defend action against a member.
 * Used when auto_defend = 1 to override the severity-based action.
 *
 * 'lockdown' on a member trigger → locks all channels AND kicks the member.
 * 'warn'     → DM warning only (same as severity=low).
 */
export async function applyAutoDefendAction(
  member: GuildMember,
  action: DefendAction,
  reason: string,
): Promise<string> {
  switch (action) {
    case 'ban':
      if (member.bannable) {
        await member.ban({ reason, deleteMessageSeconds: 86400 }).catch(() => {});
        return 'banned';
      }
      if (member.kickable) { await member.kick(reason).catch(() => {}); return 'kicked_no_ban_perms'; }
      return 'ban_skipped_no_perms';

    case 'kick':
      if (member.kickable) { await member.kick(reason).catch(() => {}); return 'kicked'; }
      if (member.moderatable) { await member.timeout(10 * 60 * 1000, reason).catch(() => {}); return 'timeout_fallback'; }
      return 'kick_skipped_no_perms';

    case 'timeout':
      if (member.moderatable) { await member.timeout(10 * 60 * 1000, reason).catch(() => {}); return 'timeout_10m'; }
      return 'timeout_skipped_no_perms';

    case 'lockdown':
      // Lockdown is handled at call site (needs guild ref) — kick member too
      if (member.kickable) { await member.kick(reason).catch(() => {}); return 'kicked+lockdown'; }
      return 'lockdown_only';

    case 'warn':
    default: {
      const lang = getGuildLang(member.guild.id);
      await member.send({ embeds: [new EmbedBuilder().setColor('#fee75c')
        .setTitle(getLocalized('security.warning_title', lang))
        .setDescription(getLocalized('security.warning_desc', lang, { server: member.guild.name, reason }))
        .setTimestamp()] }).catch(() => {});
      return 'warned_dm';
    }
  }
}

async function warnInChannel(msg: Message, reasonKey: string, cfg: SecurityConfig, vars?: Record<string, string>): Promise<void> {
  if (!(msg.channel instanceof TextChannel)) return;
  const lang   = getGuildLang(msg.guild!.id);
  const reason = getLocalized(reasonKey, lang, vars);
  const color  = cfg.severity === 'low' ? '#fee75c' : cfg.severity === 'medium' ? '#e67e22' : '#ed4245';
  const notice = await msg.channel.send({ embeds: [new EmbedBuilder().setColor(color as any).setDescription(getLocalized('security.msg_removed', lang, { reason }))] }).catch(() => null);
  if (notice) setTimeout(() => notice.delete().catch(() => {}), 6000);
}

// ── Lockdown ──────────────────────────────────────────────────────────────────

export async function triggerLockdown(guild: Guild, config: SecurityConfig, reason: string): Promise<void> {
  if (lockdownActive.has(guild.id)) return;
  const lang      = getGuildLang(guild.id);
  const t         = (k: string, v?: Record<string, string>) => getLocalized(k, lang, v);
  const whitelist: string[] = JSON.parse(config.lockdown_whitelist || '[]');

  const textChannels = guild.channels.cache.filter(ch =>
    ch.type === ChannelType.GuildText && !whitelist.includes(ch.id) &&
    ch.permissionsFor(guild.roles.everyone)?.has(PermissionFlagsBits.SendMessages),
  );

  for (const [id] of textChannels) db.prepare('INSERT OR IGNORE INTO security_lockdown_state (guild_id, channel_id) VALUES (?, ?)').run(guild.id, id);

  await Promise.allSettled([...textChannels.values()].map(ch =>
    (ch as TextChannel).permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false }, { reason: `[Security Engine] ${reason}` }).catch(() => {}),
  ));

  const timer = setTimeout(() => liftLockdown(guild), 5 * 60 * 1000);
  lockdownActive.set(guild.id, timer);
  logIncident(guild.id, 'lockdown', null, 'locked', reason);

  await postAlert(guild, config, new EmbedBuilder()
    .setColor('#ed4245')
    .setTitle(t('security.lockdown_title'))
    .setDescription(t('security.lockdown_desc', { reason, count: String(textChannels.size) }))
    .setTimestamp());
}

export async function liftLockdown(guild: Guild): Promise<number> {
  const timer = lockdownActive.get(guild.id);
  if (timer) { clearTimeout(timer); lockdownActive.delete(guild.id); }

  const locked = (db.prepare('SELECT channel_id FROM security_lockdown_state WHERE guild_id = ?').all(guild.id) as { channel_id: string }[]).map(r => r.channel_id);
  if (!locked.length) return 0;

  await Promise.allSettled(locked.map(chId => {
    const ch = guild.channels.cache.get(chId) as TextChannel | undefined;
    return ch ? ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null }, { reason: '[Security Engine] Lockdown lifted' }).catch(() => {}) : Promise.resolve();
  }));

  db.prepare('DELETE FROM security_lockdown_state WHERE guild_id = ?').run(guild.id);
  logIncident(guild.id, 'lockdown', null, 'unlocked', `${locked.length} channels`);
  return locked.length;
}

export function isLockdownActive(guildId: string): boolean { return lockdownActive.has(guildId); }

// ── Risk Scoring (Behavioral Fingerprinting) ──────────────────────────────────

function computeRiskScore(member: GuildMember, joinBurstCount: number): number {
  let score = 0;
  const ageDays = (Date.now() - member.user.createdTimestamp) / 86_400_000;

  if (!member.user.avatar) score += 35;

  if (ageDays < 1)   score += 30;
  else if (ageDays < 7)  score += 25;
  else if (ageDays < 30) score += 15;
  else if (ageDays > 365) score -= 20;

  const uname = member.user.username.toLowerCase();
  if (/^user_?\d{4,}$/.test(uname))            score += 20;
  if (/^[a-z]{3,6}\d{4,8}$/.test(uname))       score += 15;
  if (/^discord_?user\d*$/.test(uname))         score += 20;
  if (/^[0-9a-f]{8,}$/.test(uname))            score += 18;
  if (/^(raid|nuke|spam|bot)\d*/i.test(uname)) score += 30;

  if (joinBurstCount >= 5)  score += 15;
  if (joinBurstCount >= 10) score += 10;

  return Math.min(100, Math.max(0, score));
}

// ── Coordinated-spam detection ────────────────────────────────────────────────

function hashContent(s: string): number {
  let h = 0;
  for (let i = 0; i < Math.min(s.length, 200); i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h;
}

// ── Anti-Raid + Ultra-Mode member join ───────────────────────────────────────

export async function handleSecurityMemberJoin(member: GuildMember): Promise<void> {
  const cfg  = getSecurityConfig(member.guild.id);
  if (!cfg.enabled) return;
  const lang = getGuildLang(member.guild.id);
  const t    = (k: string, v?: Record<string, string>) => getLocalized(k, lang, v);
  const gid  = member.guild.id;
  const now  = Date.now();

  // ── Account-age gate (always active when configured) ─────────────────────
  if (cfg.feat_accountage && cfg.min_account_age_min > 0) {
    const ageMins = (now - member.user.createdTimestamp) / 60_000;
    if (ageMins < cfg.min_account_age_min) {
      const action = await applySeverityAction(member, cfg, `Account age too low: ${Math.floor(ageMins)}min`);
      logIncident(gid, 'account_age', member.id, action, `age=${Math.floor(ageMins)}min`);
      recordSecurityCase(member.guild, member.id, action, `Account age too low: ${Math.floor(ageMins)}min`);
      void postAlert(member.guild, cfg, new EmbedBuilder().setColor('#fee75c')
        .setTitle(t('security.age_title'))
        .setDescription(t('security.age_desc', { user: member.id, age: String(Math.floor(ageMins)), min: String(cfg.min_account_age_min), action }))
        .setTimestamp());
      return;
    }
  }

  if (!cfg.feat_antiraid) return;

  // ── Sliding-window join tracking ─────────────────────────────────────────
  const windowMs   = cfg.raid_window_seconds * 1000;
  const burstMs    = 5_000;
  const allJoins   = (joinWindows.get(gid) ?? []).filter(ts => now - ts < windowMs);
  const burstJoins = allJoins.filter(ts => now - ts < burstMs);
  allJoins.push(now);
  joinWindows.set(gid, allJoins);

  // ── ULTRA-MODE: score every joiner, ban above threshold immediately ──────
  if (cfg.ultra_mode) {
    const score     = computeRiskScore(member, burstJoins.length);
    const threshold = cfg.ultra_score_threshold ?? 60;
    scoreCache.set(`${gid}:${member.id}`, score);

    if (score >= threshold) {
      let ultraAction: 'banned' | 'kicked' | 'none' = 'none';
      if (member.bannable) {
        await member.ban({ reason: `[Ultra-Mode] Risk score ${score}/100`, deleteMessageSeconds: 86400 }).catch(() => {});
        ultraAction = 'banned';
      } else if (member.kickable) {
        await member.kick(`[Ultra-Mode] Risk score ${score}/100`).catch(() => {});
        ultraAction = 'kicked';
      }
      logIncident(gid, 'ultra_ban', member.id, 'banned', `score=${score}`);
      recordSecurityCase(member.guild, member.id, ultraAction, `Ultra-Mode risk score ${score}/100`);
      void postAlert(member.guild, cfg, new EmbedBuilder()
        .setColor('#6600ff')
        .setTitle('⚡ ULTRA-MODE — Threat Neutralized')
        .setDescription(
          `<@${member.id}> — **Risk Score: ${score}/100** (threshold: ${threshold})\n` +
          `**Indicators:**\n` +
          `${!member.user.avatar ? '• No profile picture (default avatar)\n' : ''}` +
          `${((Date.now() - member.user.createdTimestamp) / 86_400_000) < 7 ? `• Account age: ${Math.floor((Date.now() - member.user.createdTimestamp) / 86_400_000)}d\n` : ''}` +
          `${burstJoins.length >= 5 ? `• Joined in burst of ${burstJoins.length}\n` : ''}` +
          `**Action:** Banned immediately (0ms delay)`,
        )
        .setTimestamp());
      return;
    }

    if (score >= 40) {
      logIncident(gid, 'ultra_flag', member.id, 'flagged', `score=${score}`);
    }
  }

  // ── Normal anti-raid (threshold-based) ───────────────────────────────────
  if (allJoins.length >= cfg.raid_threshold) {
    const raidReason = `Anti-raid: ${allJoins.length} joins in ${cfg.raid_window_seconds}s`;

    // Auto-defend overrides severity action if enabled
    const useAutoDefend = cfg.auto_defend === 1;
    const raidAction    = useAutoDefend ? (cfg.defend_raid as DefendAction) : null;

    let action: string;
    if (useAutoDefend && raidAction) {
      action = await applyAutoDefendAction(member, raidAction, raidReason);
      // Lockdown: also lock channels
      if (raidAction === 'lockdown' && !isLockdownActive(gid)) {
        void triggerLockdown(member.guild, cfg, raidReason);
      }
    } else {
      action = await applySeverityAction(member, cfg, raidReason);
    }

    logIncident(gid, 'raid', member.id, action, `joins=${allJoins.length}`);
    recordSecurityCase(member.guild, member.id, action, raidReason);

    if (allJoins.length === cfg.raid_threshold) {
      void postAlert(member.guild, cfg, new EmbedBuilder().setColor('#ed4245')
        .setTitle(t('security.raid_title'))
        .setDescription(t('security.raid_desc', { count: String(allJoins.length), window: String(cfg.raid_window_seconds), threshold: String(cfg.raid_threshold), action, user: member.id, severity: cfg.severity }))
        .setTimestamp());

      if (!useAutoDefend) {
        if (cfg.ultra_mode && !isLockdownActive(gid)) {
          void triggerLockdown(member.guild, cfg, `Auto-lockdown: ${allJoins.length} joins in ${cfg.raid_window_seconds}s`);
        } else if (cfg.severity === 'high') {
          void triggerLockdown(member.guild, cfg, `Anti-raid: ${allJoins.length} joins in ${cfg.raid_window_seconds}s`);
        }
      }
    }
  }
}

// ── Message hot path ──────────────────────────────────────────────────────────

const INVITE_PATTERN   = /discord(?:app)?\.(?:com|gg)\/invite\/[a-zA-Z0-9]+|discord\.gg\/[a-zA-Z0-9]+/i;
const PHISHING_PATTERNS = [
  /discord[_\-.]?gift[s]?\.[a-z]{2,6}/i, /free[_\-.]?nitro\.[a-z]{2,6}/i,
  /dlscord\.[a-z]{2,6}/i, /discordapp\.com\.[a-z]{2,6}/i,
  /nitro[_\-.]?gift\.[a-z]{2,6}/i, /steam(?:community)?[_\-.]?gift\.[a-z]{2,6}/i,
  /discord-gift\.[a-z]{2,6}/i,
];

export async function handleSecurityMessage(msg: Message): Promise<boolean> {
  if (!msg.guild || msg.author.bot) return false;
  const cfg = getSecurityConfig(msg.guild.id);
  if (!cfg.enabled) return false;

  const member = msg.member ?? await msg.guild.members.fetch(msg.author.id).catch(() => null);
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild))    return false;
  if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return false;

  const lang = getGuildLang(msg.guild.id);
  const t    = (k: string, v?: Record<string, string>) => getLocalized(k, lang, v);
  const gid  = msg.guild.id;
  const uid  = msg.author.id;
  const now  = Date.now();
  let violated = false;

  // Phishing — highest priority
  if (!violated && cfg.feat_antiphing && !isChannelExempt(gid, msg.channelId, 'phishing') && PHISHING_PATTERNS.some(p => p.test(msg.content))) {
    violated = true;
    await msg.delete().catch(() => {});
    const reason = 'Phishing link detected';
    const action = cfg.auto_defend
      ? await applyAutoDefendAction(member, (cfg.defend_phishing as DefendAction), reason)
      : await applySeverityAction(member, cfg, reason);
    logIncident(gid, 'phishing', uid, action);
    recordSecurityCase(msg.guild, uid, action, reason);
    void postAlert(msg.guild, cfg, new EmbedBuilder().setColor('#ed4245')
      .setTitle(t('security.phishing_title'))
      .setDescription(t('security.phishing_desc', { user: uid, content: msg.content.slice(0, 80), action }))
      .setTimestamp());
    await warnInChannel(msg, 'security.phishing_warn', cfg);
  }

  // Anti-spam
  if (!violated && cfg.feat_antispam && !isChannelExempt(gid, msg.channelId, 'antispam')) {
    const key      = `${gid}:${uid}`;
    const windowMs = cfg.spam_window_seconds * 1000;
    const prev     = (spamWindows.get(key) ?? []).filter(t2 => now - t2 < windowMs);
    prev.push(now);
    spamWindows.set(key, prev);

    if (prev.length >= cfg.spam_threshold) {
      violated = true;
      await msg.delete().catch(() => {});
      const reason = `Spam: ${prev.length} messages in ${cfg.spam_window_seconds}s`;
      let action: string;
      if (cfg.auto_defend) {
        action = await applyAutoDefendAction(member, (cfg.defend_spam as DefendAction), reason);
      } else {
        action = cfg.severity === 'low' ? 'warned_dm' : await applySeverityAction(member, cfg, reason);
        if (cfg.severity === 'low')
          await member.send({ embeds: [new EmbedBuilder().setColor('#fee75c').setTitle(t('security.slowdown_title')).setDescription(t('security.slowdown_desc', { server: msg.guild.name }))] }).catch(() => {});
      }
      logIncident(gid, 'spam', uid, action, `msgs=${prev.length}`);
      recordSecurityCase(msg.guild, uid, action, reason);
      await warnInChannel(msg, 'security.spam_warn', cfg, { count: String(prev.length), window: String(cfg.spam_window_seconds) });
    }
  }

  // Link filter (invite links only)
  if (!violated && cfg.feat_linkfilter && !isChannelExempt(gid, msg.channelId, 'antilink') && INVITE_PATTERN.test(msg.content)) {
    violated = true;
    await msg.delete().catch(() => {});
    const reason = 'Unauthorized Discord invite link';
    const action = cfg.auto_defend
      ? await applyAutoDefendAction(member, (cfg.defend_link as DefendAction), reason)
      : (cfg.severity !== 'low' ? await applySeverityAction(member, cfg, reason) : 'deleted');
    logIncident(gid, 'link', uid, action);
    recordSecurityCase(msg.guild, uid, action, reason);
    await warnInChannel(msg, 'security.link_warn', cfg);
  }

  // Mass-ping guard
  if (!violated && cfg.feat_masspinggard && !isChannelExempt(gid, msg.channelId, 'massping')) {
    const everyoneMentions = (msg.content.match(/@everyone|@here/g) ?? []).length;
    const mentionCount     = msg.mentions.users.size + msg.mentions.roles.size + everyoneMentions;
    if (mentionCount >= cfg.mass_ping_limit) {
      violated = true;
      await msg.delete().catch(() => {});
      const reason = `Mass-ping: ${mentionCount} mentions`;
      const action = cfg.auto_defend
        ? await applyAutoDefendAction(member, (cfg.defend_mass_ping as DefendAction), reason)
        : await applySeverityAction(member, cfg, reason);
      logIncident(gid, 'mass_ping', uid, action, `mentions=${mentionCount}`);
      recordSecurityCase(msg.guild, uid, action, reason);
      await warnInChannel(msg, 'security.ping_warn', cfg, { count: String(mentionCount), max: String(cfg.mass_ping_limit) });
    }
  }

  // Anti-caps
  if (!violated && cfg.feat_anticaps && !isChannelExempt(gid, msg.channelId, 'anticaps') && msg.content.length >= 10) {
    const letters = (msg.content.match(/[a-zA-Z]/g) ?? []) as string[];
    if (letters.length >= 6) {
      const upper = letters.filter((c: string) => c === c.toUpperCase()).length;
      if (upper / letters.length > 0.8) {
        violated = true;
        await msg.delete().catch(() => {});
        logIncident(gid, 'caps', uid, 'deleted');
        await warnInChannel(msg, 'security.caps_warn', cfg);
      }
    }
  }

  // ── Ultra-mode: coordinated-spam detection ────────────────────────────────
  if (!violated && cfg.ultra_mode && msg.content.length >= 10) {
    const hash = hashContent(msg.content);
    const guildHashes = contentHashes.get(gid) ?? [];
    const matchCount  = guildHashes.filter(h => h === hash).length;
    guildHashes.push(hash);
    if (guildHashes.length > 200) guildHashes.splice(0, guildHashes.length - 200);
    contentHashes.set(gid, guildHashes);

    if (matchCount >= 2) {
      violated = true;
      await msg.delete().catch(() => {});
      const action = await applySeverityAction(member, cfg, 'Coordinated spam: identical message from multiple users');
      logIncident(gid, 'coordinated_spam', uid, action, `hash=${hash},copies=${matchCount + 1}`);
      recordSecurityCase(msg.guild, uid, action, 'Coordinated spam: identical message from multiple users');
      void postAlert(msg.guild, cfg, new EmbedBuilder()
        .setColor('#6600ff')
        .setTitle('⚡ ULTRA — Coordinated Spam Detected')
        .setDescription(`Same message sent by **${matchCount + 1}** different users.\n<@${uid}> → \`${action}\`\nMessage: \`${msg.content.slice(0, 80)}\``)
        .setTimestamp());
      if (matchCount >= 4 && !isLockdownActive(gid)) {
        void triggerLockdown(msg.guild, cfg, `Coordinated spam: ${matchCount + 1} identical messages`);
      }
    }
  }

  return violated;
}

export function getMemberScore(guildId: string, userId: string): number {
  return scoreCache.get(`${guildId}:${userId}`) ?? -1;
}

// ── Simulation injection functions ────────────────────────────────────────────
//
// DESIGN PRINCIPLE: Simulations execute REAL defensive responses.
// The engine behaves identically for real and simulated attacks.
// Since simulated users don't exist as GuildMembers, the fallback
// defense is server-level: channel lockdown (medium/high severity).
//
// This is NOT fake. Real attacks → real lockdown. Simulated attacks → real lockdown.
// The only difference: simulated events are labelled in the incident log.

/**
 * Injects N simulated joins into the anti-raid engine.
 * If threshold is crossed:
 *   - low:    Posts alert (no lockdown)
 *   - medium: Posts alert + triggers REAL lockdown
 *   - high:   Posts alert + triggers REAL lockdown
 */
export async function testInjectJoins(
  guild: Guild,
  count: number,
  fakeUserId = 'sim-user',
): Promise<{ triggered: boolean; action: string; joins: number }> {
  const cfg = getSecurityConfig(guild.id);
  if (!cfg.enabled || !cfg.feat_antiraid)
    return { triggered: false, action: 'antiraid_disabled', joins: 0 };

  const now       = Date.now();
  const windowMs  = cfg.raid_window_seconds * 1000;
  const existing  = (joinWindows.get(guild.id) ?? []).filter(t => now - t < windowMs);

  for (let i = 0; i < count; i++) existing.push(now + i);
  joinWindows.set(guild.id, existing);

  logIncident(guild.id, 'raid_sim', fakeUserId, 'injected', `count=${count}`);

  if (existing.length >= cfg.raid_threshold) {
    const lang = getGuildLang(guild.id);
    const t    = (k: string, v?: Record<string, string>) => getLocalized(k, lang, v);

    // FIX: Execute real lockdown for medium AND high severity (not just high).
    // Low severity: alert only (no lockdown — matches real behaviour for low).
    if (cfg.severity !== 'low' && !isLockdownActive(guild.id)) {
      await triggerLockdown(guild, cfg, `[SIM] Anti-raid: ${existing.length} joins in ${cfg.raid_window_seconds}s`);
      logIncident(guild.id, 'raid_sim', fakeUserId, 'lockdown_triggered', `joins=${existing.length},severity=${cfg.severity}`);

      void postAlert(guild, cfg, new EmbedBuilder()
        .setColor('#ed4245')
        .setTitle(t('security.raid_title') + ' [SIMULATION]')
        .setDescription(
          t('security.raid_desc', {
            count:     String(existing.length),
            window:    String(cfg.raid_window_seconds),
            threshold: String(cfg.raid_threshold),
            action:    'lockdown',
            user:      fakeUserId,
            severity:  cfg.severity,
          }) + '\n\n🧪 **Triggered by `/simulate raid` — REAL lockdown executed.**',
        )
        .setTimestamp());

      return { triggered: true, action: 'lockdown', joins: existing.length };
    }

    // Low severity: alert only
    void postAlert(guild, cfg, new EmbedBuilder()
      .setColor('#fee75c')
      .setTitle(t('security.raid_title') + ' [SIMULATION]')
      .setDescription(
        t('security.raid_desc', {
          count:     String(existing.length),
          window:    String(cfg.raid_window_seconds),
          threshold: String(cfg.raid_threshold),
          action:    'alert_only',
          user:      fakeUserId,
          severity:  cfg.severity,
        }) + '\n\n🧪 **Triggered by `/simulate raid` — severity=low: alert posted, no lockdown.**',
      )
      .setTimestamp());

    return { triggered: true, action: 'alert_sent', joins: existing.length };
  }

  return { triggered: false, action: 'below_threshold', joins: existing.length };
}

/**
 * Injects N simulated spam messages into the anti-spam engine.
 * If threshold is crossed:
 *   - low:    DM warning sent to simulated user (skipped since no real user)
 *             Posts channel notice.
 *   - medium: Posts channel notice + triggers REAL lockdown (escalated defence
 *             since we cannot timeout a non-existent member).
 *   - high:   Posts channel notice + triggers REAL lockdown immediately.
 *
 * FIX: Previously this only sent an informational embed. Now it executes real
 * server-level defense when threshold is crossed.
 */
export async function testInjectSpam(
  guild: Guild,
  channel: TextChannel,
  count: number,
  fakeUserId = 'sim-spammer',
): Promise<{ triggered: boolean; action: string; msgCount: number }> {
  const cfg = getSecurityConfig(guild.id);
  if (!cfg.enabled || !cfg.feat_antispam)
    return { triggered: false, action: 'antispam_disabled', msgCount: 0 };

  const key      = `${guild.id}:${fakeUserId}`;
  const now      = Date.now();
  const windowMs = cfg.spam_window_seconds * 1000;
  const prev     = (spamWindows.get(key) ?? []).filter(t => now - t < windowMs);

  for (let i = 0; i < count; i++) prev.push(now + i * 10);
  spamWindows.set(key, prev);

  logIncident(guild.id, 'spam_sim', fakeUserId, 'injected', `count=${count}`);

  if (prev.length >= cfg.spam_threshold) {
    const lang  = getGuildLang(guild.id);
    const color = cfg.severity === 'low' ? '#fee75c' : cfg.severity === 'medium' ? '#e67e22' : '#ed4245';

    // FIX: Execute REAL server-level defense.
    // For medium/high: trigger lockdown (since simulated user has no GuildMember to timeout/ban).
    // For low: post warning notice only (matches real 'low' behaviour of DM warning).
    let realAction = 'alert_only';
    if (cfg.severity !== 'low' && !isLockdownActive(guild.id)) {
      await triggerLockdown(guild, cfg, `[SIM] Spam threshold exceeded: ${prev.length} msgs in ${cfg.spam_window_seconds}s`);
      realAction = 'lockdown';
      logIncident(guild.id, 'spam_sim', fakeUserId, 'lockdown_triggered', `msgs=${prev.length},severity=${cfg.severity}`);
    }

    await channel.send({
      embeds: [new EmbedBuilder()
        .setColor(color as any)
        .setTitle(`🚨 [SIMULATION] Anti-Spam Triggered`)
        .setDescription(
          `Simulated user exceeded spam threshold.\n` +
          `**Messages:** ${prev.length} in ${cfg.spam_window_seconds}s (threshold: ${cfg.spam_threshold})\n` +
          `**Severity:** ${cfg.severity}\n` +
          `**Real action executed:** \`${realAction}\`\n\n` +
          (realAction === 'lockdown'
            ? `🔒 Server lockdown is now active. Use \`/lockdown end\` to lift.`
            : `⚠️ Severity=low: warning notice only (no lockdown).`),
        )],
    }).catch(() => {});

    return { triggered: true, action: realAction, msgCount: prev.length };
  }

  return { triggered: false, action: 'below_threshold', msgCount: prev.length };
}

/**
 * Tests phishing/link detection and executes REAL server-level defense.
 *
 * FIX: Previously only sent an informational embed. Now triggers lockdown
 * for medium/high severity when phishing content is detected, matching
 * real attack behaviour where the user would be banned/timed out.
 */
export async function testInjectContent(
  guild: Guild,
  channel: TextChannel,
  content: string,
  fakeUserId = 'sim-attacker',
): Promise<{ triggered: boolean; type: string }> {
  const cfg = getSecurityConfig(guild.id);
  if (!cfg.enabled) return { triggered: false, type: 'engine_disabled' };

  const lang = getGuildLang(guild.id);

  if (cfg.feat_antiphing && PHISHING_PATTERNS.some(p => p.test(content))) {
    logIncident(guild.id, 'phishing_sim', fakeUserId, cfg.severity);

    // FIX: Execute REAL defense — lockdown for medium/high (can't ban a sim user).
    let realAction = 'alert_only';
    if (cfg.severity !== 'low' && !isLockdownActive(guild.id)) {
      await triggerLockdown(guild, cfg, `[SIM] Phishing detected: ${content.slice(0, 60)}`);
      realAction = 'lockdown';
      logIncident(guild.id, 'phishing_sim', fakeUserId, 'lockdown_triggered', `content=${content.slice(0, 60)}`);
    }

    void postAlert(guild, cfg, new EmbedBuilder()
      .setColor('#ed4245')
      .setTitle(getLocalized('security.phishing_title', lang) + ' [SIMULATION]')
      .setDescription(
        getLocalized('security.phishing_desc', lang, { user: fakeUserId, content: content.slice(0, 80), action: realAction }) +
        `\n\n🧪 **Triggered by simulation. Real action: \`${realAction}\`**`,
      )
      .setTimestamp());

    await channel.send({
      embeds: [new EmbedBuilder().setColor('#ed4245')
        .setTitle('🚨 [SIMULATION] Phishing Detected')
        .setDescription(
          `Content: \`${content.slice(0, 60)}\`\n` +
          `**Severity:** ${cfg.severity}\n` +
          `**Real action executed:** \`${realAction}\`\n` +
          (realAction === 'lockdown'
            ? `🔒 Server lockdown active. Use \`/lockdown end\` to lift.`
            : `⚠️ Severity=low: alert only.`),
        )],
    }).catch(() => {});

    return { triggered: true, type: 'phishing' };
  }

  if (cfg.feat_linkfilter && INVITE_PATTERN.test(content)) {
    logIncident(guild.id, 'link_sim', fakeUserId, 'detected');

    // FIX: Execute real defense for link filter too.
    let realAction = 'alert_only';
    if (cfg.severity === 'high' && !isLockdownActive(guild.id)) {
      await triggerLockdown(guild, cfg, `[SIM] Invite link flood detected`);
      realAction = 'lockdown';
    }

    await channel.send({
      embeds: [new EmbedBuilder().setColor('#e67e22')
        .setTitle('🚨 [SIMULATION] Invite Link Detected')
        .setDescription(
          `**Severity:** ${cfg.severity}\n` +
          `**Real action executed:** \`${realAction}\``,
        )],
    }).catch(() => {});
    return { triggered: true, type: 'invite_link' };
  }

  return { triggered: false, type: 'no_match' };
}
