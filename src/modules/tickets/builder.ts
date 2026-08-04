/**
 * TICKETS — embed and component builders.
 *
 * Panel rendering:
 *   1 category    → one big "Open Ticket" button
 *   2–6 categories → up to two button rows (max 3 buttons per row)
 *   7–25 categories → first two rows of buttons (cats 1–6) + one StringSelectMenu row (cats 7–25)
 *   panel.mode can override "auto"
 *
 * Multi-panel:
 *   Up to 25 panels → StringSelectMenu with panel title + description per option
 *
 * Ticket controls (in-ticket row of buttons):
 *   📌 Claim  |  🔓 Unclaim  |  🔒 Close  |  ➕ Add User  |  📑 Transcript
 *
 * Survey:
 *   ⭐ 1–5 star rating buttons (ephemeral, sent to opener on ticket close)
 */

import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ColorResolvable,
} from 'discord.js';
import {
  PanelConfig, TicketCategory, MultiPanelConfig, TicketRecord,
  PanelMode, CategoryColor, ResolvedMode,
} from './types';
import { tGuild } from '../../i18n';

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseEmoji(raw: string): { id: string; name: string; animated?: boolean } | string {
  const custom = raw.match(/^<?(?:(a):)?([a-zA-Z0-9_]+):(\d+)>?$/);
  if (custom) return { id: custom[3], name: custom[2], animated: custom[1] === 'a' };
  return raw; // unicode emoji
}

const BUTTON_STYLES: Record<CategoryColor, ButtonStyle> = {
  [CategoryColor.Primary]:   ButtonStyle.Primary,
  [CategoryColor.Secondary]: ButtonStyle.Secondary,
  [CategoryColor.Success]:   ButtonStyle.Success,
  [CategoryColor.Danger]:    ButtonStyle.Danger,
};

function toColorResolvable(hex: string): ColorResolvable {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? (hex as ColorResolvable) : '#5865f2';
}

/** Returns the text shown on the button — custom button_text or falls back to label. */
function buttonLabel(cat: TicketCategory): string {
  return (cat.button_text ?? cat.label).slice(0, 80);
}

/** Builds a single ButtonBuilder for a category. */
function buildCategoryButton(cat: TicketCategory): ButtonBuilder {
  const btn = new ButtonBuilder()
    .setCustomId(`tk:open:${cat.id}`)
    .setLabel(buttonLabel(cat))
    .setStyle(BUTTON_STYLES[cat.color] ?? ButtonStyle.Primary);
  if (cat.emoji) btn.setEmoji(parseEmoji(cat.emoji));
  return btn;
}

// ── Panel embed ───────────────────────────────────────────────────────────────

export function buildPanelEmbed(panel: PanelConfig, removeBranding = false): EmbedBuilder {
  const e = new EmbedBuilder()
    .setTitle(panel.title)
    .setColor(toColorResolvable(panel.color));

  if (panel.description) e.setDescription(panel.description);
  if (panel.image)       e.setImage(panel.image);
  if (panel.thumbnail)   e.setThumbnail(panel.thumbnail);

  if (panel.footer) {
    e.setFooter({ text: panel.footer });
  } else if (!removeBranding) {
    e.setFooter({ text: 'Powered by MultiBot' });
  }

  return e;
}

// ── Mode resolution ───────────────────────────────────────────────────────────

export function resolveMode(panel: PanelConfig, catCount: number): ResolvedMode {
  if (catCount <= 0) return ResolvedMode.Single;

  if (panel.mode === PanelMode.Dropdown) {
    return catCount === 1 ? ResolvedMode.Single : ResolvedMode.Dropdown;
  }
  if (panel.mode === PanelMode.Button) {
    if (catCount === 1) return ResolvedMode.Single;
    return catCount > 6 ? ResolvedMode.Dropdown : ResolvedMode.Buttons;
  }
  // Auto
  if (catCount === 1) return ResolvedMode.Single;
  if (catCount <= 6)  return ResolvedMode.Buttons;
  return ResolvedMode.Dropdown;
}

// ── Panel components ──────────────────────────────────────────────────────────

export function buildPanelComponents(
  panel: PanelConfig,
  cats: TicketCategory[],
): ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] {
  if (cats.length === 0) return [];

  const mode = resolveMode(panel, cats.length);

  if (mode === ResolvedMode.Single) {
    return [new ActionRowBuilder<ButtonBuilder>().addComponents(buildCategoryButton(cats[0]))];
  }

  if (mode === ResolvedMode.Buttons) {
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    for (let i = 0; i < Math.min(cats.length, 6); i += 3) {
      const chunk = cats.slice(i, i + 3);
      rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...chunk.map(buildCategoryButton)));
    }
    return rows;
  }

  const rows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];

  const btnCats = cats.slice(0, 6);
  for (let i = 0; i < btnCats.length; i += 3) {
    const chunk = btnCats.slice(i, i + 3);
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...chunk.map(buildCategoryButton)));
  }

  const dropCats = cats.slice(6, 25);
  const select = new StringSelectMenuBuilder()
    .setCustomId(`tk:select:${panel.id}`)
    .setPlaceholder(tGuild(panel.guild_id, 'tickets.panel.select_placeholder'))
    .addOptions(dropCats.map(c => {
      const o = new StringSelectMenuOptionBuilder()
        .setLabel(buttonLabel(c))
        .setValue(String(c.id));
      if (c.button_text && c.button_text !== c.label) {
        o.setDescription(c.label.slice(0, 100));
      }
      if (c.emoji) o.setEmoji(parseEmoji(c.emoji));
      return o;
    }));

  rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
  return rows;
}

// ── Multi-panel embed ─────────────────────────────────────────────────────────

export function buildMultiPanelEmbed(
  multi: MultiPanelConfig,
  panels: PanelConfig[],
  removeBranding = false,
): EmbedBuilder {
  const e = new EmbedBuilder()
    .setTitle(multi.title)
    .setColor(toColorResolvable(multi.color));

  if (multi.description) e.setDescription(multi.description);
  if (multi.image)       e.setImage(multi.image);
  if (multi.thumbnail)   e.setThumbnail(multi.thumbnail);

  if (multi.footer) {
    e.setFooter({ text: multi.footer });
  } else if (!removeBranding) {
    e.setFooter({ text: 'Powered by MultiBot' });
  }

  return e;
}

// ── Multi-panel components ────────────────────────────────────────────────────

export function buildMultiPanelComponents(
  multi: MultiPanelConfig,
  panels: PanelConfig[],
): ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] {
  if (panels.length === 0) return [];

  if (multi.mode === 'button') {
    // Discord renders every button with rounded corners by default — there's
    // no API knob to make them "more" rounded, this is just what a Primary/
    // Secondary button looks like. Max 25 panels = 5 rows of 5.
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    const btnPanels = panels.slice(0, 25);
    for (let i = 0; i < btnPanels.length; i += 5) {
      const chunk = btnPanels.slice(i, i + 5);
      rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...chunk.map(p => new ButtonBuilder()
          .setCustomId(`tk:multi-btn:${multi.id}:${p.id}`)
          .setLabel(p.title.slice(0, 80))
          .setStyle(ButtonStyle.Primary)),
      ));
    }
    return rows;
  }

  const options = panels.slice(0, 25).map(p => {
    const o = new StringSelectMenuOptionBuilder()
      .setLabel(p.title.slice(0, 100))
      .setValue(String(p.id));

    const firstLine = p.description?.split('\n').find(l => l.trim().length > 0) ?? '';
    if (firstLine) o.setDescription(firstLine.slice(0, 100));

    return o;
  });

  const select = new StringSelectMenuBuilder()
    .setCustomId(`tk:multi:${multi.id}`)
    .setPlaceholder('Select a support category…')
    .addOptions(options);

  return [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)];
}

// ── Ticket control row ────────────────────────────────────────────────────────
//
// ⚠️  NOTE FOR STAFF:
//     These buttons are protected server-side in handler.ts via isStaff().
//     A non-staff user who clicks them will receive an ephemeral "Access Denied" message.
//
// customId scheme:
//   tk:ctrl:close:{ticketId}
//   tk:ctrl:claim:{ticketId}
//   tk:ctrl:unclaim:{ticketId}
//   tk:ctrl:adduser:{ticketId}
//   tk:ctrl:transcript:{ticketId}

export function buildTicketControls(guildId: string, ticketId: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    // 📌 Claim — staff takes ownership of this ticket
    new ButtonBuilder()
      .setCustomId(`tk:ctrl:claim:${ticketId}`)
      .setEmoji('📌')
      .setLabel('Claim')
      .setStyle(ButtonStyle.Success),

    // 🔓 Unclaim — staff releases ownership back to the team
    new ButtonBuilder()
      .setCustomId(`tk:ctrl:unclaim:${ticketId}`)
      .setEmoji('🔓')
      .setLabel('Unclaim')
      .setStyle(ButtonStyle.Secondary),

    // 🔒 Close — shows a modal for the close reason (staff only)
    new ButtonBuilder()
      .setCustomId(`tk:ctrl:close:${ticketId}`)
      .setEmoji('🔒')
      .setLabel('Close')
      .setStyle(ButtonStyle.Danger),

    // ➕ Add User — invite another user to the ticket
    new ButtonBuilder()
      .setCustomId(`tk:ctrl:adduser:${ticketId}`)
      .setEmoji('➕')
      .setLabel('Add User')
      .setStyle(ButtonStyle.Secondary),

    // 📑 Transcript — generate and send HTML/TXT transcript
    new ButtonBuilder()
      .setCustomId(`tk:ctrl:transcript:${ticketId}`)
      .setEmoji('📑')
      .setLabel('Transcript')
      .setStyle(ButtonStyle.Secondary),
  );
}

// ── Exit survey components ────────────────────────────────────────────────────
//
// customId scheme: tk:survey:{ticketId}:{rating}

export function buildSurveyComponents(ticketId: number): ActionRowBuilder<ButtonBuilder> {
  const stars  = ['⭐', '⭐⭐', '⭐⭐⭐', '⭐⭐⭐⭐', '⭐⭐⭐⭐⭐'];
  const styles = [ButtonStyle.Danger, ButtonStyle.Danger, ButtonStyle.Primary, ButtonStyle.Success, ButtonStyle.Success];

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...([1, 2, 3, 4, 5] as const).map(rating =>
      new ButtonBuilder()
        .setCustomId(`tk:survey:${ticketId}:${rating}`)
        .setLabel(stars[rating - 1])
        .setStyle(styles[rating - 1]),
    ),
  );
}

// ── Archive notification embed ────────────────────────────────────────────────

export function buildArchiveEmbed(ticket: TicketRecord, channelName: string, guildName: string): EmbedBuilder {
  const padded = String(ticket.number).padStart(4, '0');
  return new EmbedBuilder()
    .setTitle(`📂 Ticket #${padded} — Archived`)
    .setColor('#5865f2')
    .addFields(
      { name: 'Channel',   value: `#${channelName}`,      inline: true },
      { name: 'Opened by', value: `<@${ticket.user_id}>`, inline: true },
      { name: 'Server',    value: guildName,               inline: true },
    )
    .setTimestamp();
}
