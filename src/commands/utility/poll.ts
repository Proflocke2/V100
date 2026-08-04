import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ButtonInteraction, TextChannel,
} from 'discord.js';
import { getGuild } from '../../database/db';
import { Language } from '../../utils/localization';
import { parseDuration } from '../../utils/helpers';
import db from '../../database/db';

function initPollTable() {
  db.exec(`CREATE TABLE IF NOT EXISTS polls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL, channel_id TEXT NOT NULL, message_id TEXT,
    question TEXT NOT NULL, options TEXT NOT NULL, votes TEXT NOT NULL,
    ends_at INTEGER, ended INTEGER DEFAULT 0, creator_id TEXT
  )`);
}

// Eager init at module load — the poll scheduler queries this table every
// 30s from boot, but the table was only ever created lazily on the first
// /poll execution. On a fresh database that meant a "no such table: polls"
// error-log entry every 30 seconds, forever, until someone happened to run
// /poll once. (This module is require()d by the command loader during
// startup, BEFORE startPollScheduler() runs — so the table is guaranteed
// to exist by the first tick.)
initPollTable();

export async function closePoll(client: any, pollId: number) {
  const poll = db.prepare('SELECT * FROM polls WHERE id=?').get(pollId) as any;
  if (!poll || poll.ended) return;
  db.prepare('UPDATE polls SET ended=1 WHERE id=?').run(pollId);

  const opts: string[] = JSON.parse(poll.options);
  const votes: Record<string, string[]> = JSON.parse(poll.votes);
  const EMOJIS = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣'];
  const total = Object.values(votes).reduce((a, v) => a + v.length, 0);

  const resultDesc = opts.map((o, i) => {
    const v = (votes[String(i)] ?? []).length;
    const pct = total ? Math.round(v / total * 100) : 0;
    const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
    return `${EMOJIS[i]} **${o}**\n${bar} ${pct}% (${v} vote${v !== 1 ? 's' : ''})`;
  }).join('\n\n');

  const winner = opts.reduce((best, _, i) =>
    (votes[String(i)] ?? []).length > (votes[String(best)] ?? []).length ? i : best, 0);

  try {
    const ch = await client.channels.fetch(poll.channel_id) as TextChannel;
    const msg = poll.message_id ? await ch.messages.fetch(poll.message_id).catch(() => null) : null;
    const embed = new EmbedBuilder()
      .setTitle(`📊 ${poll.question} — Results`)
      .setColor('#57f287')
      .setDescription(resultDesc)
      .addFields({ name: '🏆 Winner', value: opts[winner] ?? 'Tie' })
      .setTimestamp();
    if (msg) await msg.edit({ embeds: [embed], components: [] });
    await ch.send({ embeds: [embed] });
  } catch {}
}

export default {
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Create a poll with optional deadline')
    .addStringOption(o => o.setName('question').setDescription('Poll question').setRequired(true))
    .addStringOption(o => o.setName('options').setDescription('Options separated by | (max 5)').setRequired(true))
    .addStringOption(o => o.setName('duration').setDescription('Auto-close after (e.g. 1h, 1d, 7d)')),

  async execute(ix: ChatInputCommandInteraction) {
    initPollTable();
    const question = ix.options.getString('question', true);
    const opts = ix.options.getString('options', true).split('|').map(s => s.trim()).slice(0, 5);
    const dur = ix.options.getString('duration');
    const ms = dur ? parseDuration(dur) : null;
    const endsAt = ms ? Math.floor((Date.now() + ms) / 1000) : null;

    const EMOJIS = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣'];
    const votes: Record<string, string[]> = {};
    opts.forEach((_, i) => { votes[String(i)] = []; });

    const getDesc = () => opts.map((o, i) => {
      const v = (votes[String(i)] ?? []).length;
      const total = Object.values(votes).reduce((a, arr) => a + arr.length, 0);
      const pct = total ? Math.round(v / total * 100) : 0;
      const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
      return `${EMOJIS[i]} **${o}**\n${bar} ${pct}% (${v})`;
    }).join('\n\n');

    const embed = () => new EmbedBuilder()
      .setTitle(`📊 ${question}`)
      .setColor('#5865f2')
      .setDescription(getDesc())
      .setFooter({ text: endsAt ? `Ends <t:${endsAt}:R>` : 'No deadline' });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      opts.map((_, i) => new ButtonBuilder().setCustomId(`poll_${i}`).setLabel(EMOJIS[i]).setStyle(ButtonStyle.Secondary)),
    );

    const msg = await ix.reply({ embeds: [embed()], components: [row], fetchReply: true });

    // Persist to DB
    db.prepare('INSERT INTO polls (guild_id, channel_id, message_id, question, options, votes, ends_at, creator_id) VALUES (?,?,?,?,?,?,?,?)')
      .run(ix.guildId, ix.channelId, msg.id, question, JSON.stringify(opts), JSON.stringify(votes), endsAt, ix.user.id);

    const pollId = (db.prepare('SELECT last_insert_rowid() as id').get() as any).id;

    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: ms ?? 7_776_000_000 });
    collector.on('collect', async (btn: ButtonInteraction) => {
      await btn.deferUpdate();
      const idx = btn.customId.split('_')[1];
      Object.keys(votes).forEach(k => { votes[k] = votes[k].filter(u => u !== btn.user.id); });
      votes[idx].push(btn.user.id);
      db.prepare('UPDATE polls SET votes=? WHERE id=?').run(JSON.stringify(votes), pollId);
      await ix.editReply({ embeds: [embed()] });
    });

    collector.on('end', async () => {
      await closePoll(ix.client, pollId);
    });
  },
};
