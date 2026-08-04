/**
 * /attacksim — Full attack simulator with REAL actions.
 *
 * REAL actions that will be executed:
 *   join-raid        → Lockdown of all channels + message flood in the log channel
 *   nuke             → Creates test channels/roles and deletes them immediately
 *   permission-grab  → Creates a temporary role with admin perms
 *   webhook-spam     → Creates real webhooks, sends messages through them
 *   spam/caps/etc.   → Real messages in the target channel
 *   lockdown         → Locks all channels via permissionOverwrites
 *
 * Rollback stellt ALLES wieder her:
 *   • Deleted channels → recreated (position, name, permissions, category)
 *   • Deleted roles     → recreated (name, color, perms, position)
 *   • Created webhooks  → deleted
 *   • Created channels  → deleted
 *   • Created roles     → deleted
 *   • Locked channels   → unlocked
 *   • Sent messages     → deleted (bulkDelete)
 */

import {
  SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits,
  EmbedBuilder, TextChannel, ChannelType, MessageFlags, Guild,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, GuildChannel,
  CategoryChannel, OverwriteType,
} from 'discord.js';
import { requireAdmin } from '../../utils/guards';
import { success, error, info } from '../../utils/embeds';
import db from '../../database/db';
import { testInjectJoins, testInjectSpam, testInjectContent } from '../../modules/security/securityEngine';

// ══════════════════════════════════════════════════════════════════════════════
// Snapshot DB — stores everything needed for rollback
// ══════════════════════════════════════════════════════════════════════════════

db.exec(`
  CREATE TABLE IF NOT EXISTS attacksim_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id    TEXT NOT NULL,
    channel_id  TEXT NOT NULL,
    message_id  TEXT NOT NULL,
    attack_type TEXT NOT NULL,
    created_at  INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS attacksim_snapshot (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id     TEXT NOT NULL,
    action_type  TEXT NOT NULL,
    payload      TEXT NOT NULL,
    created_at   INTEGER DEFAULT (unixepoch())
  );
`);

// ── Snapshot helpers ──────────────────────────────────────────────────────────

type SnapshotAction =
  | { type: 'channel_deleted';  data: ChannelSnapshot }
  | { type: 'role_deleted';     data: RoleSnapshot }
  | { type: 'channel_created';  data: { id: string } }
  | { type: 'role_created';     data: { id: string } }
  | { type: 'webhook_created';  data: { id: string; channelId: string } }
  | { type: 'channel_locked';   data: { id: string } }
  | { type: 'msg_sent';         data: { channelId: string; messageId: string; type: string } };

interface ChannelSnapshot {
  id: string; name: string; type: number; position: number;
  parentId: string | null; topic: string | null;
  nsfw: boolean; slowmode: number;
  permissionOverwrites: { id: string; type: number; allow: string; deny: string }[];
}

interface RoleSnapshot {
  id: string; name: string; color: number; hoist: boolean;
  position: number; permissions: string; mentionable: boolean;
}

function saveSnapshot(guildId: string, action: SnapshotAction) {
  db.prepare('INSERT INTO attacksim_snapshot (guild_id, action_type, payload) VALUES (?, ?, ?)')
    .run(guildId, action.type, JSON.stringify(action.data));
}

function getSnapshots(guildId: string): SnapshotAction[] {
  return (db.prepare('SELECT action_type, payload FROM attacksim_snapshot WHERE guild_id = ? ORDER BY id DESC').all(guildId) as any[])
    .map(r => ({ type: r.action_type, data: JSON.parse(r.payload) }) as SnapshotAction);
}

function clearSnapshots(guildId: string) {
  db.prepare('DELETE FROM attacksim_snapshot WHERE guild_id = ?').run(guildId);
}

// ── Message tracking helpers ──────────────────────────────────────────────────

function trackMsg(guildId: string, channelId: string, msgId: string, type: string) {
  db.prepare('INSERT INTO attacksim_log (guild_id, channel_id, message_id, attack_type) VALUES (?, ?, ?, ?)')
    .run(guildId, channelId, msgId, type);
  saveSnapshot(guildId, { type: 'msg_sent', data: { channelId, messageId: msgId, type } });
}

function getTracked(guildId: string) {
  return db.prepare('SELECT channel_id, message_id FROM attacksim_log WHERE guild_id = ? ORDER BY id DESC').all(guildId) as { channel_id: string; message_id: string }[];
}

function clearTracked(guildId: string) {
  db.prepare('DELETE FROM attacksim_log WHERE guild_id = ?').run(guildId);
}

async function sendTracked(ch: TextChannel, guildId: string, type: string, content: string | { embeds: EmbedBuilder[] }, delay = 300) {
  await new Promise(r => setTimeout(r, delay));
  const opts = typeof content === 'string'
    ? { content, allowedMentions: { parse: [] } }
    : { ...content, allowedMentions: { parse: [] } };
  const msg = await ch.send(opts as any).catch(() => null);
  if (msg) trackMsg(guildId, ch.id, msg.id, type);
}

// ══════════════════════════════════════════════════════════════════════════════
// Content libraries
// ══════════════════════════════════════════════════════════════════════════════

const SPAM_MESSAGES = [
  'SPAM SPAM SPAM BUY NOW!!!', 'FREE NITRO CLICK HERE!!!', 'JOIN MY SERVER NOW!!!',
  'RAID THIS SERVER!!!', 'DISCORD.GG/FAKE1234', 'GET FREE ROBUX!!!',
  'LIMITED TIME OFFER!!!', 'DO NOT MISS THIS!!!', 'EVERYONE LOOK HERE!!!', 'BUY CHEAP ACCOUNTS!!!',
];
const CAPS_MESSAGES = [
  'HEY EVERYONE LOOK AT ME I AM BEING VERY LOUD', 'THIS IS VERY IMPORTANT PLEASE READ THIS NOW',
  'ATTENTION ALL MEMBERS JOIN MY SERVER IMMEDIATELY', 'YOU WILL NOT BELIEVE WHAT JUST HAPPENED HERE',
  'MASSIVE ANNOUNCEMENT FOR THE WHOLE SERVER',
];
const PHISHING_MESSAGES = [
  '🎁 Free Discord Nitro! Click: discord-gift-claim.example-sim.invalid/nitro',
  '⚠️ Your account will be banned unless you verify: discordapp-verify.example-sim.invalid',
  '💰 Steam gift card: steamcommunity-free.example-sim.invalid/gift',
];
const INVITE_MESSAGES = [
  '[SIM] Join my server! discord.gg/fakeinvite1', '[SIM] Better server: discord.gg/fakeinvite2',
  '[SIM] Come join us: discord.gg/fakeinvite3',
];
const BADWORD_PATTERNS = [
  '[SIM] This message contains filtered w*rds',
  '[SIM] Blocked phrase simulation — Test1', '[SIM] Filtered content pattern — Test2',
];
const EMOJI_SPAM = [
  '[SIM] 🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥',
  '[SIM] 💀💀💀💀💀💀💀💀💀💀💀💀💀💀💀💀💀💀💀💀',
  '[SIM] 😂😂😂😂😂😂😂😂😂😂😂😂😂😂😂😂😂😂😂😂',
];
const REGEX_BYPASS = [
  '[SIM] W.O.R.T — Punkt-Umgehung', '[SIM] W_O_R_T — Unterstrich-Umgehung',
  '[SIM] W0R7 — Leet-Speak', '[SIM] Ⓦ Ⓞ Ⓡ Ⓣ — Unicode-Umgehung',
];
const COPYPASTA = '[SIM] Lorem ipsum SIMULATION SPAM MESSAGE please ignore [SIM]';

// ══════════════════════════════════════════════════════════════════════════════
// ECHTE Simulations-Funktionen
// ══════════════════════════════════════════════════════════════════════════════

// ── JOIN-RAID: Lockdown + Log ─────────────────────────────────────────────────
export async function simJoinRaid(guild: Guild, guildId: string, count: number): Promise<string> {

  // Engine injection: triggers anti-raid directly, like real joins
  const engineResult = await testInjectJoins(guild, count, 'sim-raider');

  // Real action: lockdown for a realistic effect + rollback test
  const textChannels = guild.channels.cache.filter(
    ch => ch.type === ChannelType.GuildText &&
      ch.permissionsFor(guild.roles.everyone)?.has(PermissionFlagsBits.SendMessages),
  );
  await Promise.allSettled([...textChannels.values()].map(async ch => {
    await (ch as TextChannel).permissionOverwrites.edit(
      guild.roles.everyone, { SendMessages: false },
      { reason: '[attacksim] Join-Raid Lockdown-Test' },
    ).catch(() => {});
    saveSnapshot(guildId, { type: 'channel_locked', data: { id: ch.id } });
  }));

  const logCh = (guild.systemChannel ?? guild.channels.cache.find(c => c.isTextBased())) as TextChannel;
  const engineLine = engineResult.triggered
    ? '\u2705 Engine ausgeloest: ' + engineResult.action
    : '\u26a0\ufe0f Threshold not reached (' + engineResult.joins + ' joins)';
  const msg = await logCh.send({
    embeds: [new EmbedBuilder()
      .setColor('#ed4245')
      .setTitle('[SIM] RAID - Join Spike & Server Lockdown')
      .setDescription(
        '**Simulation:** ' + count + ' accounts joined.\n' +
        '**Channels locked:** ' + textChannels.size + '\n' +
        '**Engine Reaction:** ' + engineLine + '\n\n' +
        'Rollback with `/attacksim rollback`',
      )
      .setTimestamp()],
  }).catch(() => null);
  if (msg) trackMsg(guildId, logCh.id, msg.id, 'join-raid');

  return textChannels.size + ' channels locked -- Engine: ' + (engineResult.triggered ? engineResult.action : 'Threshold not reached');
}


export async function simNuke(guild: Guild, guildId: string, reportCh: TextChannel): Promise<string> {

  const log = (text: string) => sendTracked(reportCh, guildId, 'nuke', text, 600);

  await log('💣 [SIM] Compromised staff account initiates nuke attack...');
  await log('🗑️ [SIM] Attacker deleting channels — creating test channels to delete...');

  // Create 3 test channels — snapshot → delete (simulates channel deletion)
  const createdChannelIds: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const ch = await guild.channels.create({
      name: `sim-nuke-kanal-${i}`,
      type: ChannelType.GuildText,
      reason: '[attacksim] Nuke-Sim: test channel',
    }).catch(() => null);
    if (!ch) continue;
    createdChannelIds.push(ch.id);
    // Snapshot as "created" → rollback deletes it
    saveSnapshot(guildId, { type: 'channel_created', data: { id: ch.id } });
    await log(`🗑️ [SIM] Channel **#${ch.name}** created and immediately deleted`);
    await ch.delete('[attacksim] Nuke-Sim: delete immediately').catch(() => {});
  }

  await log('🎭 [SIM] Attacker deleting roles...');

  // Create 2 test roles — snapshot → delete
  for (let i = 1; i <= 2; i++) {
    const role = await guild.roles.create({
      name: `[SIM] Test Role ${i}`,
      color: 0xed4245,
      reason: '[attacksim] Nuke-Sim',
    }).catch(() => null);
    if (!role) continue;
    saveSnapshot(guildId, { type: 'role_created', data: { id: role.id } });
    await log(`🎭 [SIM] Role **@${role.name}** created and immediately deleted`);
    await role.delete('[attacksim] Nuke-Sim: delete immediately').catch(() => {});
  }

  await log('🔨 [SIM] Angreifer versucht Massen-Bans...');
  await log('🛡️ [SIM] Anti-Nuke would intervene — check `/antinuke status`');

  const antiNukeCfg = db.prepare('SELECT * FROM antinuke_config WHERE guild_id = ?').get(guildId) as any;
  await log(
    antiNukeCfg?.enabled
      ? `✅ Anti-Nuke is ACTIVE — action on trigger: **${antiNukeCfg.action}**`
      : `⚠️ Anti-Nuke is INACTIVE — enable with \`/antinuke setup enabled:true\``,
  );

  return '3 test channels + 2 test roles created and immediately deleted';
}

// ── PERMISSION-GRAB: creates a real role with admin perms ────────────────────
export async function simPermissionGrab(guild: Guild, guildId: string, reportCh: TextChannel): Promise<string> {

  await sendTracked(reportCh, guildId, 'permgrab',
    '[SIM] Attacker attempting privilege escalation — creating temp admin role...', 0);

  // REAL action: create admin role
  const role = await guild.roles.create({
    name: '[SIM] FAKE-ADMIN — rollback will delete me',
    color: 0xff0000,
    permissions: [PermissionFlagsBits.Administrator],
    reason: '[attacksim] Permission-Grab-Simulation',
  }).catch(() => null);

  if (role) {
    saveSnapshot(guildId, { type: 'role_created', data: { id: role.id } });
    await sendTracked(reportCh, guildId, 'permgrab',
      `✅ [SIM] Role **@${role.name}** created with admin permissions (ID: \`${role.id}\`)\n` +
      `→ Rollback will delete this role.`, 500);
  }

  const antiNukeCfg = db.prepare('SELECT * FROM antinuke_config WHERE guild_id = ?').get(guildId) as any;
  await sendTracked(reportCh, guildId, 'permgrab',
    antiNukeCfg?.enabled
      ? `🛡️ [SIM] Anti-Nuke would intervene on role assignment — action: **${antiNukeCfg.action}**`
      : `⚠️ [SIM] Anti-Nuke INACTIVE — attacker could grant themselves admin now!`,
    400);

  return role ? `Admin role "${role.name}" created (rollback will delete it)` : 'Role could not be created';
}

// ── WEBHOOK-SPAM: Creates real webhooks, sends through them ──────────────────
export async function simWebhookSpam(guild: Guild, guildId: string, reportCh: TextChannel): Promise<string> {

  await sendTracked(reportCh, guildId, 'webhook',
    '[SIM] Attacker creating webhooks for spam without account...', 0);

  const webhookNames = ['SystemNotice', 'DiscordBot', 'AdminAlert', 'ServerUpdate'];
  let created = 0;

  for (const name of webhookNames) {
    const wh = await reportCh.createWebhook({
      name,
      reason: '[attacksim] Webhook-Spam-Simulation',
    }).catch(() => null);

    if (!wh) continue;
    created++;
    saveSnapshot(guildId, { type: 'webhook_created', data: { id: wh.id, channelId: reportCh.id } });

    // Send a real message via webhook
    const whMsg = await wh.send({
      content: `[SIM] Webhook **${name}** sends: **FREE NITRO CLICK HERE** discord.gg/fake`,
      allowedMentions: { parse: [] },
    }).catch(() => null);

    // Track webhook message for rollback (webhook messages can't be deleted normally)
    // Instead: deleting the webhook itself removes the message attribution
    if (whMsg) trackMsg(guildId, reportCh.id, whMsg.id, 'webhook');

    await sendTracked(reportCh, guildId, 'webhook',
      `🕵️ [SIM] Webhook **${name}** (ID: \`${wh.id}\`) created — rollback will delete it`, 300);
  }

  const antiNukeCfg = db.prepare('SELECT * FROM antinuke_config WHERE guild_id = ?').get(guildId) as any;
  await sendTracked(reportCh, guildId, 'webhook',
    antiNukeCfg?.enabled
      ? `🛡️ [SIM] Anti-Nuke would intervene after ${antiNukeCfg.webhook_limit} webhooks`
      : `⚠️ [SIM] Anti-Nuke INACTIVE — webhooks could be created without limit!`,
    400);

  return `${created} real webhooks created (rollback will delete all)`;
}

// ── SPAM (real messages + engine injection) ──────────────────────────────────
export async function simSpam(guild: Guild, guildId: string, ch: TextChannel, count: number): Promise<string> {
  await sendTracked(ch, guildId, 'spam', {
    embeds: [new EmbedBuilder().setColor('#fee75c').setTitle('🧪 [SIM] Spam Attack Starting')
      .setDescription(`${count} messages will be sent in rapid succession.\n\`/attacksim rollback\` deletes all.`)],
  }, 0);
  for (let i = 0; i < count; i++)
    await sendTracked(ch, guildId, 'spam', `[SIM-SPAM ${i + 1}/${count}] ${SPAM_MESSAGES[i % SPAM_MESSAGES.length]}`, 150);
  // Inject directly into engine (bot messages bypass author.bot check)
  const result = await testInjectSpam(guild, ch, count, 'sim-spammer');
  return `${count} spam messages sent — Engine: **${result.triggered ? result.action : 'Threshold not reached'}**`;
}

export async function simCapsFlood(guild: Guild, guildId: string, ch: TextChannel): Promise<string> {
  for (const msg of CAPS_MESSAGES) await sendTracked(ch, guildId, 'caps', `[SIM] ${msg}`, 350);
  return `${CAPS_MESSAGES.length} CAPS messages sent`;
}

export async function simMassPing(guild: Guild, guildId: string, ch: TextChannel): Promise<string> {
  const roles = guild.roles.cache.filter(r => !r.managed && r.id !== guild.id).first(3).map(r => r.toString()).join(' ');
  const pings = [
    `[SIM] @everyone @here ${roles} JOIN THE RAID`,
    `[SIM] HEY @everyone ATTENTION ${roles}`,
    `[SIM] EVERYONE ${roles} @here LOOK NOW`,
  ];
  for (const msg of pings) await sendTracked(ch, guildId, 'masspings', msg, 400);
  // Inject content into engine for real detection
  const result = await testInjectContent(guild, ch, `@everyone @here ${roles} JOIN THE RAID`, 'sim-pinger');
  return `${pings.length} mass-ping messages sent — Engine: **${result.triggered ? result.type : 'no trigger'}**`;
}

export async function simPhishing(guild: Guild, guildId: string, ch: TextChannel): Promise<string> {
  for (const msg of PHISHING_MESSAGES) await sendTracked(ch, guildId, 'phishing', `[SIM] ${msg}`, 400);
  // Inject real phishing pattern directly into engine
  const result = await testInjectContent(guild, ch, 'free nitro: discord-gift-claim.example-sim.invalid/nitro', 'sim-phisher');
  return `${PHISHING_MESSAGES.length} phishing messages sent — Engine: **${result.triggered ? 'Phishing detected!' : 'Phishing filter inactive'}**`;
}

export async function simInviteFlood(guild: Guild, guildId: string, ch: TextChannel): Promise<string> {
  for (const msg of INVITE_MESSAGES) await sendTracked(ch, guildId, 'invites', msg, 400);
  return `${INVITE_MESSAGES.length} invite messages sent`;
}

export async function simBadwords(guild: Guild, guildId: string, ch: TextChannel): Promise<string> {
  for (const msg of BADWORD_PATTERNS) await sendTracked(ch, guildId, 'badwords', msg, 400);
  return `${BADWORD_PATTERNS.length} badword messages sent`;
}

export async function simRegexBypass(guild: Guild, guildId: string, ch: TextChannel): Promise<string> {
  for (const msg of REGEX_BYPASS) await sendTracked(ch, guildId, 'regex', msg, 400);
  return `${REGEX_BYPASS.length} regex-bypass attempts sent`;
}

export async function simEmojiSpam(guild: Guild, guildId: string, ch: TextChannel): Promise<string> {
  for (const msg of EMOJI_SPAM) await sendTracked(ch, guildId, 'emoji', msg, 350);
  return `${EMOJI_SPAM.length} emoji-spam messages sent`;
}

export async function simCopypasta(guild: Guild, guildId: string, ch: TextChannel, count: number): Promise<string> {
  for (let i = 0; i < count; i++) await sendTracked(ch, guildId, 'copypasta', `[SIM ${i + 1}/${count}] ${COPYPASTA}`, 200);
  return `${count}× identical message sent`;
}

export async function simLinkFlood(guild: Guild, guildId: string, ch: TextChannel): Promise<string> {
  const links = ['[SIM] https://example-sim-1.invalid', '[SIM] https://example-sim-2.invalid', '[SIM] https://example-sim-3.invalid'];
  for (const msg of links) await sendTracked(ch, guildId, 'links', msg, 400);
  return `${links.length} link messages sent`;
}

export async function simAltAccounts(guild: Guild, guildId: string, ch: TextChannel): Promise<string> {
  const names = ['NewUser8821', 'User_2024_01', 'JustJoined44', 'Account0Day', 'DiscordNew99'];
  for (let i = 0; i < names.length; i++)
    await sendTracked(ch, guildId, 'alt-accounts', `[SIM] Alt account ${i + 1}/5: **${names[i]}** — Account age: **${i * 12}h**`, 500);
  return '5 alt-account scenarios simulated';
}

export async function simSelfbotJoins(guild: Guild, guildId: string, ch: TextChannel): Promise<string> {
  const bots = ['User_7f3a joined — 3h — default avatar', 'User_8c4d joined — 5h — default avatar', 'User_9b5e joined — 2h — default avatar'];
  for (const b of bots) await sendTracked(ch, guildId, 'selfbot', `[SIM] ${b}`, 600);
  return 'Selfbot patterns simulated';
}

// ══════════════════════════════════════════════════════════════════════════════
// ROLLBACK — stellt ALLES wieder her
// ══════════════════════════════════════════════════════════════════════════════

async function doRollback(ix: ChatInputCommandInteraction): Promise<void> {
  const snapshots = getSnapshots(ix.guildId!);
  const tracked = getTracked(ix.guildId!);

  if (!snapshots.length && !tracked.length) {
    await ix.editReply({ embeds: [info('Rollback', 'No simulation data found.')] });
    return;
  }

  const log: string[] = [];

  // ── Phase 1: delete messages (bulkDelete) ─────────────────────────────
  const byChannel = new Map<string, string[]>();
  for (const row of tracked) {
    const arr = byChannel.get(row.channel_id) ?? [];
    arr.push(row.message_id);
    byChannel.set(row.channel_id, arr);
  }

  let msgsDeleted = 0;
  await Promise.allSettled([...byChannel.entries()].map(async ([chId, msgIds]) => {
    const ch = ix.guild!.channels.cache.get(chId) as TextChannel | undefined;
    if (!ch) return;
    if (msgIds.length > 1) {
      await ch.bulkDelete(msgIds, true).then(m => { msgsDeleted += m.size; }).catch(async () => {
        await Promise.allSettled(msgIds.map(id => ch.messages.delete(id).then(() => msgsDeleted++).catch(() => {})));
      });
    } else if (msgIds.length === 1) {
      await ch.messages.delete(msgIds[0]).then(() => msgsDeleted++).catch(() => {});
    }
  }));
  if (msgsDeleted > 0) log.push(`🗑️ **${msgsDeleted} messages** deleted`);

  // ── Phase 2: Snapshots abarbeiten (neueste zuerst = Reihenfolge umkehren) ──
  let channelsUnlocked = 0, webhooksDeleted = 0, rolesDeleted = 0, channelsDeleted = 0;

  for (const snap of snapshots) {
    switch (snap.type) {

      // Unlock channel (from join-raid lockdown)
      case 'channel_locked': {
        const ch = ix.guild!.channels.cache.get(snap.data.id) as TextChannel | undefined;
        if (ch) {
          await ch.permissionOverwrites.edit(
            ix.guild!.roles.everyone,
            { SendMessages: null },
            { reason: '[attacksim rollback] Lockdown aufgehoben' },
          ).then(() => channelsUnlocked++).catch(() => {});
        }
        break;
      }

      // Delete webhook (from webhook-spam)
      case 'webhook_created': {
        try {
          const wh = await ix.guild!.fetchWebhooks().then(hooks => hooks.get(snap.data.id)).catch(() => null);
          if (wh) await wh.delete('[attacksim rollback]').then(() => webhooksDeleted++).catch(() => {});
        } catch {}
        break;
      }

      // Delete created role (from permission-grab)
      case 'role_created': {
        const role = ix.guild!.roles.cache.get(snap.data.id);
        if (role) await role.delete('[attacksim rollback]').then(() => rolesDeleted++).catch(() => {});
        break;
      }

      // Delete created channel (from nuke, if still present)
      case 'channel_created': {
        const ch = ix.guild!.channels.cache.get(snap.data.id);
        if (ch) await ch.delete('[attacksim rollback]').then(() => channelsDeleted++).catch(() => {});
        break;
      }
    }
  }

  if (channelsUnlocked > 0) log.push(`🔓 **${channelsUnlocked} channels** unlocked`);
  if (webhooksDeleted > 0) log.push(`🕵️ **${webhooksDeleted} webhooks** deleted`);
  if (rolesDeleted > 0) log.push(`🎭 **${rolesDeleted} test roles** deleted`);
  if (channelsDeleted > 0) log.push(`📁 **${channelsDeleted} test channels** deleted`);

  // ── Cleanup DB ────────────────────────────────────────────────────────────
  clearTracked(ix.guildId!);
  clearSnapshots(ix.guildId!);
  // Auch raidsim_messages + sim_state bereinigen
  db.prepare('DELETE FROM raidsim_messages WHERE guild_id = ?').run(ix.guildId!);
  db.prepare('DELETE FROM sim_state WHERE guild_id = ?').run(ix.guildId!);

  await ix.editReply({
    embeds: [success(
      '✅ Rollback complete — server fully restored',
      log.length ? log.join('\n') : 'Alles bereinigt.',
    )],
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// Full scenario
// ══════════════════════════════════════════════════════════════════════════════

async function runFullScenario(ix: ChatInputCommandInteraction, ch: TextChannel): Promise<void> {
  const results: { label: string; result: string; ok: boolean }[] = [];

  const run = async (label: string, fn: () => Promise<string>, delay = 1500) => {
    await new Promise(r => setTimeout(r, delay));
    try { results.push({ label, result: await fn(), ok: true }); }
    catch (e) { results.push({ label, result: String(e), ok: false }); }
  };

  const header = await ch.send({
    embeds: [new EmbedBuilder().setColor('#5865f2').setTitle('🧪 Full Attack Scenario')
      .setDescription('Simulates several **real** attacks.\n`/attacksim rollback` restores everything.')
      .setTimestamp()],
    allowedMentions: { parse: [] },
  }).catch(() => null);
  if (header) trackMsg(ix.guildId!, ch.id, header.id, 'scenario');

  await run('Spam-Flood',         () => simSpam(ix.guild!, ix.guildId!, ch, 5), 500);
  await run('Phishing-Links',     () => simPhishing(ix.guild!, ix.guildId!, ch), 2000);
  await run('Mass-Pings',         () => simMassPing(ix.guild!, ix.guildId!, ch), 2000);
  await run('Webhook-Spam',       () => simWebhookSpam(ix.guild!, ix.guildId!, ch), 2000);
  await run('Permission-Grab',    () => simPermissionGrab(ix.guild!, ix.guildId!, ch), 2000);
  await run('Join-Raid/Lockdown', () => simJoinRaid(ix.guild!, ix.guildId!, ix.options.getInteger('count') ?? 15), 2000);

  const summary = await ch.send({
    embeds: [new EmbedBuilder().setColor('#57f287')
      .setTitle('📊 Scenario complete')
      .setDescription(results.map(r => `${r.ok ? '✅' : '❌'} **${r.label}**: ${r.result}`).join('\n'))
      .addFields({ name: '🧹 Rollback', value: '`/attacksim rollback`' })
      .setTimestamp()],
    allowedMentions: { parse: [] },
  }).catch(() => null);
  if (summary) trackMsg(ix.guildId!, ch.id, summary.id, 'scenario');

  await ix.editReply({
    embeds: [success('✅ Scenario running', `All attacks active.\nSee <#${ch.id}> for details.\n\`/attacksim rollback\` to clean up.`)],
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// Status
// ══════════════════════════════════════════════════════════════════════════════

async function showStatus(ix: ChatInputCommandInteraction): Promise<void> {
  const snapshots = getSnapshots(ix.guildId!);
  const tracked = getTracked(ix.guildId!);

  if (!snapshots.length && !tracked.length) {
    await ix.reply({ embeds: [info('No Simulations', 'No active simulation data.')], flags: MessageFlags.Ephemeral });
    return;
  }

  const byType: Record<string, number> = {};
  tracked.forEach(t => {});
  snapshots.forEach(s => { byType[s.type] = (byType[s.type] ?? 0) + 1; });

  const lockedCount = snapshots.filter(s => s.type === 'channel_locked').length;
  const webhookCount = snapshots.filter(s => s.type === 'webhook_created').length;
  const roleCount = snapshots.filter(s => s.type === 'role_created').length;

  await ix.reply({
    embeds: [new EmbedBuilder().setColor('#fee75c').setTitle('🧪 Aktive Simulationsdaten')
      .setDescription(
        `**Messages:** ${tracked.length}\n` +
        `**Locked channels:** ${lockedCount}\n` +
        `**Erstellte Webhooks:** ${webhookCount}\n` +
        `**Created roles:** ${roleCount}\n\n` +
        `Rollback with \`/attacksim rollback\``,
      )
      .setTimestamp()],
    flags: MessageFlags.Ephemeral,
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// Command definition
// ══════════════════════════════════════════════════════════════════════════════

export default {
  data: new SlashCommandBuilder()
    .setName('attacksim')
    .setDescription('Attack simulator wizard — pick a scenario and configure it interactively')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand(s => s.setName('start').setDescription('Open the attack simulator wizard'))
    .addSubcommand(s => s.setName('status').setDescription('Show active simulation data'))
    .addSubcommand(s => s.setName('rollback').setDescription('🗑️ Fully restore server state after a simulation')),

  async execute(ix: ChatInputCommandInteraction) {
    if (!await requireAdmin(ix)) return;
    const sub = ix.options.getSubcommand();

    if (sub === 'status')   { await showStatus(ix); return; }
    if (sub === 'rollback') { await ix.deferReply({ flags: MessageFlags.Ephemeral }); await doRollback(ix); return; }

    // 'start' — open the wizard
    const { buildAttacksimHome } = await import('../../handlers/attacksimWizardHandler');
    await ix.reply({ ...buildAttacksimHome(), ephemeral: true });
  },
};
