import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { getGuild } from '../../database/db';
import { Language } from '../../utils/localization';
import db from '../../database/db';
import { success, error } from '../../utils/embeds';
import { parseDuration } from '../../utils/helpers';

function initTable() {
  // Ensure repeat columns exist (migration-safe)
  db.exec(`CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL, channel_id TEXT NOT NULL,
    message TEXT NOT NULL, remind_at INTEGER NOT NULL,
    done INTEGER DEFAULT 0, repeat_interval INTEGER DEFAULT 0
  )`);
  try { db.prepare('ALTER TABLE reminders ADD COLUMN repeat_interval INTEGER DEFAULT 0').run(); } catch {}
}

export default {
  data: new SlashCommandBuilder()
    .setName('remind')
    .setDescription('Set a reminder with optional repeat')
    .addStringOption(o => o.setName('time').setDescription('When (e.g. 10m, 2h, 1d)').setRequired(true))
    .addStringOption(o => o.setName('message').setDescription('What to remind you of').setRequired(true))
    .addStringOption(o => o.setName('repeat').setDescription('Repeat interval (daily, weekly, or e.g. 12h)')),

  async execute(ix: ChatInputCommandInteraction) {
    initTable();
    const time = ix.options.getString('time', true);
    const msg = ix.options.getString('message', true);
    const repeatStr = ix.options.getString('repeat');
    const ms = parseDuration(time);
    if (!ms) return ix.reply({ embeds: [error('Invalid time', 'Use: 10m, 2h, 1d')], ephemeral: true });

    let repeatMs = 0;
    if (repeatStr) {
      if (repeatStr === 'daily') repeatMs = 86400000;
      else if (repeatStr === 'weekly') repeatMs = 604800000;
      else { repeatMs = parseDuration(repeatStr) ?? 0; }
    }

    const remindAt = Math.floor((Date.now() + ms) / 1000);
    db.prepare('INSERT INTO reminders (user_id, channel_id, message, remind_at, repeat_interval) VALUES (?, ?, ?, ?, ?)')
      .run(ix.user.id, ix.channelId, msg, remindAt, Math.floor(repeatMs / 1000));

    const repeatText = repeatMs > 0 ? `\nRepeats every **${repeatStr}**` : '';
    await ix.reply({ embeds: [success('Reminder set', `<t:${remindAt}:R>: ${msg}${repeatText}`)], ephemeral: true });
  },
};
