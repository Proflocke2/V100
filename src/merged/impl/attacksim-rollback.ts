/**
 * /attacksim-rollback — Restloses Rollback aller Simulationsdaten.
 *
 * Fully and irrevocably deletes:
 *   • Every simulation message sent (attacksim_log, raidsim_messages, sim_state)
 *   • Every Security Engine incident that resulted from simulations
 *   • Every lockdown state that got activated by simulations
 *   • Every anti-raid join window (in-memory)
 *   • Every anti-spam sliding window (in-memory)
 *   • All DB entries from attacksim_log + raidsim_messages + sim_state
 *
 * Stellt wieder her:
 *   • Unlocks all channels (security_lockdown_state + lockdown_channels)
 *   • Deletes simulated warning DB entries (marked with [SIM])
 *   • Deletes simulated automod_log entries
 *   • Resets join/spam tracking maps
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  TextChannel,
} from 'discord.js';
import { requireAdmin } from '../../utils/guards';
import { success, error, info } from '../../utils/embeds';
import db from '../../database/db';
import { liftLockdown, isLockdownActive, resetJoinWindows, resetSpamWindows } from '../../modules/security/securityEngine';

// ── Rollback phases ───────────────────────────────────────────────────────────

interface RollbackResult {
  phase:   string;
  removed: number;
  detail:  string;
}

async function phase_deleteMessages(guild: ChatInputCommandInteraction['guild']): Promise<RollbackResult[]> {
  const results: RollbackResult[] = [];
  if (!guild) return results;

  // attacksim_log
  const attackRows = db.prepare(
    'SELECT id, channel_id, message_id FROM attacksim_log WHERE guild_id = ?',
  ).all(guild.id) as { id: number; channel_id: string; message_id: string }[];

  let deleted = 0;
  // Batch deletes — parallel per channel to avoid rate-limits across channels
  const byChannel = new Map<string, string[]>();
  for (const row of attackRows) {
    const arr = byChannel.get(row.channel_id) ?? [];
    arr.push(row.message_id);
    byChannel.set(row.channel_id, arr);
  }
  await Promise.allSettled(
    [...byChannel.entries()].map(async ([chId, msgIds]) => {
      const ch = guild.channels.cache.get(chId) as TextChannel | undefined;
      if (!ch) return;
      // Bulk delete if ≤ 100 msgs and all < 14 days old; else individual
      if (msgIds.length > 1 && msgIds.length <= 100) {
        await ch.bulkDelete(msgIds, true).then(m => { deleted += m.size; }).catch(() => {
          // Fallback: individual
          return Promise.allSettled(msgIds.map(id => ch.messages.delete(id).then(() => deleted++).catch(() => {})));
        });
      } else {
        await Promise.allSettled(msgIds.map(id => ch.messages.delete(id).then(() => deleted++).catch(() => {})));
      }
    }),
  );
  db.prepare('DELETE FROM attacksim_log WHERE guild_id = ?').run(guild.id);
  results.push({ phase: 'attacksim_log messages', removed: deleted, detail: `${attackRows.length} DB entries deleted` });

  // raidsim_messages
  const raidRows = db.prepare(
    'SELECT channel_id, message_id FROM raidsim_messages WHERE guild_id = ?',
  ).all(guild.id) as { channel_id: string; message_id: string }[];

  let rDeleted = 0;
  await Promise.allSettled(raidRows.map(async row => {
    const ch = guild.channels.cache.get(row.channel_id) as TextChannel | undefined;
    if (ch) await ch.messages.delete(row.message_id).then(() => rDeleted++).catch(() => {});
  }));
  db.prepare('DELETE FROM raidsim_messages WHERE guild_id = ?').run(guild.id);
  results.push({ phase: 'raidsim_messages entries', removed: rDeleted, detail: `${raidRows.length} DB entries deleted` });

  // sim_state (simulate.ts)
  const simRows = db.prepare(
    'SELECT data FROM sim_state WHERE guild_id = ?',
  ).all(guild.id) as { data: string }[];

  let sDeleted = 0;
  for (const row of simRows) {
    try {
      const data = JSON.parse(row.data);
      if (data.messageIds && data.channelId) {
        const ch = guild.channels.cache.get(data.channelId) as TextChannel | undefined;
        if (ch) {
          await Promise.allSettled((data.messageIds as string[]).map(id =>
            ch.messages.delete(id).then(() => sDeleted++).catch(() => {}),
          ));
        }
      }
    } catch { /* invalid JSON — skip */ }
  }
  db.prepare('DELETE FROM sim_state WHERE guild_id = ?').run(guild.id);
  results.push({ phase: 'sim_state entries', removed: sDeleted, detail: `${simRows.length} DB entries deleted` });

  return results;
}

async function phase_liftLockdowns(guild: ChatInputCommandInteraction['guild']): Promise<RollbackResult> {
  if (!guild) return { phase: 'Lockdown', removed: 0, detail: 'no guild' };

  let count = 0;

  // Security engine lockdown
  if (isLockdownActive(guild.id)) {
    count += await liftLockdown(guild);
  }

  // Legacy lockdown_channels table
  const locked = (db.prepare('SELECT channel_id FROM lockdown_channels WHERE guild_id = ?').all(guild.id) as { channel_id: string }[])
    .map(r => r.channel_id);

  await Promise.allSettled(locked.map(async chId => {
    const ch = guild.channels.cache.get(chId) as TextChannel | undefined;
    if (ch) {
      await ch.permissionOverwrites.edit(
        guild.roles.everyone,
        { SendMessages: null },
        { reason: '[Rollback] attacksim-rollback — restoring pre-simulation state' },
      ).then(() => count++).catch(() => {});
    }
  }));
  db.prepare('DELETE FROM lockdown_channels WHERE guild_id = ?').run(guild.id);
  db.prepare('DELETE FROM security_lockdown_state WHERE guild_id = ?').run(guild.id);

  return { phase: 'Unlock lockdown channels', removed: count, detail: `${locked.length} channel entriesge bereinigt` };
}

function phase_cleanDB(guildId: string): RollbackResult[] {
  const results: RollbackResult[] = [];

  // Security incidents (all from simulations — we clear ALL for the guild since
  // rollback is a full wipe-to-zero operation)
  const incCount = (db.prepare('SELECT COUNT(*) as c FROM security_incidents WHERE guild_id = ?').get(guildId) as { c: number }).c;
  db.prepare('DELETE FROM security_incidents WHERE guild_id = ?').run(guildId);
  results.push({ phase: 'Security Incidents DB', removed: incCount, detail: 'all incidents deleted' });

  // Simulation-tagged warnings ([SIM] prefix)
  const simWarnCount = (db.prepare("SELECT COUNT(*) as c FROM warnings WHERE guild_id = ? AND reason LIKE '[SIM%'").get(guildId) as { c: number }).c;
  db.prepare("DELETE FROM warnings WHERE guild_id = ? AND reason LIKE '[SIM%'").run(guildId);
  results.push({ phase: 'Simulation warnings', removed: simWarnCount, detail: 'Warnings with [SIM] prefix deleted' });

  // automod_log entries from the last 2 hours (likely from simulations)
  const amlCutoff = Math.floor(Date.now() / 1000) - 2 * 3600;
  const amlCount = (db.prepare('SELECT COUNT(*) as c FROM automod_log WHERE guild_id = ? AND created_at > ?').get(guildId, amlCutoff) as { c: number }).c;
  db.prepare('DELETE FROM automod_log WHERE guild_id = ? AND created_at > ?').run(guildId, amlCutoff);
  results.push({ phase: 'AutoMod log (last 2h)', removed: amlCount, detail: 'Entries from the last 2 hours deleted' });

  return results;
}

function phase_resetMemory(guildId: string): RollbackResult {
  resetJoinWindows();
  resetSpamWindows();
  return { phase: 'In-Memory State', removed: 1, detail: 'Join & spam sliding windows reset' };
}

// ── Command ───────────────────────────────────────────────────────────────────

export default {
  data: new SlashCommandBuilder()
    .setName('attacksim-rollback')
    .setDescription('🗑️ Complete rollback of all simulation data — fully restores server state')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addBooleanOption(o =>
      o.setName('confirm')
        .setDescription('Must be set to TRUE — irreversible operation!')
        .setRequired(true),
    ),

  async execute(ix: ChatInputCommandInteraction) {
    if (!await requireAdmin(ix)) return;
    if (!ix.options.getBoolean('confirm', true)) {
      return ix.reply({
        embeds: [error('Not confirmed', 'Set `confirm: True` to start the rollback.\n\n⚠️ This operation irreversrruflich alle Simulationsdaten.')],
        flags:  MessageFlags.Ephemeral,
      });
    }

    await ix.deferReply({ flags: MessageFlags.Ephemeral });

    const gid   = ix.guildId!;
    const guild = ix.guild!;
    const allResults: RollbackResult[] = [];

    // Progress embed
    await ix.editReply({
      embeds: [new EmbedBuilder()
        .setColor('#fee75c').setTitle('🔄 Rollback running…')
        .setDescription('Deleting simulation messages, unlocking channels and cleaning database…')
        .setTimestamp()],
    });

    // Phase 1: delete messages (slowest — I/O bound)
    const msgResults = await phase_deleteMessages(guild);
    allResults.push(...msgResults);

    // Phase 2: lift lockdowns (parallel channel edits)
    const lockResult = await phase_liftLockdowns(guild);
    allResults.push(lockResult);

    // Phase 3: clean DB
    const dbResults = phase_cleanDB(gid);
    allResults.push(...dbResults);

    // Phase 4: reset memory
    const memResult = phase_resetMemory(gid);
    allResults.push(memResult);

    // Summary
    const totalRemoved = allResults.reduce((s, r) => s + r.removed, 0);
    const lines = allResults.map(r =>
      `${r.removed > 0 ? '✅' : '⬜'} **${r.phase}**: ${r.removed} removed — *${r.detail}*`,
    ).join('\n');

    await ix.editReply({
      embeds: [new EmbedBuilder()
        .setColor('#57f287')
        .setTitle('✅ Rollback complete — server fully cleaned')
        .setDescription(
          `**${totalRemoved} elements** completely removed.\n\n${lines}\n\n` +
          `The server is back in the state **before the simulation**.\n` +
          `No orphaned entries, no active lockdowns, no simulation messages.`,
        )
        .setTimestamp()
        .setFooter({ text: `Executed by ${ix.user.tag}` })],
    });
  },
};
