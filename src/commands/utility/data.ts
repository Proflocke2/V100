/**
 * /data — GDPR Art. 17 command.
 *
 * info   — shows all stored data points
 * delete — shows confirmation buttons (handled in dataDeleteHandler.ts)
 *
 * FIX: no more inline collector (doesn't work on ephemeral replies
 * in discord.js v14). Buttons are caught globally in interactionCreate.ts
 * and forwarded to dataDeleteHandler.ts — the exact same pattern as
 * disclaimerHandler.ts for gambling.
 *
 * FIX: ticket_messages.author_id → user_id (column doesn't exist)
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import db from '../../database/db';
import { getGuild } from '../../database/db';

function count(sql: string, ...params: unknown[]): number {
  try {
    const row = db.prepare(sql).get(...(params as any[])) as { n: number } | undefined;
    return row?.n ?? 0;
  } catch { return 0; }
}

function getUserDataSummary(userId: string, guildId: string): Record<string, number> {
  return {
    xp_level:            count('SELECT COUNT(*) AS n FROM users WHERE id = ? AND guild_id = ?', userId, guildId),
    economy:             count('SELECT COUNT(*) AS n FROM economy_users WHERE user_id = ? AND guild_id = ?', userId, guildId),
    warnings:            count('SELECT COUNT(*) AS n FROM warnings WHERE user_id = ? AND guild_id = ?', userId, guildId),
    tickets:             count('SELECT COUNT(*) AS n FROM tickets WHERE user_id = ? AND guild_id = ?', userId, guildId),
    ticket_messages:     count('SELECT COUNT(*) AS n FROM ticket_messages WHERE user_id = ?', userId), // FIX: was author_id
    application_answers: count('SELECT COUNT(*) AS n FROM application_answers WHERE user_id = ? AND guild_id = ?', userId, guildId),
    verify_log:          count('SELECT COUNT(*) AS n FROM verify_log WHERE user_id = ? AND guild_id = ?', userId, guildId),
    security_incidents:  count('SELECT COUNT(*) AS n FROM security_incidents WHERE target_id = ? AND guild_id = ?', userId, guildId),
    mod_notes:           count('SELECT COUNT(*) AS n FROM mod_notes WHERE user_id = ? AND guild_id = ?', userId, guildId),
    quotes:              count('SELECT COUNT(*) AS n FROM quotes WHERE author_id = ? AND guild_id = ?', userId, guildId),
    reminders:           count('SELECT COUNT(*) AS n FROM reminders WHERE user_id = ?', userId),
    server_backup_messages: count('SELECT COUNT(*) AS n FROM server_backup_messages WHERE author_id = ? AND guild_id = ?', userId, guildId),
  };
}

export default {
  data: new SlashCommandBuilder()
    .setName('data')
    .setDescription('View or delete your personal data stored by this bot (GDPR Art. 17)')
    .addSubcommand(sub =>
      sub.setName('info').setDescription('Show all data stored about you on this server'),
    )
    .addSubcommand(sub =>
      sub.setName('delete').setDescription('Permanently delete ALL your data on this server'),
    ),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId!;
    const userId  = interaction.user.id;

    if (interaction.options.getSubcommand() === 'info') {
      const s     = getUserDataSummary(userId, guildId);
      const total = Object.values(s).reduce((a, b) => a + b, 0);

      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#5865f2')
          .setTitle('📋 Your stored data')
          .setDescription(
            `**${total}** total records on this server.\n` +
            `Use \`/data delete\` to permanently remove everything.\n` +
            `See the [Privacy Policy](${process.env.DOCS_URL ? process.env.DOCS_URL + '/privacy.html' : 'the docs/ folder in the repository'}) for full details.`,
          )
          .addFields(
            { name: '📊 XP & Level',            value: String(s.xp_level),            inline: true },
            { name: '💰 Economy',                value: String(s.economy),              inline: true },
            { name: '⚠️ Warnings',              value: String(s.warnings),             inline: true },
            { name: '🎫 Tickets opened',         value: String(s.tickets),              inline: true },
            { name: '💬 Ticket messages',        value: String(s.ticket_messages),      inline: true },
            { name: '📝 Application answers',    value: String(s.application_answers),  inline: true },
            { name: '✅ Verify log',             value: String(s.verify_log),           inline: true },
            { name: '🛡️ Security incidents',    value: String(s.security_incidents),   inline: true },
            { name: '🗒️ Mod notes',             value: String(s.mod_notes),            inline: true },
            { name: '💬 Quotes',                 value: String(s.quotes),               inline: true },
            { name: '⏰ Reminders',             value: String(s.reminders),            inline: true },
            { name: '💬 Logged chat messages',   value: String(s.server_backup_messages), inline: true },
          )
          .setTimestamp()],
        ephemeral: true,
      });
      return;
    }

    // delete — send confirm/cancel buttons
    // Button clicks are handled globally in interactionCreate → dataDeleteHandler
    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor('#fee75c')
        .setTitle('⚠️ Confirm data deletion')
        .setDescription(
          'This will **permanently delete** all data stored about you on this server:\n' +
          '• XP, level, economy balance\n' +
          '• Warnings, tickets, ticket messages\n' +
          '• Application answers, verify log, security incidents\n' +
          '• Reminders, giveaway entries\n\n' +
          '**This action cannot be undone.**',
        )],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('data_delete_confirm')
            .setLabel('Yes, delete everything')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️'),
          new ButtonBuilder()
            .setCustomId('data_delete_cancel')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary),
        ),
      ],
      ephemeral: true,
    });
  },
};
