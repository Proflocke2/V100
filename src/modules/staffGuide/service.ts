/**
 * STAFF GUIDE — paginated guide with arrow-button navigation.
 *
 * Pages are numbered sequentially (1, 2, 3, …). Admins can add/edit/remove
 * pages and configure which roles are allowed to edit content (editor roles).
 * Viewing is open to all members; editing requires an editor role or
 * ManageGuild permission.
 *
 * Navigation: ◀ / ▶ buttons (customId sguide:nav:<page>:<guildId>).
 * The buttons update the same ephemeral message in-place so the channel
 * stays clean.
 */

import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  ButtonInteraction, GuildMember,
} from 'discord.js';
import db from '../../database/db';

// ── Schema ────────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS staff_guide_pages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id    TEXT NOT NULL,
    page_number INTEGER NOT NULL,
    title       TEXT NOT NULL,
    content     TEXT NOT NULL,
    created_by  TEXT NOT NULL,
    updated_at  INTEGER DEFAULT (unixepoch()),
    UNIQUE (guild_id, page_number)
  );

  CREATE TABLE IF NOT EXISTS staff_guide_config (
    guild_id     TEXT PRIMARY KEY,
    editor_roles TEXT NOT NULL DEFAULT '[]'  -- JSON array of role IDs
  );
`);

export interface GuidePage {
  id: number; guild_id: string; page_number: number;
  title: string; content: string; created_by: string; updated_at: number;
}

// ── Permission check ──────────────────────────────────────────────────────────

export function getEditorRoles(guildId: string): string[] {
  const row = db.prepare('SELECT editor_roles FROM staff_guide_config WHERE guild_id = ?').get(guildId) as { editor_roles: string } | undefined;
  return row ? JSON.parse(row.editor_roles) : [];
}

export function setEditorRoles(guildId: string, roleIds: string[]): void {
  db.prepare(`
    INSERT INTO staff_guide_config (guild_id, editor_roles) VALUES (?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET editor_roles = excluded.editor_roles
  `).run(guildId, JSON.stringify(roleIds));
}

/** True if the member can edit guide pages. */
export function canEdit(member: GuildMember, guildId: string): boolean {
  if (member.permissions.has('ManageGuild')) return true;
  const roles = getEditorRoles(guildId);
  return roles.some(r => member.roles.cache.has(r));
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export function countPages(guildId: string): number {
  return (db.prepare('SELECT COUNT(*) AS c FROM staff_guide_pages WHERE guild_id = ?').get(guildId) as { c: number }).c;
}

export function getPage(guildId: string, pageNumber: number): GuidePage | null {
  return (db.prepare('SELECT * FROM staff_guide_pages WHERE guild_id = ? AND page_number = ?').get(guildId, pageNumber) as GuidePage | undefined) ?? null;
}

export function listPages(guildId: string): GuidePage[] {
  return db.prepare('SELECT * FROM staff_guide_pages WHERE guild_id = ? ORDER BY page_number').all(guildId) as GuidePage[];
}

export function addPage(guildId: string, title: string, content: string, createdBy: string): number {
  const next = countPages(guildId) + 1;
  db.prepare('INSERT INTO staff_guide_pages (guild_id, page_number, title, content, created_by) VALUES (?,?,?,?,?)').run(guildId, next, title, content, createdBy);
  return next;
}

export function editPage(guildId: string, pageNumber: number, title: string | null, content: string | null): boolean {
  const page = getPage(guildId, pageNumber);
  if (!page) return false;
  const newTitle   = title   ?? page.title;
  const newContent = content ?? page.content;
  db.prepare('UPDATE staff_guide_pages SET title = ?, content = ?, updated_at = unixepoch() WHERE guild_id = ? AND page_number = ?').run(newTitle, newContent, guildId, pageNumber);
  return true;
}

export function removePage(guildId: string, pageNumber: number): boolean {
  const res = db.prepare('DELETE FROM staff_guide_pages WHERE guild_id = ? AND page_number = ?').run(guildId, pageNumber);
  if (!res.changes) return false;
  // Renumber remaining pages to keep sequence contiguous
  db.prepare('UPDATE staff_guide_pages SET page_number = page_number - 1 WHERE guild_id = ? AND page_number > ?').run(guildId, pageNumber);
  return true;
}

// ── Rendering ─────────────────────────────────────────────────────────────────

const MAX_EMBED_CHARS = 4000;

function chunkContent(content: string): string[] {
  if (content.length <= MAX_EMBED_CHARS) return [content];
  const chunks: string[] = [];
  let rest = content;
  while (rest.length > MAX_EMBED_CHARS) {
    let cut = rest.lastIndexOf('\n', MAX_EMBED_CHARS);
    if (cut <= 0) cut = MAX_EMBED_CHARS;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest.length) chunks.push(rest);
  return chunks;
}

export function buildPagePayload(page: GuidePage, total: number) {
  const chunks = chunkContent(page.content);
  const embeds = chunks.map((chunk, i) =>
    new EmbedBuilder()
      .setColor('#ff6b35')
      .setTitle(i === 0 ? `📋 ${page.title}` : null)
      .setDescription(chunk)
      .setFooter(i === chunks.length - 1 ? { text: `Page ${page.page_number} of ${total} · Last updated <t:${page.updated_at}:R>` } : null),
  );

  const prev = new ButtonBuilder()
    .setCustomId(`sguide:nav:${page.page_number - 1}:${page.guild_id}`)
    .setLabel('◀')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page.page_number <= 1);

  const next = new ButtonBuilder()
    .setCustomId(`sguide:nav:${page.page_number + 1}:${page.guild_id}`)
    .setLabel('▶')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page.page_number >= total);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(prev, next);
  return { embeds, components: [row] };
}

// ── Navigation button handler ─────────────────────────────────────────────────

export async function handleStaffGuideNav(btn: ButtonInteraction): Promise<void> {
  const parts = btn.customId.split(':'); // sguide:nav:<page>:<guildId>
  const targetPage = parseInt(parts[2], 10);
  const guildId    = parts[3];
  if (!guildId || btn.guildId !== guildId) return;

  const total = countPages(guildId);
  if (!total) {
    await btn.reply({ content: '❌ The staff guide has no pages yet.', ephemeral: true });
    return;
  }
  const clampedPage = Math.max(1, Math.min(total, targetPage));
  const page = getPage(guildId, clampedPage);
  if (!page) { await btn.reply({ content: '❌ Page not found.', ephemeral: true }); return; }

  await btn.update(buildPagePayload(page, total));
}

export function isStaffGuideNavButton(customId: string): boolean {
  return customId.startsWith('sguide:nav:');
}
