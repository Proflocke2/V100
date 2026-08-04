/**
 * INTERACTIVE HELP — parses the existing hand-written COMMAND_GUIDE_TEXT
 * (docs/commandGuideText.ts) into its numbered sections and lets people
 * browse them one category at a time via a dropdown, instead of always
 * getting the entire multi-hundred-line file at once. The .txt file is
 * still offered as a "download everything" option in the same dropdown —
 * this is additive, not a replacement of the existing behavior.
 *
 * Deliberately does NOT introduce a second source of truth for command
 * docs: it re-parses the same COMMAND_GUIDE_TEXT every time (cheap, runs
 * once per /help call), so updating that one file keeps both the .txt
 * download and the dropdown browser in sync automatically.
 */

import {
  ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder,
  StringSelectMenuInteraction, AttachmentBuilder,
} from 'discord.js';
import { COMMAND_GUIDE_TEXT } from '../../docs/commandGuideText';

const SECTION_RE = /\n-{3,}\n \d+\. ([A-Za-z0-9 ()&,/'-]+)\n-{3,}\n/g;

interface ParsedSection { title: string; content: string; }

function parseSections(): ParsedSection[] {
  const text = COMMAND_GUIDE_TEXT;
  const matches = [...text.matchAll(SECTION_RE)];
  const sections: ParsedSection[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index! + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : text.length;
    sections.push({ title: matches[i][1].trim(), content: text.slice(start, end).trim() });
  }
  return sections;
}

const CATEGORY_ICONS: Record<string, string> = {
  GAMES: '🎮', ECONOMY: '💰', MODERATION: '🛡️', TICKETS: '🎫', UTILITY: '🔧', WELCOME: '👋',
};

function iconFor(title: string): string {
  const key = Object.keys(CATEGORY_ICONS).find(k => title.toUpperCase().includes(k));
  return key ? CATEGORY_ICONS[key] : '📄';
}

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

export const HELP_SELECT_CUSTOM_ID = 'help:category';
const DOWNLOAD_VALUE = '__download_full__';

export function buildHelpMenu(): ActionRowBuilder<StringSelectMenuBuilder> {
  const menu = new StringSelectMenuBuilder().setCustomId(HELP_SELECT_CUSTOM_ID).setPlaceholder('Which area do you need help with?');
  for (const s of parseSections()) {
    menu.addOptions({ label: s.title.slice(0, 100), value: s.title.slice(0, 100), emoji: iconFor(s.title) });
  }
  menu.addOptions({ label: 'Download full guide (.txt)', value: DOWNLOAD_VALUE, emoji: '📄' });
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

export function buildIntroEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor('#ff6b35')
    .setTitle('📖 Command Guide')
    .setDescription('Pick an area below and I\'ll show you the commands for it, in plain English.');
}

export async function handleHelpCategorySelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const value = interaction.values[0];
  const menuRow = buildHelpMenu();

  if (value === DOWNLOAD_VALUE) {
    const file = new AttachmentBuilder(Buffer.from(COMMAND_GUIDE_TEXT.trim(), 'utf-8'), { name: 'multibotv2-command-guide.txt' });
    await interaction.update({
      embeds: [buildIntroEmbed().setDescription('Here\'s the complete guide as a file. Pick a category below to browse instead.')],
      components: [menuRow],
      files: [file],
    });
    return;
  }

  const section = parseSections().find(s => s.title === value);
  if (!section) {
    await interaction.reply({ content: '❌ That category is no longer available — try again.', ephemeral: true });
    return;
  }

  const chunks = chunkContent(section.content);
  const embeds = chunks.map((chunk, i) => new EmbedBuilder()
    .setColor('#ff6b35')
    .setTitle(i === 0 ? `${iconFor(section.title)} ${section.title}` : null)
    .setDescription(chunk)
    .setFooter(i === chunks.length - 1 ? { text: 'Pick another area below, or download the full guide' } : null));

  await interaction.update({ embeds, components: [menuRow] });
}
