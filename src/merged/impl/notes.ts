import {
  SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits,
  EmbedBuilder, MessageFlags,
} from 'discord.js';
import { requirePermission } from '../../utils/guards';
import { success, error } from '../../utils/embeds';
import db, { getGuild } from '../../database/db';
import { getLocalized, Language } from '../../utils/localization';

db.exec(`
  CREATE TABLE IF NOT EXISTS mod_notes (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id     TEXT NOT NULL,
    user_id      TEXT NOT NULL,
    author_id    TEXT NOT NULL,
    note         TEXT NOT NULL,
    created_at   INTEGER DEFAULT (unixepoch())
  );
`);

export default {
  data: new SlashCommandBuilder()
    .setName('notes')
    .setDescription('Internal moderator notes on members')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false)
    .addSubcommand(s => s.setName('add').setDescription('Add a note')
      .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
      .addStringOption(o => o.setName('note').setDescription('Note text').setRequired(true).setMaxLength(1000)))
    .addSubcommand(s => s.setName('list').setDescription('Show all notes for a member')
      .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true)))
    .addSubcommand(s => s.setName('delete').setDescription('Delete a note')
      .addIntegerOption(o => o.setName('id').setDescription('Note ID (from /notes list)').setRequired(true))),

  async execute(ix: ChatInputCommandInteraction) {
    if (!await requirePermission(ix, PermissionFlagsBits.ModerateMembers)) return;
    const sub  = ix.options.getSubcommand();
    const gid  = ix.guildId!;
    const lang = ((getGuild(gid) as any).language || 'en') as Language;
    const t    = (key: string, vars?: Record<string, string>) => getLocalized(key, lang, vars);

    if (sub === 'add') {
      const user = ix.options.getUser('user', true);
      const note = ix.options.getString('note', true);
      db.prepare('INSERT INTO mod_notes (guild_id, user_id, author_id, note) VALUES (?, ?, ?, ?)').run(gid, user.id, ix.user.id, note);
      return ix.reply({
        embeds: [success(t('notes.saved'), t('notes.saved_desc', { user: user.id, note }))],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'list') {
      const user  = ix.options.getUser('user', true);
      const notes = db.prepare('SELECT * FROM mod_notes WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC').all(gid, user.id) as { id: number; author_id: string; note: string; created_at: number }[];
      if (!notes.length) {
        return ix.reply({
          embeds: [new EmbedBuilder().setColor('#5865f2').setTitle(t('notes.list_title', { user: user.username })).setDescription(t('notes.none'))],
          flags: MessageFlags.Ephemeral,
        });
      }
      return ix.reply({
        embeds: [new EmbedBuilder().setColor('#5865f2')
          .setTitle(t('notes.list_title', { user: user.username }))
          .setThumbnail(user.displayAvatarURL())
          .setDescription(notes.slice(0, 10).map(n => `**ID #${n.id}** • <t:${n.created_at}:R> • <@${n.author_id}>\n${n.note}`).join('\n\n'))
          .setFooter({ text: t('notes.footer', { n: String(notes.length) }) })],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'delete') {
      const noteId = ix.options.getInteger('id', true);
      const note   = db.prepare('SELECT * FROM mod_notes WHERE id = ? AND guild_id = ?').get(noteId, gid) as { id: number } | undefined;
      if (!note) return ix.reply({ embeds: [error('Error', t('notes.not_found'))], flags: MessageFlags.Ephemeral });
      db.prepare('DELETE FROM mod_notes WHERE id = ?').run(noteId);
      return ix.reply({ embeds: [success(t('notes.delete_title'), t('notes.deleted', { id: String(noteId) }))], flags: MessageFlags.Ephemeral });
    }
  },
};
