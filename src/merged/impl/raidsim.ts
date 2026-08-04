/**
 * /raidsim — raid & attack simulator.
 *
 * Simulates typical server attacks for testing purposes.
 * All simulations are fully reversible.
 *
 * Szenarien:
 *   join-flood   — simulates a sudden mass-join (fake member count in the log)
 *   spam-flood   — posts spam messages in a channel (deletable)
 *   mass-ping    — posts messages with many mentions (deletable)
 *   phishing-msg — posts typical phishing messages (deletable)
 *   caps-flood   — posts ALL-CAPS spam (deletable)
 *   rollback     — deletes all simulation messages for this server
 */

import {
  SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits,
  EmbedBuilder, TextChannel, ChannelType, MessageFlags,
} from 'discord.js';
import { requireAdmin } from '../../utils/guards';
import { success, error, info } from '../../utils/embeds';
import db from '../../database/db';

// ── Persistent tracking (for rollback) ───────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS raidsim_messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id    TEXT NOT NULL,
    channel_id  TEXT NOT NULL,
    message_id  TEXT NOT NULL,
    scenario    TEXT NOT NULL,
    created_at  INTEGER DEFAULT (unixepoch())
  );
`);

function trackMessage(guildId: string, channelId: string, messageId: string, scenario: string) {
  db.prepare('INSERT INTO raidsim_messages (guild_id, channel_id, message_id, scenario) VALUES (?, ?, ?, ?)')
    .run(guildId, channelId, messageId, scenario);
}

function getTrackedMessages(guildId: string): { channel_id: string; message_id: string; scenario: string }[] {
  return db.prepare('SELECT channel_id, message_id, scenario FROM raidsim_messages WHERE guild_id = ? ORDER BY id DESC')
    .all(guildId) as { channel_id: string; message_id: string; scenario: string }[];
}

function clearTracked(guildId: string) {
  db.prepare('DELETE FROM raidsim_messages WHERE guild_id = ?').run(guildId);
}

// ── Fake content libraries ────────────────────────────────────────────────────

const SPAM_MESSAGES = [
  'BUY DISCORD NITRO FREE 🎮🎮🎮',
  'click here for free robux: https://totally-legit.example.com',
  'JOIN MY SERVER!!!! BEST SERVER EVER!!!',
  'FREE GIVEAWAY CLICK NOW LIMITED TIME',
  '🔥🔥🔥 RAID THIS SERVER 🔥🔥🔥',
];

const PHISHING_MESSAGES = [
  '🎁 You received a free Discord Nitro! Claim at: discord-nitro-gift.example.com',
  'Steam gift card: steamcommunity.example.com/gift/abc123 expires in 5min!',
  'Someone sent you 1000$ via PayPal! Verify at: paypa1-secure.example.com',
  '⚠️ Your account will be BANNED unless you verify: discordapp.com.auth-check.example.com',
  'FREE NITRO CLASSIC LIMITED: dlscord-gifts.example.com/nitro?ref=1234',
];

const CAPS_MESSAGES = [
  'HEY EVERYONE LOOK AT ME I AM SHOUTING EVERYTHING!!!',
  'THIS IS A RAID YOU CANNOT STOP US WE ARE EVERYWHERE',
  'ADMIN IS STUPID AND THE SERVER IS BAD JOIN OURS INSTEAD',
  'BAN ME I DARE YOU, YOUR MOD TEAM IS USELESS LMAO',
  'SPAMMING IN CAPS BECAUSE I HAVE NOTHING BETTER TO DO',
];

// ── Scenarios ─────────────────────────────────────────────────────────────────

async function simJoinFlood(ix: ChatInputCommandInteraction, count: number): Promise<void> {
  const gid = ix.guildId!;
  const logChannelId = (db.prepare('SELECT mod_log_channel FROM guilds WHERE id = ?').get(gid) as { mod_log_channel: string | null } | undefined)?.mod_log_channel;

  const embed = new EmbedBuilder()
    .setColor('#ed4245')
    .setTitle('🚨 [SIM] JOIN FLOOD DETECTED')
    .setDescription(
      `⚠️ **This is a simulation.**\n\n` +
      `In a real scenario **${count} accounts** would join within 10 seconds.\n\n` +
      `**Anti-Raid** would automatically:\n` +
      `• Kick / ban (depending on configuration)\n` +
      `• Put the server into lockdown\n` +
      `• Post this notice in the log channel`,
    )
    .addFields(
      { name: '📊 Simulated Joins', value: `${count} accounts`, inline: true },
      { name: '⏱️ Time Window', value: '10 seconds', inline: true },
      { name: '🤖 Bot Response', value: 'Anti-Raid would respond', inline: true },
    )
    .setFooter({ text: '🔬 Simulation — not a real attack • /raidsim rollback to clean up' })
    .setTimestamp();

  // Post in log channel if configured
  if (logChannelId) {
    const logCh = ix.guild!.channels.cache.get(logChannelId) as TextChannel | undefined;
    if (logCh) {
      const msg = await logCh.send({ embeds: [embed] }).catch(() => null);
      if (msg) trackMessage(gid, logCh.id, msg.id, 'join-flood');
    }
  }

  // Also show in current channel
  const chMsg = await (ix.channel as TextChannel).send({ embeds: [embed] }).catch(() => null);
  if (chMsg) trackMessage(gid, ix.channelId!, chMsg.id, 'join-flood');

  await ix.editReply({
    embeds: [success(
      '✅ Join Flood Simulated',
      `${count} simulated joins were written to the log.\n` +
      `**Test now:** Is Anti-Raid active? (\`/antiraid status\`)\n` +
      `**Cleanup:** \`/raidsim rollback\``,
    )],
  });
}

async function simSpamFlood(ix: ChatInputCommandInteraction, channel: TextChannel, rounds: number): Promise<void> {
  const gid = ix.guildId!;
  const messages: string[] = [];
  for (let i = 0; i < rounds; i++) {
    messages.push(SPAM_MESSAGES[i % SPAM_MESSAGES.length]);
  }

  const notice = await channel.send({
    embeds: [new EmbedBuilder()
      .setColor('#fee75c')
      .setTitle('🔬 [SIM] Spam Flood Starting...')
      .setDescription(`Simulating ${rounds} spam messages. Does AutoMod react?`)
      .setFooter({ text: 'Simulation — /raidsim rollback to delete' })],
  }).catch(() => null);
  if (notice) trackMessage(gid, channel.id, notice.id, 'spam-flood');

  for (const text of messages) {
    await new Promise(r => setTimeout(r, 400)); // avoid actual rate limit
    const msg = await channel.send(`[SIM] ${text}`).catch(() => null);
    if (msg) trackMessage(gid, channel.id, msg.id, 'spam-flood');
  }

  await ix.editReply({
    embeds: [success(
      '✅ Spam Flood Simulated',
      `${rounds} spam messages posted in ${channel}.\n` +
      `**Test:** Did AutoMod intervene?\n` +
      `**Cleanup:** \`/raidsim rollback\``,
    )],
  });
}

async function simMassPing(ix: ChatInputCommandInteraction, channel: TextChannel): Promise<void> {
  const gid = ix.guildId!;
  const roles = ix.guild!.roles.cache.filter(r => !r.managed && r.id !== ix.guild!.id).first(3);
  const roleMentions = roles.map(r => r.toString()).join(' ');

  const msgs = [
    `[SIM] @everyone @here ${roleMentions} PING PING PING EVERYONE`,
    `[SIM] HEY ${roleMentions} LOOK AT THIS IMPORTANT MESSAGE`,
    `[SIM] ATTENTION ${roleMentions} @everyone JOIN OUR RAID SERVER`,
  ];

  for (const text of msgs) {
    await new Promise(r => setTimeout(r, 500));
    const msg = await channel.send({ content: text, allowedMentions: { parse: [] } }).catch(() => null);
    if (msg) trackMessage(gid, channel.id, msg.id, 'mass-ping');
  }

  await ix.editReply({
    embeds: [success(
      '✅ Mass Ping Simulated',
      `3 messages with many mentions in ${channel}.\n` +
      `**Test:** Does Anti-Mass-Ping (\`/automod3 masspings\`) react?\n` +
      `**Cleanup:** \`/raidsim rollback\``,
    )],
  });
}

async function simPhishing(ix: ChatInputCommandInteraction, channel: TextChannel): Promise<void> {
  const gid = ix.guildId!;

  const notice = await channel.send({
    embeds: [new EmbedBuilder()
      .setColor('#ed4245')
      .setTitle('🔬 [SIM] Phishing Messages')
      .setDescription('Simulates typical phishing messages. Does the filter react?')
      .setFooter({ text: 'Simulation — /raidsim rollback to delete' })],
  }).catch(() => null);
  if (notice) trackMessage(gid, channel.id, notice.id, 'phishing');

  for (const text of PHISHING_MESSAGES) {
    await new Promise(r => setTimeout(r, 600));
    const msg = await channel.send(`[SIM] ${text}`).catch(() => null);
    if (msg) trackMessage(gid, channel.id, msg.id, 'phishing');
  }

  await ix.editReply({
    embeds: [success(
      '✅ Phishing Simulation Started',
      `${PHISHING_MESSAGES.length} phishing messages in ${channel}.\n` +
      `**Test:** Did the phishing filter (\`/automod3 phishing\`) react?\n` +
      `**Cleanup:** \`/raidsim rollback\``,
    )],
  });
}

async function simCapsFlood(ix: ChatInputCommandInteraction, channel: TextChannel): Promise<void> {
  const gid = ix.guildId!;

  for (const text of CAPS_MESSAGES) {
    await new Promise(r => setTimeout(r, 400));
    const msg = await channel.send(`[SIM] ${text}`).catch(() => null);
    if (msg) trackMessage(gid, channel.id, msg.id, 'caps-flood');
  }

  await ix.editReply({
    embeds: [success(
      '✅ Caps Flood Simulated',
      `${CAPS_MESSAGES.length} ALL-CAPS messages in ${channel}.\n` +
      `**Test:** Did Anti-Caps (\`/automod anticaps\`) react?\n` +
      `**Cleanup:** \`/raidsim rollback\``,
    )],
  });
}

async function doRollback(ix: ChatInputCommandInteraction): Promise<void> {
  const gid = ix.guildId!;
  const tracked = getTrackedMessages(gid);

  if (tracked.length === 0) {
    await ix.editReply({ embeds: [info('Rollback', 'No simulation messages found.')] });
    return;
  }

  let deleted = 0;
  let failed = 0;

  for (const row of tracked) {
    const ch = ix.guild!.channels.cache.get(row.channel_id) as TextChannel | undefined;
    if (!ch) { failed++; continue; }
    try {
      await ch.messages.delete(row.message_id);
      deleted++;
    } catch {
      failed++;
    }
    await new Promise(r => setTimeout(r, 300));
  }

  clearTracked(gid);

  await ix.editReply({
    embeds: [success(
      '🗑️ Rollback complete',
      `**${deleted}** simulation message(s) deleted.\n` +
      (failed > 0 ? `⚠️ ${failed} could not be deleted (possibly already gone).` : ''),
    )],
  });
}

// ── Command ───────────────────────────────────────────────────────────────────

export default {
  data: new SlashCommandBuilder()
    .setName('raidsim')
    .setDescription('Raid and attack simulator — test your security measures')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)

    .addSubcommand(s => s.setName('join-flood').setDescription('Simulates a mass-join (in the log)')
      .addIntegerOption(o => o.setName('count').setDescription('Number of simulated joins (default: 15)')
        .setMinValue(5).setMaxValue(50)))

    .addSubcommand(s => s.setName('spam-flood').setDescription('Posts spam messages in a channel')
      .addChannelOption(o => o.setName('channel').setDescription('Target channel').setRequired(true)
        .addChannelTypes(ChannelType.GuildText))
      .addIntegerOption(o => o.setName('count').setDescription('Number of messages (default: 5, max: 10)')
        .setMinValue(1).setMaxValue(10)))

    .addSubcommand(s => s.setName('mass-ping').setDescription('Simulates a mass-ping attack')
      .addChannelOption(o => o.setName('channel').setDescription('Target channel').setRequired(true)
        .addChannelTypes(ChannelType.GuildText)))

    .addSubcommand(s => s.setName('phishing').setDescription('Simulates phishing messages')
      .addChannelOption(o => o.setName('channel').setDescription('Target channel').setRequired(true)
        .addChannelTypes(ChannelType.GuildText)))

    .addSubcommand(s => s.setName('caps-flood').setDescription('Simulates ALL-CAPS spam')
      .addChannelOption(o => o.setName('channel').setDescription('Target channel').setRequired(true)
        .addChannelTypes(ChannelType.GuildText)))

    .addSubcommand(s => s.setName('rollback').setDescription('Deletes ALL simulation messages on this server')),

  async execute(ix: ChatInputCommandInteraction) {
    if (!await requireAdmin(ix)) return;
    await ix.deferReply({ flags: MessageFlags.Ephemeral });

    const sub = ix.options.getSubcommand();
    const gid = ix.guildId!;

    if (sub === 'join-flood') {
      const count = ix.options.getInteger('count') ?? 15;
      await simJoinFlood(ix, count);
      return;
    }

    const ch = ix.options.getChannel('channel') as TextChannel | null;

    if (sub === 'spam-flood') {
      if (!ch) return;
      const count = ix.options.getInteger('count') ?? 5;
      await simSpamFlood(ix, ch, count);
      return;
    }

    if (sub === 'mass-ping') {
      if (!ch) return;
      await simMassPing(ix, ch);
      return;
    }

    if (sub === 'phishing') {
      if (!ch) return;
      await simPhishing(ix, ch);
      return;
    }

    if (sub === 'caps-flood') {
      if (!ch) return;
      await simCapsFlood(ix, ch);
      return;
    }

    if (sub === 'rollback') {
      await doRollback(ix);
      return;
    }
  },
};
