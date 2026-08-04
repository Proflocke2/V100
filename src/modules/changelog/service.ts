/**
 * CHANGELOG — versioned entries with two parallel write-ups: a technical
 * one for staff and a plain, user-facing one for members. Posting once
 * (via /changelog post) can auto-broadcast both versions to two
 * separately configured channels, so staff get the detail they want
 * without members getting a wall of internal implementation notes.
 */

import { EmbedBuilder, TextChannel, Guild } from 'discord.js';
import db, { getGuild } from '../../database/db';

db.exec(`
  CREATE TABLE IF NOT EXISTS changelog_entries (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id     TEXT NOT NULL,
    version      TEXT NOT NULL,
    member_notes TEXT NOT NULL,
    staff_notes  TEXT NOT NULL,
    posted_by    TEXT NOT NULL,
    created_at   INTEGER DEFAULT (unixepoch())
  );
  CREATE INDEX IF NOT EXISTS idx_changelog_guild ON changelog_entries(guild_id);
`);

export interface ChangelogEntry {
  id: number; guild_id: string; version: string;
  member_notes: string; staff_notes: string; posted_by: string; created_at: number;
}

export function addEntry(
  guildId: string, version: string, memberNotes: string, staffNotes: string, postedBy: string,
): ChangelogEntry {
  db.prepare(
    'INSERT INTO changelog_entries (guild_id, version, member_notes, staff_notes, posted_by) VALUES (?, ?, ?, ?, ?)',
  ).run(guildId, version, memberNotes, staffNotes, postedBy);
  return db.prepare('SELECT * FROM changelog_entries WHERE guild_id = ? ORDER BY id DESC LIMIT 1').get(guildId) as ChangelogEntry;
}

export function listEntries(guildId: string, limit = 10): ChangelogEntry[] {
  return db.prepare('SELECT * FROM changelog_entries WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?').all(guildId, limit) as ChangelogEntry[];
}

function buildEmbed(entry: ChangelogEntry, audience: 'staff' | 'member'): EmbedBuilder {
  const notes = audience === 'staff' ? entry.staff_notes : entry.member_notes;
  return new EmbedBuilder()
    .setColor(audience === 'staff' ? '#5865f2' : '#57f287')
    .setTitle(`${audience === 'staff' ? '🛠️ Staff' : '📢'} Changelog — ${entry.version}`)
    .setDescription(notes)
    .addFields({ name: 'Posted by', value: `<@${entry.posted_by}>`, inline: true })
    .setTimestamp(entry.created_at * 1000);
}

/**
 * Posts a freshly-created entry to whichever channels the guild has
 * configured (either, both, or neither — auto-posting is optional; the
 * entry is always saved and viewable via /changelog list regardless).
 */
export async function broadcastEntry(guild: Guild, entry: ChangelogEntry): Promise<{ staffPosted: boolean; memberPosted: boolean }> {
  const g = getGuild(guild.id) as { changelog_staff_channel: string | null; changelog_member_channel: string | null };
  let staffPosted = false;
  let memberPosted = false;

  if (g.changelog_staff_channel) {
    const ch = guild.channels.cache.get(g.changelog_staff_channel) as TextChannel | undefined;
    if (ch) staffPosted = await ch.send({ embeds: [buildEmbed(entry, 'staff')] }).then(() => true).catch(() => false);
  }
  if (g.changelog_member_channel) {
    const ch = guild.channels.cache.get(g.changelog_member_channel) as TextChannel | undefined;
    if (ch) memberPosted = await ch.send({ embeds: [buildEmbed(entry, 'member')] }).then(() => true).catch(() => false);
  }

  return { staffPosted, memberPosted };
}

export function buildListEmbed(entries: ChangelogEntry[], audience: 'staff' | 'member'): EmbedBuilder {
  const e = new EmbedBuilder()
    .setColor(audience === 'staff' ? '#5865f2' : '#57f287')
    .setTitle(audience === 'staff' ? '🛠️ Staff changelog' : '📢 Changelog');
  if (!entries.length) {
    e.setDescription('No entries yet.');
    return e;
  }
  for (const entry of entries.slice(0, 10)) {
    const notes = audience === 'staff' ? entry.staff_notes : entry.member_notes;
    e.addFields({ name: `${entry.version} — <t:${entry.created_at}:R>`, value: notes.slice(0, 1000) });
  }
  return e;
}
