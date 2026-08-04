/**
 * src/ui/catalog.ts
 *
 * Turns the bot's *existing* command definitions into the data model the
 * wizard renders from.
 *
 * The whole point: nothing is retyped by hand. Every command already ships a
 * SlashCommandBuilder, and `.toJSON()` exposes the full tree — groups,
 * subcommands, options, types, choices, min/max, channel filters. Reading that
 * at boot gives 100 % feature parity for free and makes drift impossible: add
 * an option to a legacy command and the wizard grows a field for it.
 */

import {
  APIApplicationCommandBasicOption,
  APIApplicationCommandOption,
  APIApplicationCommandOptionChoice,
  APIApplicationCommandSubcommandGroupOption,
  APIApplicationCommandSubcommandOption,
  ApplicationCommandOptionType,
  ChannelType,
} from 'discord.js';
import { BotClient, Command } from '../utils/types';
import { AccessLevel } from './permissions';
import {
  CATEGORIES,
  CategoryDefinition,
  HubId,
  buildNode,
  resolvePlacement,
} from './placement';
import { PUBLIC_COMMANDS } from './publicCommands';

export interface CatalogOption {
  name: string;
  description: string;
  type: ApplicationCommandOptionType;
  required: boolean;
  choices?: APIApplicationCommandOptionChoice<string | number>[];
  channelTypes?: ChannelType[];
  minValue?: number;
  maxValue?: number;
  minLength?: number;
  maxLength?: number;
  autocomplete: boolean;
}

export interface CatalogLeaf {
  /** Stable identifier: `command|group|sub`. */
  key: string;
  commandName: string;
  group?: string;
  sub?: string;
  /** Human label shown in select menus. */
  label: string;
  /** What the original slash command advertised. */
  description: string;
  /** `/command group sub` — shown so power users still learn the path. */
  path: string;
  options: CatalogOption[];
  node: string;
  level: AccessLevel;
  hub: HubId;
  categoryId: string;
  /** Set when the entry cannot be driven from components (file uploads). */
  blockedReason?: string;
}

export interface CatalogCategory {
  definition: CategoryDefinition;
  leaves: CatalogLeaf[];
}

export interface Catalog {
  hubs: Record<HubId, CatalogCategory[]>;
  leafByKey: Map<string, CatalogLeaf>;
  /** Every distinct permission node, for the permission editor. */
  nodes: Array<{ node: string; label: string; hub: HubId; level: AccessLevel }>;
}

const OPTION_TYPE_LABEL: Partial<Record<ApplicationCommandOptionType, string>> = {
  [ApplicationCommandOptionType.String]: 'Text',
  [ApplicationCommandOptionType.Integer]: 'Ganzzahl',
  [ApplicationCommandOptionType.Number]: 'Zahl',
  [ApplicationCommandOptionType.Boolean]: 'Ja/Nein',
  [ApplicationCommandOptionType.User]: 'Mitglied',
  [ApplicationCommandOptionType.Role]: 'Rolle',
  [ApplicationCommandOptionType.Channel]: 'Kanal',
  [ApplicationCommandOptionType.Mentionable]: 'Mitglied oder Rolle',
  [ApplicationCommandOptionType.Attachment]: 'Datei',
};

export function optionTypeLabel(type: ApplicationCommandOptionType): string {
  return OPTION_TYPE_LABEL[type] ?? 'Wert';
}

function isSubcommand(o: APIApplicationCommandOption): o is APIApplicationCommandSubcommandOption {
  return o.type === ApplicationCommandOptionType.Subcommand;
}

function isSubcommandGroup(
  o: APIApplicationCommandOption,
): o is APIApplicationCommandSubcommandGroupOption {
  return o.type === ApplicationCommandOptionType.SubcommandGroup;
}

function toCatalogOption(raw: APIApplicationCommandBasicOption): CatalogOption {
  const anyRaw = raw as APIApplicationCommandBasicOption & {
    choices?: APIApplicationCommandOptionChoice<string | number>[];
    channel_types?: ChannelType[];
    min_value?: number;
    max_value?: number;
    min_length?: number;
    max_length?: number;
    autocomplete?: boolean;
  };
  return {
    name: raw.name,
    description: raw.description,
    type: raw.type,
    required: Boolean((raw as { required?: boolean }).required),
    choices: anyRaw.choices,
    channelTypes: anyRaw.channel_types,
    minValue: anyRaw.min_value,
    maxValue: anyRaw.max_value,
    minLength: anyRaw.min_length,
    maxLength: anyRaw.max_length,
    autocomplete: Boolean(anyRaw.autocomplete),
  };
}

function humanize(value: string): string {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

/** Maps an upload-blocked leaf to the standalone command that handles it. */
function uploadRedirect(commandName: string, group?: string, sub?: string): string {
  // These upload-capable commands stay registered standalone (see
  // publicCommands.ts). Send the user straight to the right slash command.
  const map: Record<string, string> = {
    'bot-backup|import': '/bot-backup import',
    'bot-admin|customize|avatar': '/bot-customize avatar',
    'bot-admin|customize|banner': '/bot-customize banner',
  };
  const target =
    map[`${commandName}|${group ?? ''}|${sub ?? ''}`] ?? map[`${commandName}|${sub ?? ''}`];
  if (target) {
    return `This action needs a real file upload, which menu buttons cannot do. Run \`${target}\` — it opens Discord's normal upload dialog and does exactly the same thing.`;
  }
  return "This action needs a file upload, which is not possible through menu buttons.";
}

function makeLeaf(
  commandName: string,
  group: string | undefined,
  sub: string | undefined,
  description: string,
  rawOptions: APIApplicationCommandBasicOption[],
): CatalogLeaf {
  const options = rawOptions.map(toCatalogOption);
  const placement = resolvePlacement(commandName, group, sub);
  const displayCommand = commandName === 'games-impl' ? 'games' : commandName;

  const labelParts = [group, sub].filter(Boolean) as string[];
  const label =
    labelParts.length > 0 ? humanize(labelParts.join(' ')) : humanize(displayCommand);

  const blocked = options.find(o => o.type === ApplicationCommandOptionType.Attachment);

  return {
    key: [commandName, group ?? '', sub ?? ''].join('|'),
    commandName,
    group,
    sub,
    label: truncate(label, 90),
    description: truncate(description || 'Keine Beschreibung hinterlegt.', 180),
    path: ['/' + displayCommand, group, sub].filter(Boolean).join(' '),
    options,
    node: buildNode(commandName, group, sub),
    level: placement.level,
    hub: placement.hub,
    categoryId: placement.category,
    blockedReason: blocked
      ? uploadRedirect(commandName, group, sub)
      : undefined,
  };
}

/** Flattens one command definition into its leaves. */
export function leavesOfCommand(command: Command): CatalogLeaf[] {
  const json = command.data.toJSON() as {
    name: string;
    description: string;
    options?: APIApplicationCommandOption[];
  };
  const options = json.options ?? [];
  const leaves: CatalogLeaf[] = [];

  const groups = options.filter(isSubcommandGroup);
  const subs = options.filter(isSubcommand);
  const basics = options.filter(
    (o): o is APIApplicationCommandBasicOption => !isSubcommand(o) && !isSubcommandGroup(o),
  );

  for (const group of groups) {
    for (const sub of group.options ?? []) {
      leaves.push(makeLeaf(json.name, group.name, sub.name, sub.description, sub.options ?? []));
    }
  }
  for (const sub of subs) {
    leaves.push(makeLeaf(json.name, undefined, sub.name, sub.description, sub.options ?? []));
  }
  if (groups.length === 0 && subs.length === 0) {
    leaves.push(makeLeaf(json.name, undefined, undefined, json.description, basics));
  }

  return leaves;
}

let cached: Catalog | null = null;

/** Builds (and memoizes) the catalog from everything loaded into the client. */
export function buildCatalog(client: BotClient): Catalog {
  const byCategory = new Map<string, CatalogLeaf[]>();
  const leafByKey = new Map<string, CatalogLeaf>();

  for (const [name, command] of client.commands) {
    // The hubs themselves must never appear inside a hub.
    if (PUBLIC_COMMANDS.has(name)) continue;

    let leaves: CatalogLeaf[];
    try {
      leaves = leavesOfCommand(command);
    } catch (err) {
      console.error(`[UI] Katalog: /${name} konnte nicht gelesen werden —`, err);
      continue;
    }

    for (const leaf of leaves) {
      leafByKey.set(leaf.key, leaf);
      const bucket = byCategory.get(leaf.categoryId);
      if (bucket) bucket.push(leaf);
      else byCategory.set(leaf.categoryId, [leaf]);
    }
  }

  const hubs = { menu: [], games: [], staff: [], config: [] } as Record<HubId, CatalogCategory[]>;

  for (const definition of CATEGORIES) {
    const leaves = (byCategory.get(definition.id) ?? []).sort((a, b) =>
      a.label.localeCompare(b.label, 'de'),
    );
    if (leaves.length === 0 && definition.id !== 'cfg-perms') continue;
    hubs[definition.hub].push({ definition, leaves });
  }

  const nodeMap = new Map<string, { node: string; label: string; hub: HubId; level: AccessLevel }>();
  for (const leaf of leafByKey.values()) {
    const commandNode = buildNode(leaf.commandName);
    if (!nodeMap.has(commandNode)) {
      nodeMap.set(commandNode, {
        node: commandNode,
        label: leaf.commandName === 'games-impl' ? '/games (alle Spiele)' : `/${leaf.commandName}`,
        hub: leaf.hub,
        level: leaf.level,
      });
    }
    nodeMap.set(leaf.node, { node: leaf.node, label: leaf.path, hub: leaf.hub, level: leaf.level });
  }

  cached = {
    hubs,
    leafByKey,
    nodes: [...nodeMap.values()].sort((a, b) => a.node.localeCompare(b.node)),
  };
  console.log(
    `[UI] Katalog aufgebaut: ${leafByKey.size} Einträge in ${
      Object.values(hubs).reduce((sum, list) => sum + list.length, 0)
    } Kategorien.`,
  );
  return cached;
}

export function getCatalog(): Catalog {
  if (!cached) throw new Error('[ui/catalog] buildCatalog() wurde noch nicht aufgerufen.');
  return cached;
}

export function isCatalogReady(): boolean {
  return cached !== null;
}
