/**
 * CHAT REVIVAL — posts a conversation-starter into a channel once it's
 * been silent for longer than an admin-configured threshold. Fully
 * per-channel configurable: which channels, how many hours of silence,
 * whether to ping a role, and a custom prompt pool (falls back to a
 * generic built-in pool until the admin adds their own).
 *
 * "Silence" is measured for free, with zero extra bookkeeping: Discord
 * message IDs are snowflakes with the creation timestamp baked into the
 * ID itself, so `channel.lastMessageId` (a plain property discord.js
 * keeps updated on every message, independent of the MessageManager
 * cache limit set in index.ts) decodes straight to "when was the last
 * message here" with no DB table and no risk of losing state across a
 * restart. When the bot's own revival prompt lands, it becomes the new
 * lastMessageId — which naturally prevents re-firing until another full
 * silence_hours window has passed, without needing a separate cooldown
 * field.
 */

import { Client, TextChannel, EmbedBuilder, ChannelType } from 'discord.js';
import db from '../../database/db';

const DISCORD_EPOCH = 1420070400000n;

function snowflakeToTimestamp(id: string): number {
  return Number((BigInt(id) >> 22n) + DISCORD_EPOCH);
}

// ── Schema ────────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS chat_revival_channels (
    guild_id      TEXT NOT NULL,
    channel_id    TEXT NOT NULL,
    silence_hours REAL NOT NULL DEFAULT 6,
    ping_role_id  TEXT,
    enabled       INTEGER DEFAULT 1,
    created_by    TEXT NOT NULL,
    created_at    INTEGER DEFAULT (unixepoch()),
    PRIMARY KEY (guild_id, channel_id)
  );

  CREATE TABLE IF NOT EXISTS chat_revival_prompts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id     TEXT NOT NULL,
    prompt_text  TEXT NOT NULL,
    is_poll      INTEGER DEFAULT 0,
    poll_options TEXT,
    created_by   TEXT NOT NULL,
    created_at   INTEGER DEFAULT (unixepoch())
  );
`);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RevivalChannelRow {
  guild_id: string;
  channel_id: string;
  silence_hours: number;
  ping_role_id: string | null;
  enabled: number;
  created_by: string;
  created_at: number;
}

export interface RevivalPromptRow {
  id: number;
  guild_id: string;
  prompt_text: string;
  is_poll: number;
  poll_options: string | null;
  created_by: string;
  created_at: number;
}

// ── Default prompt pool (used until a guild adds its own) ────────────────────

const DEFAULT_PROMPTS: { text: string; options?: string[] }[] = [
  { text: "What's something you're looking forward to this week?" },
  { text: 'What was the highlight of your day so far?' },
  { text: "If you could instantly master one skill, what would it be?" },
  { text: 'What are you up to right now?' },
  { text: 'Poll: which sounds better right now?', options: ['Coffee ☕', 'Tea 🍵', 'Neither, just here'] },
  { text: 'Poll: pick one', options: ['Mountains 🏔️', 'Beach 🏖️'] },
  { text: "What's a small win you had recently?" },
  { text: "Drop a song you've had on repeat lately." },
];

// ── Channel config ──────────────────────────────────────────────────────────

export function addRevivalChannel(
  guildId: string, channelId: string, silenceHours: number,
  pingRoleId: string | null, createdBy: string,
): void {
  db.prepare(
    `INSERT INTO chat_revival_channels (guild_id, channel_id, silence_hours, ping_role_id, enabled, created_by)
     VALUES (?, ?, ?, ?, 1, ?)
     ON CONFLICT(guild_id, channel_id) DO UPDATE SET silence_hours = excluded.silence_hours, ping_role_id = excluded.ping_role_id, enabled = 1`,
  ).run(guildId, channelId, silenceHours, pingRoleId, createdBy);
}

export function removeRevivalChannel(guildId: string, channelId: string): boolean {
  const res = db.prepare('DELETE FROM chat_revival_channels WHERE guild_id = ? AND channel_id = ?').run(guildId, channelId);
  return res.changes > 0;
}

export function listRevivalChannels(guildId: string): RevivalChannelRow[] {
  return db.prepare('SELECT * FROM chat_revival_channels WHERE guild_id = ? ORDER BY created_at ASC').all(guildId) as RevivalChannelRow[];
}

// ── Prompt pool management ───────────────────────────────────────────────────

export function addPrompt(guildId: string, text: string, pollOptions: string[] | null, createdBy: string): number {
  const res = db.prepare(
    'INSERT INTO chat_revival_prompts (guild_id, prompt_text, is_poll, poll_options, created_by) VALUES (?, ?, ?, ?, ?)',
  ).run(guildId, text, pollOptions ? 1 : 0, pollOptions ? JSON.stringify(pollOptions) : null, createdBy);
  return res.lastInsertRowid as number;
}

export function removePrompt(guildId: string, id: number): boolean {
  const res = db.prepare('DELETE FROM chat_revival_prompts WHERE guild_id = ? AND id = ?').run(guildId, id);
  return res.changes > 0;
}

export function listPrompts(guildId: string): RevivalPromptRow[] {
  return db.prepare('SELECT * FROM chat_revival_prompts WHERE guild_id = ? ORDER BY created_at ASC').all(guildId) as RevivalPromptRow[];
}

function getRandomPrompt(guildId: string): { text: string; options: string[] | null } {
  const custom = listPrompts(guildId);
  if (custom.length > 0) {
    const p = custom[Math.floor(Math.random() * custom.length)];
    return { text: p.prompt_text, options: p.poll_options ? JSON.parse(p.poll_options) : null };
  }
  const p = DEFAULT_PROMPTS[Math.floor(Math.random() * DEFAULT_PROMPTS.length)];
  return { text: p.text, options: p.options ?? null };
}

// ── Tick ──────────────────────────────────────────────────────────────────────

const NUMBER_EMOJI = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];

export async function runChatRevivalTick(client: Client): Promise<void> {
  const rows = db.prepare('SELECT * FROM chat_revival_channels WHERE enabled = 1').all() as RevivalChannelRow[];

  for (const row of rows) {
    try {
      const guild = client.guilds.cache.get(row.guild_id);
      const channel = guild?.channels.cache.get(row.channel_id);
      if (!channel || channel.type !== ChannelType.GuildText) continue;

      const textChannel = channel as TextChannel;
      const lastActivityMs = textChannel.lastMessageId
        ? snowflakeToTimestamp(textChannel.lastMessageId)
        : textChannel.createdTimestamp;

      const silenceMs = row.silence_hours * 60 * 60 * 1000;
      if (Date.now() - lastActivityMs < silenceMs) continue; // still active enough, skip

      const prompt = getRandomPrompt(row.guild_id);
      const embed = new EmbedBuilder()
        .setColor('#ff6b35')
        .setTitle('💬 ' + (prompt.options ? 'Poll time!' : "It's been quiet in here..."))
        .setDescription(prompt.text)
        .setTimestamp();

      if (prompt.options) {
        embed.addFields({
          name: 'Options',
          value: prompt.options.map((opt, i) => `${NUMBER_EMOJI[i] ?? '▪️'} ${opt}`).join('\n'),
        });
      }

      const content = row.ping_role_id ? `<@&${row.ping_role_id}>` : undefined;
      const sent = await textChannel.send({ content, embeds: [embed] }).catch(() => null);
      if (!sent) continue;

      if (prompt.options) {
        for (let i = 0; i < Math.min(prompt.options.length, NUMBER_EMOJI.length); i++) {
          await sent.react(NUMBER_EMOJI[i]).catch(() => {});
        }
      }
    } catch (err) {
      console.error(`[ChatRevival] Failed to process channel ${row.channel_id} in guild ${row.guild_id}:`, err);
    }
  }
}
