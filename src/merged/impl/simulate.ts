/**
 * /simulate — raid & attack simulator.
 *
 * Simulates typical server attacks to test security features.
 * All simulations are fully reversible.
 *
 * Subcommands:
 *   raid        — Simuliert einen Join-Spike (X fake Joins in kurzer Zeit)
 *   spam        — Simuliert einen Spam-Angriff (X Nachrichten in Y Sekunden)
 *   masspings   — Simulate a mass-mention attack
 *   phishing    — Postet einen simulierten Phishing-Link
 *   status      — Show all active simulations
 *   cleanup     — Undoes all simulations
 */

import {
  SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits,
  EmbedBuilder, TextChannel, MessageFlags, ChannelType,
} from 'discord.js';
import { requireAdmin } from '../../utils/guards';
import { success, error, info } from '../../utils/embeds';
import db from '../../database/db';
import {
  testInjectJoins, testInjectSpam, testInjectContent,
} from '../../modules/security/securityEngine';

// ── Simulation state — tracks everything for cleanup ─────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS sim_state (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id    TEXT NOT NULL,
    type        TEXT NOT NULL,
    data        TEXT NOT NULL DEFAULT '{}',
    created_at  INTEGER DEFAULT (unixepoch())
  );
`);

interface SimRecord { id: number; guild_id: string; type: string; data: string; created_at: number; }

function addSimRecord(guildId: string, type: string, data: object): number {
  const r = db.prepare('INSERT INTO sim_state (guild_id, type, data) VALUES (?, ?, ?)').run(guildId, type, JSON.stringify(data));
  return r.lastInsertRowid as number;
}

function getSimRecords(guildId: string): SimRecord[] {
  return db.prepare('SELECT * FROM sim_state WHERE guild_id = ? ORDER BY created_at DESC').all(guildId) as SimRecord[];
}

function removeSimRecord(id: number) {
  db.prepare('DELETE FROM sim_state WHERE id = ?').run(id);
}

function clearSimRecords(guildId: string) {
  db.prepare('DELETE FROM sim_state WHERE guild_id = ?').run(guildId);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getTextChannel(ix: ChatInputCommandInteraction): Promise<TextChannel | null> {
  const chOpt = ix.options.getChannel('channel');
  if (chOpt) return chOpt as TextChannel;
  if (ix.channel?.type === ChannelType.GuildText) return ix.channel as TextChannel;
  return null;
}

// ── Command ───────────────────────────────────────────────────────────────────

export default {
  data: new SlashCommandBuilder()
    .setName('simulate')
    .setDescription('Simulate server attacks to test security features')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)

    .addSubcommand(s => s.setName('raid').setDescription('Simulate a raid (join spike — triggers anti-raid logs)')
      .addIntegerOption(o => o.setName('count').setDescription('Number of simulated joins (default: 12)').setMinValue(3).setMaxValue(30))
      .addChannelOption(o => o.setName('channel').setDescription('Channel for simulation report').addChannelTypes(ChannelType.GuildText)))

    .addSubcommand(s => s.setName('spam').setDescription('Simulate a spam attack (X messages in rapid succession)')
      .addChannelOption(o => o.setName('channel').setDescription('Channel for spam').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addIntegerOption(o => o.setName('count').setDescription('Number of messages (default: 15)').setMinValue(5).setMaxValue(50))
      .addBooleanOption(o => o.setName('delete_after').setDescription('Delete messages after test? (default: yes)')))

    .addSubcommand(s => s.setName('masspings').setDescription('Simulate a mass-mention attack')
      .addChannelOption(o => o.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addIntegerOption(o => o.setName('count').setDescription('Number of messages (default: 5)').setMinValue(1).setMaxValue(10))
      .addBooleanOption(o => o.setName('delete_after').setDescription('Delete messages after test? (default: yes)')))

    .addSubcommand(s => s.setName('phishing').setDescription('Post a harmless simulated phishing link (not a real link)')
      .addChannelOption(o => o.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addBooleanOption(o => o.setName('delete_after').setDescription('Delete message after test? (default: yes)')))

    .addSubcommand(s => s.setName('lockdown-test').setDescription('Test the lockdown flow without a real lockdown — visual simulation only'))

    .addSubcommand(s => s.setName('status').setDescription('Show all active simulations'))
    .addSubcommand(s => s.setName('cleanup').setDescription('Undo all running simulations')),

  async execute(ix: ChatInputCommandInteraction) {
    if (!await requireAdmin(ix)) return;
    const sub = ix.options.getSubcommand();
    const gid = ix.guildId!;

    // ── Status ──────────────────────────────────────────────────────────────
    if (sub === 'status') {
      const records = getSimRecords(gid);
      if (records.length === 0) {
        return ix.reply({ embeds: [info('No active simulations', 'Start with `/simulate raid`, `/simulate spam` or `/simulate phishing`.')], flags: MessageFlags.Ephemeral });
      }
      const embed = new EmbedBuilder()
        .setColor('#fee75c')
        .setTitle('🧪 Active Simulations')
        .setDescription(
          records.map(r => {
            const data = JSON.parse(r.data);
            const age = Math.floor((Date.now() / 1000) - r.created_at);
            return `**#${r.id}** \`${r.type}\` — ${age}s ago — ${data.summary ?? ''}`;
          }).join('\n')
        )
        .setFooter({ text: 'Use /simulate cleanup to clean up' });
      return ix.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // ── Cleanup ─────────────────────────────────────────────────────────────
    if (sub === 'cleanup') {
      await ix.deferReply({ flags: MessageFlags.Ephemeral });
      const records = getSimRecords(gid);
      let cleaned = 0;
      const errors: string[] = [];

      for (const rec of records) {
        const data = JSON.parse(rec.data);

        if (rec.type === 'spam' || rec.type === 'masspings' || rec.type === 'phishing') {
          // Delete stored message IDs
          if (data.messageIds && data.channelId) {
            const ch = ix.guild?.channels.cache.get(data.channelId) as TextChannel | undefined;
            if (ch) {
              for (const msgId of data.messageIds) {
                await ch.messages.delete(msgId).catch(() => {});
              }
            }
          }
          cleaned++;
        }

        if (rec.type === 'lockdown') {
          // Re-enable locked channels
          if (data.channelIds) {
            for (const chId of data.channelIds) {
              const ch = ix.guild?.channels.cache.get(chId) as TextChannel | undefined;
              if (ch) {
                await ch.permissionOverwrites.edit(ix.guild!.roles.everyone, { SendMessages: null }).catch(() => {});
              }
            }
          }
          cleaned++;
        }

        removeSimRecord(rec.id);
      }

      clearSimRecords(gid);
      return ix.editReply({
        embeds: [success('🧹 Cleanup complete', `${cleaned} simulation(s) cleaned up.${errors.length > 0 ? `\n⚠️ ${errors.join('\n')}` : ''}`)],
      });
    }

    // ── Raid Simulation ─────────────────────────────────────────────────────
    if (sub === 'raid') {
      await ix.deferReply({ flags: MessageFlags.Ephemeral });
      const count = ix.options.getInteger('count') ?? 12;
      const ch    = await getTextChannel(ix) ?? ix.channel as TextChannel;

      // Inject directly into the engine — bypasses bot/admin guard clauses
      const result = await testInjectJoins(ix.guild!, count);

      const statusLine = result.triggered
        ? `✅ Engine triggered! Joins: **${result.joins}** — Action: **${result.action}**`
        : `⚠️ Threshold not yet reached (${result.joins} joins, threshold: ${(await import('../../modules/security/securityEngine').then(m => m.getSecurityConfig(gid))).raid_threshold})`;

      const msg = await ch.send({
        embeds: [new EmbedBuilder()
          .setColor(result.triggered ? '#ed4245' : '#fee75c')
          .setTitle(`🚨 [SIM] Raid — ${count} joins injected`)
          .setDescription(
            `${statusLine}\n\n` +
            (result.triggered
              ? `The security engine has responded. Check the log channel and whether a lockdown is active.`
              : `Increase the join count or lower the threshold in \`/security-config\`.`),
          )
          .setTimestamp()],
      }).catch(() => null);

      addSimRecord(gid, 'raid', {
        summary: `${count} joins → Engine: ${result.action}`,
        messageIds: msg ? [msg.id] : [],
        channelId: ch.id,
      });

      return ix.editReply({ embeds: [success('🧪 Raid Simulation', statusLine)] });
    }

    // ── Spam Simulation ─────────────────────────────────────────────────────
    if (sub === 'spam') {
      await ix.deferReply({ flags: MessageFlags.Ephemeral });
      const count      = ix.options.getInteger('count') ?? 15;
      const deleteAfter = ix.options.getBoolean('delete_after') ?? true;
      const ch         = ix.options.getChannel('channel', true) as TextChannel;

      // Inject directly into engine — bypasses bot/admin guard clauses
      const result = await testInjectSpam(ix.guild!, ch, count);

      const statusLine = result.triggered
        ? `✅ Engine triggered! Messages: **${result.msgCount}** — Action: **${result.action}**`
        : `⚠️ Threshold not yet reached (${result.msgCount} messages)`;

      addSimRecord(gid, 'spam', {
        summary: `${count} spam messages → Engine: ${result.action}`,
        messageIds: [],
        channelId: ch.id,
        deleteAfter,
      });

      return ix.editReply({ embeds: [success('🧪 Spam Simulation', statusLine)] });
    }

    // ── Mass-Ping Simulation ────────────────────────────────────────────────
    if (sub === 'masspings') {
      await ix.deferReply({ flags: MessageFlags.Ephemeral });
      const count      = ix.options.getInteger('count') ?? 5;
      const deleteAfter = ix.options.getBoolean('delete_after') ?? true;
      const ch         = ix.options.getChannel('channel', true) as TextChannel;

      // Inject mass-ping content directly into engine
      const content = '@everyone @here @admin FREE NITRO CLICK NOW discord.gg/fake';
      const result  = await testInjectContent(ix.guild!, ch, content, 'sim-pinger');

      // Also inject into spam window to trigger anti-spam too
      await testInjectSpam(ix.guild!, ch, count, 'sim-pinger');

      const statusLine = `Ping simulation injected (${count}x). Engine reaction: **${result.type || 'logged'}**`;

      addSimRecord(gid, 'masspings', {
        summary: statusLine,
        messageIds: [],
        channelId: ch.id,
      });

      return ix.editReply({ embeds: [success('🧪 Mass-Ping Simulation', statusLine)] });
    }

    // ── Phishing Simulation ─────────────────────────────────────────────────
    if (sub === 'phishing') {
      await ix.deferReply({ flags: MessageFlags.Ephemeral });
      const deleteAfter = ix.options.getBoolean('delete_after') ?? true;
      const ch          = ix.options.getChannel('channel', true) as TextChannel;

      // Inject real phishing URL pattern directly into engine
      const phishingContent = 'free nitro: discord-gift-claim.example-sim.invalid/nitro';
      const result = await testInjectContent(ix.guild!, ch, phishingContent, 'sim-phisher');

      const statusLine = result.triggered
        ? `✅ Phishing detected! Type: **${result.type}** — Engine responded`
        : `⚠️ Phishing filter not active — enable with \`/security-config\``;

      addSimRecord(gid, 'phishing', {
        summary: `Phishing injected → ${result.type}`,
        messageIds: [],
        channelId: ch.id,
      });

      return ix.editReply({ embeds: [success('🧪 Phishing Simulation', statusLine)] });
    }

    // ── Lockdown Test ───────────────────────────────────────────────────────
    if (sub === 'lockdown-test') {
      const embed = new EmbedBuilder()
        .setColor('#5865f2')
        .setTitle('🔒 Lockdown Test (Simulation)')
        .setDescription(
          '**What happens during a real lockdown:**\n\n' +
          '1. `/lockdown start` locks all text channels\n' +
          '2. @everyone loses the SendMessages permission\n' +
          '3. A lockdown message appears in every channel\n' +
          '4. `/lockdown end` unlocks all channels\n\n' +
          '**Anti-Raid Auto-Lockdown:**\n' +
          'On detected raid → automatic lockdown for 5 minutes\n\n' +
          '> Run a real test with `/lockdown start` in a test channel.\n' +
          '> Or `/simulate raid` with severity `high` in `/security-config`.'
        )
        .addFields(
          { name: '⚙️ Manual command', value: '`/lockdown start [channel] [reason]`', inline: true },
          { name: '🔓 Lift', value: '`/lockdown end`', inline: true },
        )
        .setTimestamp();

      return ix.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  },
};
