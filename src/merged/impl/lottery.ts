import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder,
  ButtonBuilder, ButtonStyle, ActionRowBuilder, PermissionFlagsBits,
} from 'discord.js';
import db from '../../database/db';
import { getEconomyUser, addPoints } from '../../economy/db/EconomyDB';
import { success, error } from '../../utils/embeds';
import { requireAdmin } from '../../utils/guards';

const DEFAULT_TICKET_PRICE = 100;

function initTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS lottery (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      ticket_price INTEGER DEFAULT 100,
      draw_at INTEGER NOT NULL,
      drawn INTEGER DEFAULT 0,
      winner_id TEXT,
      pot INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS lottery_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lottery_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      purchased_at INTEGER DEFAULT (unixepoch()),
      UNIQUE(lottery_id, user_id)
    );
  `);
}

// Eager init at module load — same fix as polls: the lottery scheduler
// queries these tables every 60s from boot, so on a fresh database they
// spammed "no such table: lottery" into the error log until the first
// /lottery run created them. Module is loaded during command loading,
// before the scheduler starts.
initTables();

export default {
  data: new SlashCommandBuilder()
    .setName('lottery')
    .setDescription('Server lottery system')
    .addSubcommand(s => s.setName('buy').setDescription('Buy a lottery ticket for this draw'))
    .addSubcommand(s => s.setName('info').setDescription('View current lottery info'))
    .addSubcommand(s => s.setName('create').setDescription('[Admin] Create a new lottery draw')
      .addStringOption(o => o.setName('draw_time').setDescription('When to draw (e.g. 1d, 12h)').setRequired(true))
      .addIntegerOption(o => o.setName('ticket_price').setDescription('Ticket price in coins').setMinValue(1))),

  async execute(ix: ChatInputCommandInteraction) {
    initTables();
    const sub = ix.options.getSubcommand();
    const guildId = ix.guildId!;

    if (sub === 'info') {
      const lottery = db.prepare('SELECT * FROM lottery WHERE guild_id=? AND drawn=0 ORDER BY id DESC LIMIT 1').get(guildId) as any;
      if (!lottery) return ix.reply({ embeds: [new EmbedBuilder().setTitle('🎰 Lottery').setColor('#faa61a').setDescription('No active lottery. Admins can create one with `/lottery create`.')], ephemeral: true });
      const count = (db.prepare('SELECT COUNT(*) as c FROM lottery_tickets WHERE lottery_id=?').get(lottery.id) as any).c;
      return ix.reply({ embeds: [new EmbedBuilder().setTitle('🎰 Server Lottery').setColor('#faa61a')
        .addFields(
          { name: '🎟️ Ticket Price', value: `${lottery.ticket_price} coins`, inline: true },
          { name: '👥 Participants', value: String(count), inline: true },
          { name: '💰 Pot', value: `${lottery.pot.toLocaleString()} coins`, inline: true },
          { name: '⏰ Draw', value: `<t:${lottery.draw_at}:R>`, inline: true },
        )] });
    }

    if (sub === 'buy') {
      const lottery = db.prepare('SELECT * FROM lottery WHERE guild_id=? AND drawn=0 ORDER BY id DESC LIMIT 1').get(guildId) as any;
      if (!lottery) return ix.reply({ embeds: [error('No active lottery')], ephemeral: true });
      if (Math.floor(Date.now() / 1000) >= lottery.draw_at) return ix.reply({ embeds: [error('Lottery has ended')], ephemeral: true });

      const already = db.prepare('SELECT 1 FROM lottery_tickets WHERE lottery_id=? AND user_id=?').get(lottery.id, ix.user.id);
      if (already) return ix.reply({ embeds: [error('Already entered', 'You already have a ticket for this draw.')], ephemeral: true });

      const eco = getEconomyUser(ix.user.id, guildId);
      if (eco.points < lottery.ticket_price) return ix.reply({ embeds: [error('Insufficient funds', `Need ${lottery.ticket_price} coins`)], ephemeral: true });

      addPoints(ix.user.id, guildId, -lottery.ticket_price);
      db.prepare('INSERT INTO lottery_tickets (lottery_id, user_id, guild_id) VALUES (?,?,?)').run(lottery.id, ix.user.id, guildId);
      db.prepare('UPDATE lottery SET pot=pot+? WHERE id=?').run(lottery.ticket_price, lottery.id);

      const count = (db.prepare('SELECT COUNT(*) as c FROM lottery_tickets WHERE lottery_id=?').get(lottery.id) as any).c;
      return ix.reply({ embeds: [success('Ticket purchased!', `You entered the lottery!\n**${count}** participant(s) | Pot: **${(lottery.pot + lottery.ticket_price).toLocaleString()} coins**\nDraw: <t:${lottery.draw_at}:R>`)] });
    }

    if (sub === 'create') {
      if (!await requireAdmin(ix)) return;
      const active = db.prepare('SELECT 1 FROM lottery WHERE guild_id=? AND drawn=0').get(guildId);
      if (active) return ix.reply({ embeds: [error('Active lottery exists', 'Draw it first with the scheduler or wait for it to expire.')], ephemeral: true });

      const timeStr = ix.options.getString('draw_time', true);
      const price = ix.options.getInteger('ticket_price') ?? DEFAULT_TICKET_PRICE;
      const ms = parseTime(timeStr);
      if (!ms) return ix.reply({ embeds: [error('Invalid time', 'Use: 1h, 12h, 1d, 2d')], ephemeral: true });
      const drawAt = Math.floor((Date.now() + ms) / 1000);
      db.prepare('INSERT INTO lottery (guild_id, ticket_price, draw_at) VALUES (?,?,?)').run(guildId, price, drawAt);
      return ix.reply({ embeds: [success('Lottery created!', `Ticket price: **${price} coins**\nDraw: <t:${drawAt}:R>`)] });
    }
  },
};

function parseTime(s: string): number | null {
  const m = s.match(/^(\d+)(m|h|d)$/);
  if (!m) return null;
  const [, n, u] = m;
  const mul: Record<string, number> = { m: 60000, h: 3600000, d: 86400000 };
  return parseInt(n) * mul[u];
}
