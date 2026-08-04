/**
 * dataDeleteHandler.ts
 *
 * Handles the confirm/cancel buttons from /data delete.
 * Routed from interactionCreate.ts — same pattern as disclaimerHandler.ts.
 *
 * WHY SEPARATE FILE: ephemeral replies in discord.js v14 do not support
 * channel-level message collectors. The only reliable approach is to let
 * the global interactionCreate handler catch the ButtonInteraction and
 * dispatch here — no collector, no timeout race condition.
 */

import {
  ButtonInteraction,
  EmbedBuilder,
} from 'discord.js';
import db from '../database/db';
import { deleteUserMessages } from '../modules/serverBackup/messages';

// ── Deletion logic (same as data.ts) ──────────────────────────────────────

function deleteUserData(userId: string, guildId: string): Record<string, number> {
  const deleted: Record<string, number> = {};

  db.transaction(() => {
    deleted.xp_level  = db.prepare('DELETE FROM users WHERE id = ? AND guild_id = ?').run(userId, guildId).changes;
    deleted.economy   = db.prepare('DELETE FROM economy_users WHERE user_id = ? AND guild_id = ?').run(userId, guildId).changes;
    deleted.warnings  = db.prepare('DELETE FROM warnings WHERE user_id = ? AND guild_id = ?').run(userId, guildId).changes;

    // FIX: column is user_id, NOT author_id
    deleted.ticket_messages = db.prepare('DELETE FROM ticket_messages WHERE user_id = ?').run(userId).changes;

    const ticketIds = (db.prepare(
      'SELECT id FROM tickets WHERE user_id = ? AND guild_id = ?'
    ).all(userId, guildId) as { id: number }[]).map(r => r.id);

    for (const tid of ticketIds) {
      db.prepare('DELETE FROM ticket_messages WHERE ticket_id = ?').run(tid);
    }
    deleted.tickets = db.prepare('DELETE FROM tickets WHERE user_id = ? AND guild_id = ?').run(userId, guildId).changes;

    deleted.application_answers = db.prepare(
      'DELETE FROM application_answers WHERE user_id = ? AND guild_id = ?'
    ).run(userId, guildId).changes;

    try {
      deleted.verify_log = db.prepare('DELETE FROM verify_log WHERE user_id = ? AND guild_id = ?').run(userId, guildId).changes;
    } catch { deleted.verify_log = 0; }

    try {
      deleted.security_incidents = db.prepare(
        'DELETE FROM security_incidents WHERE target_id = ? AND guild_id = ?'
      ).run(userId, guildId).changes;
    } catch { deleted.security_incidents = 0; }

    // Moderator notes about this user (user is the data subject)
    try {
      deleted.mod_notes = db.prepare(
        'DELETE FROM mod_notes WHERE user_id = ? AND guild_id = ?'
      ).run(userId, guildId).changes;
    } catch { deleted.mod_notes = 0; }

    // Quotes authored by this user
    try {
      deleted.quotes = db.prepare(
        'DELETE FROM quotes WHERE author_id = ? AND guild_id = ?'
      ).run(userId, guildId).changes;
    } catch { deleted.quotes = 0; }

    deleted.reminders = db.prepare('DELETE FROM reminders WHERE user_id = ?').run(userId).changes;

    const giveaways = db.prepare(
      "SELECT id, participants FROM giveaways WHERE guild_id = ? AND participants LIKE ?"
    ).all(guildId, `%${userId}%`) as { id: number; participants: string }[];

    let gwCleaned = 0;
    for (const gw of giveaways) {
      try {
        const parts: string[] = JSON.parse(gw.participants);
        const filtered = parts.filter(p => p !== userId);
        if (filtered.length !== parts.length) {
          db.prepare('UPDATE giveaways SET participants = ? WHERE id = ?').run(JSON.stringify(filtered), gw.id);
          gwCleaned++;
        }
      } catch { /* malformed JSON */ }
    }
    deleted.giveaway_entries = gwCleaned;

    // Server-Backup message log (see modules/serverBackup/messages.ts) —
    // separate table, separate module, but still the user's own data and
    // therefore still in scope for this deletion.
    deleted.server_backup_messages = deleteUserMessages(userId, guildId);
  })();

  return deleted;
}

// ── Button handler ────────────────────────────────────────────────────────

export async function handleDataDeleteButton(btn: ButtonInteraction): Promise<void> {
  const userId  = btn.user.id;
  const guildId = btn.guildId!;

  if (btn.customId === 'data_delete_cancel') {
    await btn.update({
      embeds: [new EmbedBuilder().setColor('#57f287')
        .setDescription('✅ Deletion cancelled. Your data is untouched.')],
      components: [],
    });
    return;
  }

  // Confirm — defer so we have time to run the transaction
  await btn.deferUpdate();

  const deleted = deleteUserData(userId, guildId);
  const total   = Object.values(deleted).reduce((a, c) => a + c, 0);

  const lines = Object.entries(deleted)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `• **${k.replace(/_/g, ' ')}**: ${n} record(s)`);

  await btn.editReply({
    embeds: [new EmbedBuilder()
      .setColor('#57f287')
      .setTitle('✅ Data deleted')
      .setDescription(
        `All your data on this server has been permanently removed.\n\n` +
        (lines.length ? lines.join('\n') : '*No records were found.*') +
        `\n\n**Total deleted: ${total} record(s)**`,
      )
      .setTimestamp()],
    components: [],
  });
}
