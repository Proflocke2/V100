/**
 * src/ui/views.ts
 *
 * Renders the three navigation levels of every hub.
 *
 *   Hub      → what this area is for + category picker
 *   Category → what this category contains + entry picker (paginated)
 *   Entry    → what the command does, which parameters it takes, run button
 *
 * Every level carries a short explanation, because the whole reason for the
 * rebuild was that people could not tell 49 commands apart. Access is filtered
 * per member here for display only — the router re-checks server-side before
 * anything executes.
 */

import {
  ActionRowBuilder,
  MessageActionRowComponentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  GuildMember,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { embed, error as errorEmbed } from '../utils/embeds';
import { CatalogCategory, CatalogLeaf, getCatalog, optionTypeLabel } from './catalog';
import { UiAction, buildUiId } from './ids';
import {
  buildCollectorRow,
  buildOptionPickerRow,
  describeValue,
  missingRequired,
  textModalOptions,
} from './optionForm';
import { HUBS } from './placement';
import { LEVEL_LABEL, canAccess } from './permissions';
import { UiSession } from './session';

export interface RenderPayload {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<MessageActionRowComponentBuilder>[];
}

const PAGE_SIZE = 25;

type Row = ActionRowBuilder<MessageActionRowComponentBuilder>;

function asRow(row: ActionRowBuilder<never> | ActionRowBuilder<MessageActionRowComponentBuilder> | null): Row | null {
  return row as Row | null;
}

/** Categories of the active hub the member may see at least one entry of. */
export function visibleCategories(
  session: UiSession,
  member: GuildMember,
): Array<{ index: number; category: CatalogCategory; visibleLeaves: number }> {
  const hubNode = HUBS[session.hub].node;
  const categories = getCatalog().hubs[session.hub];

  return categories
    .map((category, index) => ({
      index,
      category,
      visibleLeaves: category.leaves.filter(leaf =>
        canAccess(member, leaf.node, leaf.level, hubNode),
      ).length,
    }))
    .filter(entry => entry.visibleLeaves > 0 || entry.category.definition.id === 'cfg-perms');
}

/** Entries of a category the member may see, keeping original indices. */
export function visibleLeaves(
  session: UiSession,
  member: GuildMember,
  category: CatalogCategory,
): Array<{ index: number; leaf: CatalogLeaf }> {
  const hubNode = HUBS[session.hub].node;
  return category.leaves
    .map((leaf, index) => ({ index, leaf }))
    .filter(entry => canAccess(member, entry.leaf.node, entry.leaf.level, hubNode));
}

function navRow(session: UiSession, backAction: UiAction, includeHome: boolean): Row {
  const row = new ActionRowBuilder<ButtonBuilder>();
  if (backAction === UiAction.Home) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(buildUiId(session.id, UiAction.Home))
        .setLabel('Overview')
        .setEmoji('🔙')
        .setStyle(ButtonStyle.Secondary),
    );
  } else {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(buildUiId(session.id, UiAction.Back))
        .setLabel('Back')
        .setEmoji('🔙')
        .setStyle(ButtonStyle.Secondary),
    );
    if (includeHome) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(buildUiId(session.id, UiAction.Home))
          .setLabel('Overview')
          .setEmoji('🏠')
          .setStyle(ButtonStyle.Secondary),
      );
    }
  }
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(buildUiId(session.id, UiAction.Close))
      .setLabel('Close')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Danger),
  );
  return row as Row;
}

// ── Hub ──────────────────────────────────────────────────────────────────────

export function buildHubView(session: UiSession, member: GuildMember): RenderPayload {
  const hub = HUBS[session.hub];
  const categories = visibleCategories(session, member);

  const view = embed('primary')
    .setTitle(`${hub.emoji} ${hub.title}`)
    .setDescription(hub.description);

  if (categories.length === 0) {
    return {
      embeds: [
        errorEmbed(
          'Nothing available',
          'You have no entries available in this area right now. An admin can change that under `/config → Permissions`.',
        ),
      ],
      components: [navRow(session, UiAction.Close, false)],
    };
  }

  view.addFields(
    categories.slice(0, 25).map(entry => ({
      name: `${entry.category.definition.emoji} ${entry.category.definition.label}`,
      value: `${entry.category.definition.description}\n*${entry.visibleLeaves} entries*`,
      inline: true,
    })),
  );
  view.setFooter({ text: 'Pick a category below — the session expires after 15 minutes.' });

  const menu = new StringSelectMenuBuilder()
    .setCustomId(buildUiId(session.id, UiAction.Category))
    .setPlaceholder('Choose a category')
    .setMinValues(1)
    .setMaxValues(1);

  for (const entry of categories.slice(0, 25)) {
    menu.addOptions(
      new StringSelectMenuOptionBuilder()
        .setValue(String(entry.index))
        .setLabel(entry.category.definition.label.slice(0, 100))
        .setDescription(entry.category.definition.description.slice(0, 100))
        .setEmoji(entry.category.definition.emoji),
    );
  }

  const components: Row[] = [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu) as Row,
    navRow(session, UiAction.Close, false),
  ];

  return { embeds: [view], components };
}

// ── Category ─────────────────────────────────────────────────────────────────

export function buildCategoryView(session: UiSession, member: GuildMember): RenderPayload {
  const hub = HUBS[session.hub];
  const categories = getCatalog().hubs[session.hub];
  const category = categories[session.categoryIndex];

  if (!category) return buildHubView(session, member);

  if (category.definition.id === 'cfg-perms') {
    // Handled by the permission editor, routed separately.
    return buildHubView(session, member);
  }

  const entries = visibleLeaves(session, member, category);
  const pages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const page = Math.min(session.page, pages - 1);
  const slice = entries.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const view = embed('primary')
    .setTitle(`${category.definition.emoji} ${category.definition.label}`)
    .setDescription(
      `${category.definition.description}\n\n${
        slice.length === 0
          ? 'Nothing here is available to you.'
          : slice
              .map(entry => `**${entry.leaf.label}** — ${entry.leaf.description}`)
              .join('\n')
              .slice(0, 3800)
      }`,
    )
    .setFooter({
      text: `${hub.title} · Page ${page + 1}/${pages} · ${entries.length} entries`,
    });

  const components: Row[] = [];

  if (slice.length > 0) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(buildUiId(session.id, UiAction.Leaf))
      .setPlaceholder('Open an entry')
      .setMinValues(1)
      .setMaxValues(1);

    for (const entry of slice) {
      menu.addOptions(
        new StringSelectMenuOptionBuilder()
          .setValue(String(entry.index))
          .setLabel(entry.leaf.label.slice(0, 100))
          .setDescription(entry.leaf.description.slice(0, 100)),
      );
    }
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu) as Row);
  }

  if (pages > 1) {
    const pager = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(buildUiId(session.id, UiAction.Page, Math.max(0, page - 1)))
        .setLabel('Previous')
        .setEmoji('◀️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(buildUiId(session.id, UiAction.Page, Math.min(pages - 1, page + 1)))
        .setLabel('Next')
        .setEmoji('▶️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= pages - 1),
    );
    components.push(pager as Row);
  }

  components.push(navRow(session, UiAction.Home, false));
  return { embeds: [view], components };
}

// ── Entry ────────────────────────────────────────────────────────────────────

export function buildLeafView(
  session: UiSession,
  member: GuildMember,
  leaf: CatalogLeaf,
): RenderPayload {
  const view = embed('primary')
    .setTitle(`▶️ ${leaf.label}`)
    .setDescription(leaf.description)
    .addFields({
      name: 'Access',
      value: `${LEVEL_LABEL[leaf.level]} · Command path \`${leaf.path}\``,
      inline: false,
    });

  if (leaf.blockedReason) {
    view.addFields({ name: '⚠️ Not runnable from the menu', value: leaf.blockedReason });
    return {
      embeds: [view],
      components: [navRow(session, UiAction.Back, true)],
    };
  }

  if (leaf.options.length > 0) {
    const lines = leaf.options.map(option => {
      const value = session.values.get(option.name);
      const marker = value ? '✅' : option.required ? '🔴' : '⬜';
      return `${marker} **${option.name}** *(${optionTypeLabel(option.type)}${
        option.required ? ', required' : ''
      })*\n┗ ${option.description}\n┗ Current: ${describeValue(value)}`;
    });
    view.addFields({ name: 'Parameters', value: lines.join('\n').slice(0, 1024) });
  } else {
    view.addFields({
      name: 'Parameters',
      value: 'None — runs directly.',
    });
  }

  const missing = missingRequired(leaf, session);
  if (missing.length > 0) {
    view.addFields({
      name: 'Still missing',
      value: missing.map(name => `\`${name}\``).join(', '),
    });
  }
  if (session.notice) {
    view.addFields({ name: '⚠️ Note', value: session.notice.slice(0, 1024) });
  }

  const components: Row[] = [];
  const picker = asRow(buildOptionPickerRow(session, leaf));
  if (picker) components.push(picker);
  const collector = asRow(buildCollectorRow(session, leaf));
  if (collector) components.push(collector);

  const actions = new ActionRowBuilder<ButtonBuilder>();
  if (textModalOptions(leaf).length > 0) {
    actions.addComponents(
      new ButtonBuilder()
        .setCustomId(buildUiId(session.id, UiAction.OptionTextModal))
        .setLabel('Fill in text fields')
        .setEmoji('📝')
        .setStyle(ButtonStyle.Secondary),
    );
  }
  if (leaf.options.length > 0) {
    actions.addComponents(
      new ButtonBuilder()
        .setCustomId(buildUiId(session.id, UiAction.OptionReset))
        .setLabel('Backsetzen')
        .setEmoji('♻️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(session.values.size === 0),
    );
  }
  actions.addComponents(
    new ButtonBuilder()
      .setCustomId(buildUiId(session.id, UiAction.Run))
      .setLabel('Run')
      .setEmoji('🚀')
      .setStyle(missing.length === 0 ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(missing.length > 0),
  );
  components.push(actions as Row);
  components.push(navRow(session, UiAction.Back, true));

  return { embeds: [view], components };
}

export function expiredPayload(): RenderPayload {
  return {
    embeds: [
      errorEmbed(
        'Session expired',
        'This menu expired after 15 minutes of inactivity. Just run the command again.',
      ),
    ],
    components: [],
  };
}

export function foreignSessionPayload(): RenderPayload {
  return {
    embeds: [
      errorEmbed(
        'Not your menu',
        'Only the person who opened this menu can use it. Just open your own.',
      ),
    ],
    components: [],
  };
}

export function deniedPayload(reason: string): RenderPayload {
  return {
    embeds: [errorEmbed('Kein Access', reason)],
    components: [],
  };
}
