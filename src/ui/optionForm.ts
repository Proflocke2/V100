/**
 * src/ui/optionForm.ts
 *
 * Turns a command's option list into components, and component input back into
 * validated values.
 *
 * Mapping:
 *   String / Integer / Number  → modal text input (bulk modal, up to 5 at once)
 *   String with choices        → string select
 *   Boolean                    → string select (Ja / Nein)
 *   User / Role / Channel      → the matching entity select, channel types honoured
 *   Mentionable                → mentionable select
 *   Attachment                 → not collectible from components; entry is blocked
 *
 * Validation mirrors what Discord would have enforced on the real slash
 * command (min/max value, min/max length, choice membership), so bridged
 * commands never see input they could not have seen before.
 */

import {
  ActionRowBuilder,
  ApplicationCommandOptionType,
  ChannelSelectMenuBuilder,
  ChannelType,
  MentionableSelectMenuBuilder,
  ModalBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} from 'discord.js';
import { CatalogLeaf, CatalogOption, optionTypeLabel } from './catalog';
import { UiAction, buildUiId } from './ids';
import { OptionValue, UiSession } from './session';

export const BOOLEAN_TRUE = 'true';
export const BOOLEAN_FALSE = 'false';

export function isTextLike(option: CatalogOption): boolean {
  if (option.choices && option.choices.length > 0) return false;
  return (
    option.type === ApplicationCommandOptionType.String ||
    option.type === ApplicationCommandOptionType.Integer ||
    option.type === ApplicationCommandOptionType.Number
  );
}

/** Options that fit into the bulk text modal (Discord allows five rows). */
export function textModalOptions(leaf: CatalogLeaf): CatalogOption[] {
  return leaf.options.filter(isTextLike).slice(0, 5);
}

export interface ParseResult {
  ok: boolean;
  value?: OptionValue;
  error?: string;
}

export function parseScalar(option: CatalogOption, raw: string): ParseResult {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return option.required
      ? { ok: false, error: `\`${option.name}\` is required.` }
      : { ok: true };
  }

  if (option.type === ApplicationCommandOptionType.String) {
    if (option.minLength !== undefined && trimmed.length < option.minLength) {
      return { ok: false, error: `\`${option.name}\` needs at least ${option.minLength} characters.` };
    }
    if (option.maxLength !== undefined && trimmed.length > option.maxLength) {
      return { ok: false, error: `\`${option.name}\` allows at most ${option.maxLength} characters.` };
    }
    return { ok: true, value: { kind: 'text', raw: trimmed } };
  }

  const numeric = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(numeric)) {
    return { ok: false, error: `\`${option.name}\` expects a number — \`${trimmed}\` is not one.` };
  }
  if (option.type === ApplicationCommandOptionType.Integer && !Number.isInteger(numeric)) {
    return { ok: false, error: `\`${option.name}\` expects a whole number.` };
  }
  if (option.minValue !== undefined && numeric < option.minValue) {
    return { ok: false, error: `\`${option.name}\` must be at least ${option.minValue} .` };
  }
  if (option.maxValue !== undefined && numeric > option.maxValue) {
    return { ok: false, error: `\`${option.name}\` may be at most ${option.maxValue} .` };
  }
  return { ok: true, value: { kind: 'number', raw: numeric } };
}

/** Human-readable rendering of a stored value for the summary embed. */
export function describeValue(value: OptionValue | undefined): string {
  if (!value) return '—';
  switch (value.kind) {
    case 'text':
      return value.raw.length > 60 ? `${value.raw.slice(0, 59)}…` : value.raw;
    case 'number':
      return String(value.raw);
    case 'boolean':
      return value.raw ? 'Ja' : 'Nein';
    case 'user':
      return `<@${value.id}>`;
    case 'role':
      return `<@&${value.id}>`;
    case 'channel':
      return `<#${value.id}>`;
    case 'mentionable':
      return value.isRole ? `<@&${value.id}>` : `<@${value.id}>`;
  }
}

export function missingRequired(leaf: CatalogLeaf, session: UiSession): string[] {
  return leaf.options.filter(o => o.required && !session.values.has(o.name)).map(o => o.name);
}

// ── Modal ────────────────────────────────────────────────────────────────────

export const BULK_MODAL_TOKEN = 'b';

/**
 * @param optionIndex Index of a single option to prompt for. Omit for the bulk
 *                    modal covering the first five text-like options.
 */
export function buildTextModal(
  session: UiSession,
  leaf: CatalogLeaf,
  optionIndex?: number,
): ModalBuilder {
  const single = optionIndex !== undefined ? leaf.options[optionIndex] : undefined;
  const fields = single ? [single] : textModalOptions(leaf);

  const modal = new ModalBuilder()
    .setCustomId(
      buildUiId(
        session.id,
        UiAction.OptionTextSubmit,
        optionIndex !== undefined ? optionIndex : BULK_MODAL_TOKEN,
      ),
    )
    .setTitle(`${leaf.label}`.slice(0, 45));

  for (const option of fields) {
    const current = session.values.get(option.name);
    const prefill =
      current && (current.kind === 'text' || current.kind === 'number') ? String(current.raw) : '';

    const label = `${option.name}${option.required ? ' *' : ''}`;
    const input = new TextInputBuilder()
      .setCustomId(option.name)
      .setLabel(label.slice(0, 45))
      .setStyle(
        option.type === ApplicationCommandOptionType.String && (option.maxLength ?? 0) > 100
          ? TextInputStyle.Paragraph
          : TextInputStyle.Short,
      )
      .setRequired(option.required)
      .setPlaceholder(option.description.slice(0, 100))
      .setValue(prefill.slice(0, 1000));

    if (option.type === ApplicationCommandOptionType.String) {
      if (option.maxLength !== undefined) input.setMaxLength(Math.min(option.maxLength, 4000));
      if (option.minLength !== undefined) input.setMinLength(option.minLength);
    }

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  }

  return modal;
}

// ── Component rows ───────────────────────────────────────────────────────────

const CHANNEL_TYPE_FALLBACK: ChannelType[] = [
  ChannelType.GuildText,
  ChannelType.GuildVoice,
  ChannelType.GuildCategory,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
  ChannelType.GuildStageVoice,
  ChannelType.AnnouncementThread,
  ChannelType.PublicThread,
  ChannelType.PrivateThread,
];

/** Select menu listing every parameter of the entry, with fill state. */
export function buildOptionPickerRow(
  session: UiSession,
  leaf: CatalogLeaf,
): ActionRowBuilder<StringSelectMenuBuilder> | null {
  if (leaf.options.length === 0) return null;

  const menu = new StringSelectMenuBuilder()
    .setCustomId(buildUiId(session.id, UiAction.OptionPick))
    .setPlaceholder('Select a parameter to fill in')
    .setMinValues(1)
    .setMaxValues(1);

  for (const [index, option] of leaf.options.slice(0, 25).entries()) {
    const filled = session.values.has(option.name);
    const label = `${option.name}${option.required ? ' (required)' : ''}`;
    menu.addOptions(
      new StringSelectMenuOptionBuilder()
        .setValue(String(index))
        .setLabel(label.slice(0, 100))
        .setDescription(
          `${optionTypeLabel(option.type)} · ${option.description}`.slice(0, 100),
        )
        .setEmoji(filled ? '✅' : option.required ? '🔴' : '⬜')
        .setDefault(session.activeOption === option.name),
    );
  }

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

/** The collector row for whichever parameter is currently active. */
export function buildCollectorRow(
  session: UiSession,
  leaf: CatalogLeaf,
): ActionRowBuilder<
  | StringSelectMenuBuilder
  | UserSelectMenuBuilder
  | RoleSelectMenuBuilder
  | ChannelSelectMenuBuilder
  | MentionableSelectMenuBuilder
> | null {
  if (!session.activeOption) return null;
  const index = leaf.options.findIndex(o => o.name === session.activeOption);
  if (index < 0) return null;
  const option = leaf.options[index];
  const current = session.values.get(option.name);
  const placeholder = `${option.name}: ${option.description}`.slice(0, 150);

  if (option.choices && option.choices.length > 0) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(buildUiId(session.id, UiAction.OptionChoice, index))
      .setPlaceholder(placeholder)
      .setMinValues(option.required ? 1 : 0)
      .setMaxValues(1);
    for (const choice of option.choices.slice(0, 25)) {
      menu.addOptions(
        new StringSelectMenuOptionBuilder()
          .setValue(String(choice.value))
          .setLabel(String(choice.name).slice(0, 100))
          .setDefault(
            current !== undefined &&
              (current.kind === 'text' || current.kind === 'number') &&
              String(current.raw) === String(choice.value),
          ),
      );
    }
    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
  }

  switch (option.type) {
    case ApplicationCommandOptionType.Boolean: {
      const menu = new StringSelectMenuBuilder()
        .setCustomId(buildUiId(session.id, UiAction.OptionBool, index))
        .setPlaceholder(placeholder)
        .setMinValues(option.required ? 1 : 0)
        .setMaxValues(1)
        .addOptions(
          new StringSelectMenuOptionBuilder()
            .setValue(BOOLEAN_TRUE)
            .setLabel('Ja')
            .setEmoji('✅')
            .setDefault(current?.kind === 'boolean' && current.raw),
          new StringSelectMenuOptionBuilder()
            .setValue(BOOLEAN_FALSE)
            .setLabel('Nein')
            .setEmoji('❌')
            .setDefault(current?.kind === 'boolean' && !current.raw),
        );
      return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
    }

    case ApplicationCommandOptionType.User: {
      const menu = new UserSelectMenuBuilder()
        .setCustomId(buildUiId(session.id, UiAction.OptionUser, index))
        .setPlaceholder(placeholder)
        .setMinValues(option.required ? 1 : 0)
        .setMaxValues(1);
      return new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(menu);
    }

    case ApplicationCommandOptionType.Role: {
      const menu = new RoleSelectMenuBuilder()
        .setCustomId(buildUiId(session.id, UiAction.OptionRole, index))
        .setPlaceholder(placeholder)
        .setMinValues(option.required ? 1 : 0)
        .setMaxValues(1);
      return new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(menu);
    }

    case ApplicationCommandOptionType.Channel: {
      const menu = new ChannelSelectMenuBuilder()
        .setCustomId(buildUiId(session.id, UiAction.OptionChannel, index))
        .setPlaceholder(placeholder)
        .setChannelTypes(
          option.channelTypes && option.channelTypes.length > 0
            ? option.channelTypes
            : CHANNEL_TYPE_FALLBACK,
        )
        .setMinValues(option.required ? 1 : 0)
        .setMaxValues(1);
      return new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(menu);
    }

    case ApplicationCommandOptionType.Mentionable: {
      const menu = new MentionableSelectMenuBuilder()
        .setCustomId(buildUiId(session.id, UiAction.OptionMentionable, index))
        .setPlaceholder(placeholder)
        .setMinValues(option.required ? 1 : 0)
        .setMaxValues(1);
      return new ActionRowBuilder<MentionableSelectMenuBuilder>().addComponents(menu);
    }

    default:
      // Text-like options are collected through the modal, not a row.
      return null;
  }
}
