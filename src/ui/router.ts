/**
 * src/ui/router.ts
 *
 * One entry point for every `ui:` interaction — buttons, all five select menu
 * flavours, and modal submits.
 *
 * Invariants enforced here, on every single dispatch, never in the client:
 *   • the session exists, belongs to this user and this guild
 *   • the hub is still open to this member
 *   • the specific entry is still open to this member
 *   • the command is not disabled on this guild (`/disable` parity)
 *
 * Only then does the bridge hand the original execute() a synthetic
 * ChatInputCommandInteraction.
 */

import {
  AnySelectMenuInteraction,
  ButtonInteraction,
  ChannelSelectMenuInteraction,
  ChatInputCommandInteraction,
  Guild,
  GuildMember,
  Interaction,
  MentionableSelectMenuInteraction,
  MessageFlags,
  ModalSubmitInteraction,
  RoleSelectMenuInteraction,
  StringSelectMenuInteraction,
  UserSelectMenuInteraction,
} from 'discord.js';
import { isCommandDisabled } from '../database/db';
import { logError } from '../modules/errorTracking/service';
import { error as errorEmbed, success } from '../utils/embeds';
import { BotClient } from '../utils/types';
import { MissingRequiredOptionError, bridgeInteraction, resolveEntities } from './bridge';
import { CatalogLeaf, buildCatalog, getCatalog, isCatalogReady } from './catalog';
import { UiAction, buildUiId, decodeUiId, isUiId, numArg } from './ids';
import {
  BOOLEAN_TRUE,
  BULK_MODAL_TOKEN,
  buildTextModal,
  isTextLike,
  missingRequired,
  parseScalar,
} from './optionForm';
import { HUBS, HubId } from './placement';
import {
  AccessLevel,
  OverrideMode,
  getOverride,
  resolveAccess,
  setAccessRoles,
  setOverride,
} from './permissions';
import {
  buildPermHomeView,
  buildPermLevelView,
  buildPermNodeListView,
  buildPermNodeView,
} from './permissionView';
import { UiSession, createSession, endSession, getSession, resetValues } from './session';
import {
  RenderPayload,
  buildCategoryView,
  buildHubView,
  buildLeafView,
  deniedPayload,
  expiredPayload,
  foreignSessionPayload,
} from './views';

type ComponentInteraction = ButtonInteraction | AnySelectMenuInteraction;
type RoutableInteraction = ComponentInteraction | ModalSubmitInteraction;

/** True for anything this router owns. */
export function isUiInteraction(customId: string): boolean {
  return isUiId(customId);
}

export function ensureCatalog(client: BotClient): void {
  if (!isCatalogReady()) buildCatalog(client);
}

// ── Rendering helpers ────────────────────────────────────────────────────────

async function render(interaction: RoutableInteraction, payload: RenderPayload): Promise<void> {
  if (interaction.isModalSubmit() && !interaction.isFromMessage()) {
    await interaction
      .reply({ ...payload, flags: MessageFlags.Ephemeral })
      .catch(() => undefined);
    return;
  }
  await (interaction as ComponentInteraction).update(payload).catch(() => undefined);
}

async function ephemeral(interaction: RoutableInteraction, payload: RenderPayload): Promise<void> {
  await interaction
    .reply({ ...payload, flags: MessageFlags.Ephemeral })
    .catch(() => undefined);
}

function currentPayload(session: UiSession, member: GuildMember): RenderPayload {
  switch (session.view) {
    case 'category':
      return buildCategoryView(session, member);
    case 'leaf': {
      const leaf = session.leafKey ? getCatalog().leafByKey.get(session.leafKey) : undefined;
      return leaf ? buildLeafView(session, member, leaf) : buildCategoryView(session, member);
    }
    case 'perm-home':
      return buildPermHomeView(session);
    case 'perm-level':
      return buildPermLevelView(session);
    case 'perm-list':
      return buildPermNodeListView(session);
    case 'perm-node':
      return buildPermNodeView(session);
    case 'hub':
    default:
      return buildHubView(session, member);
  }
}

// ── Entry point used by the hub slash commands ───────────────────────────────

export async function openHub(
  interaction: ChatInputCommandInteraction,
  hub: HubId,
  client: BotClient,
): Promise<void> {
  ensureCatalog(client);

  const member = interaction.member as GuildMember | null;
  if (!interaction.guild || !member) {
    await interaction.reply({
      embeds: [errorEmbed('Servers only', 'This menu does not work in direct messages.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const definition = HUBS[hub];
  const decision = resolveAccess(member, definition.node, definition.level);
  if (!decision.allowed) {
    await interaction.reply({
      ...deniedPayload(decision.reason),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const session = createSession(hub, interaction.guild.id, interaction.user.id);
  await interaction.reply({
    ...buildHubView(session, member),
    flags: MessageFlags.Ephemeral,
  });
}

// ── Main dispatch ────────────────────────────────────────────────────────────

export async function handleUiInteraction(
  interaction: Interaction,
  client: BotClient,
): Promise<void> {
  if (
    !interaction.isButton() &&
    !interaction.isAnySelectMenu() &&
    !interaction.isModalSubmit()
  ) {
    return;
  }

  const routable = interaction as RoutableInteraction;
  const decoded = decodeUiId(routable.customId);
  if (!decoded) return;

  ensureCatalog(client);

  const session = getSession(decoded.sessionId);
  if (!session) {
    await render(routable, expiredPayload());
    return;
  }
  if (session.userId !== routable.user.id) {
    await ephemeral(routable, foreignSessionPayload());
    return;
  }

  const guild = routable.guild;
  const member = routable.member as GuildMember | null;
  if (!guild || !member || guild.id !== session.guildId) {
    await render(routable, expiredPayload());
    return;
  }

  // Hub-level gate, re-evaluated on every interaction so a demoted moderator
  // loses access mid-session instead of keeping a stale menu alive.
  const hub = HUBS[session.hub];
  const hubDecision = resolveAccess(member, hub.node, hub.level);
  if (!hubDecision.allowed) {
    endSession(session.id);
    await render(routable, deniedPayload(hubDecision.reason));
    return;
  }

  session.notice = undefined;

  switch (decoded.action) {
    case UiAction.Close:
      endSession(session.id);
      await render(routable, {
        embeds: [success('Menu closed', 'See you next time.')],
        components: [],
      });
      return;

    case UiAction.Home:
      session.view = 'hub';
      session.page = 0;
      session.leafKey = undefined;
      resetValues(session);
      await render(routable, buildHubView(session, member));
      return;

    case UiAction.Back:
      await handleBack(routable, session, member);
      return;

    case UiAction.Category:
      await handleCategory(routable, session, member);
      return;

    case UiAction.Page:
      await handlePage(routable, session, member, numArg(decoded.args, 0));
      return;

    case UiAction.Leaf:
      await handleLeaf(routable, session, member, decoded.args);
      return;

    case UiAction.OptionPick:
      await handleOptionPick(routable, session, member);
      return;

    case UiAction.OptionTextModal:
      await handleTextModalOpen(routable, session, member, undefined);
      return;

    case UiAction.OptionTextSubmit:
      await handleTextModalSubmit(routable, session, member, decoded.args);
      return;

    case UiAction.OptionChoice:
    case UiAction.OptionBool:
    case UiAction.OptionUser:
    case UiAction.OptionRole:
    case UiAction.OptionChannel:
    case UiAction.OptionMentionable:
      await handleValueSelect(routable, session, member, decoded.action, numArg(decoded.args, 0));
      return;

    case UiAction.OptionReset: {
      resetValues(session);
      await renderLeaf(routable, session, member);
      return;
    }

    case UiAction.Run:
      await handleRun(routable, session, member, client);
      return;

    case UiAction.PermHome:
      session.view = 'perm-home';
      await render(routable, buildPermHomeView(session));
      return;

    case UiAction.PermLevelPick:
      session.permLevel = decoded.args[0] === 'admin' ? 'admin' : 'staff';
      session.view = 'perm-level';
      await render(routable, buildPermLevelView(session));
      return;

    case UiAction.PermLevelRoles:
      await handlePermLevelRoles(routable, session, decoded.args);
      return;

    case UiAction.PermNodePick:
      await handlePermNodePick(routable, session);
      return;

    case UiAction.PermNodeMode:
      await handlePermNodeMode(routable, session, decoded.args[0] as OverrideMode);
      return;

    case UiAction.PermNodeRoles:
      await handlePermNodeRoles(routable, session);
      return;

    default:
      return;
  }
}

// ── Navigation ───────────────────────────────────────────────────────────────

async function handleBack(
  interaction: RoutableInteraction,
  session: UiSession,
  member: GuildMember,
): Promise<void> {
  switch (session.view) {
    case 'leaf':
      session.view = 'category';
      session.leafKey = undefined;
      resetValues(session);
      await render(interaction, buildCategoryView(session, member));
      return;
    case 'perm-level':
    case 'perm-list':
      session.view = 'perm-home';
      await render(interaction, buildPermHomeView(session));
      return;
    case 'perm-node':
      session.view = 'perm-list';
      await render(interaction, buildPermNodeListView(session));
      return;
    case 'category':
    case 'perm-home':
    default:
      session.view = 'hub';
      session.page = 0;
      await render(interaction, buildHubView(session, member));
      return;
  }
}

async function handleCategory(
  interaction: RoutableInteraction,
  session: UiSession,
  member: GuildMember,
): Promise<void> {
  if (!interaction.isStringSelectMenu()) return;
  const index = Number((interaction as StringSelectMenuInteraction).values[0]);
  const categories = getCatalog().hubs[session.hub];
  const category = categories[index];
  if (!category) {
    await render(interaction, buildHubView(session, member));
    return;
  }

  session.categoryIndex = index;
  session.page = 0;
  session.leafKey = undefined;
  resetValues(session);

  if (category.definition.id === 'cfg-perms') {
    session.view = 'perm-home';
    await render(interaction, buildPermHomeView(session));
    return;
  }

  session.view = 'category';
  await render(interaction, buildCategoryView(session, member));
}

async function handlePage(
  interaction: RoutableInteraction,
  session: UiSession,
  member: GuildMember,
  page: number,
): Promise<void> {
  if (session.view === 'perm-list') {
    session.permPage = page;
    await render(interaction, buildPermNodeListView(session));
    return;
  }
  session.page = page;
  await render(interaction, buildCategoryView(session, member));
}

function leafFromSession(session: UiSession): CatalogLeaf | undefined {
  return session.leafKey ? getCatalog().leafByKey.get(session.leafKey) : undefined;
}

/** Re-checks the entry's own node before rendering or running it. */
function assertLeafAccess(
  session: UiSession,
  member: GuildMember,
  leaf: CatalogLeaf,
): string | null {
  const decision = resolveAccess(member, leaf.node, leaf.level, HUBS[session.hub].node);
  return decision.allowed ? null : decision.reason;
}

async function renderLeaf(
  interaction: RoutableInteraction,
  session: UiSession,
  member: GuildMember,
): Promise<void> {
  const leaf = leafFromSession(session);
  if (!leaf) {
    await render(interaction, buildCategoryView(session, member));
    return;
  }
  const denied = assertLeafAccess(session, member, leaf);
  if (denied) {
    await render(interaction, deniedPayload(denied));
    return;
  }
  await render(interaction, buildLeafView(session, member, leaf));
}

async function handleLeaf(
  interaction: RoutableInteraction,
  session: UiSession,
  member: GuildMember,
  args: string[],
): Promise<void> {
  if (!interaction.isStringSelectMenu()) return;
  const index = Number((interaction as StringSelectMenuInteraction).values[0] ?? args[0]);
  const category = getCatalog().hubs[session.hub][session.categoryIndex];
  const leaf = category?.leaves[index];
  if (!leaf) {
    await render(interaction, buildCategoryView(session, member));
    return;
  }

  const denied = assertLeafAccess(session, member, leaf);
  if (denied) {
    await render(interaction, deniedPayload(denied));
    return;
  }

  session.leafKey = leaf.key;
  session.view = 'leaf';
  resetValues(session);
  await render(interaction, buildLeafView(session, member, leaf));
}

// ── Parameter collection ─────────────────────────────────────────────────────

async function handleOptionPick(
  interaction: RoutableInteraction,
  session: UiSession,
  member: GuildMember,
): Promise<void> {
  if (!interaction.isStringSelectMenu()) return;
  const leaf = leafFromSession(session);
  if (!leaf) {
    await render(interaction, buildCategoryView(session, member));
    return;
  }
  const index = Number((interaction as StringSelectMenuInteraction).values[0]);
  const option = leaf.options[index];
  if (!option) {
    await renderLeaf(interaction, session, member);
    return;
  }

  session.activeOption = option.name;

  // Free-text and numeric fields go straight into a modal — one click less.
  if (isTextLike(option)) {
    await handleTextModalOpen(interaction, session, member, index);
    return;
  }
  await renderLeaf(interaction, session, member);
}

async function handleTextModalOpen(
  interaction: RoutableInteraction,
  session: UiSession,
  member: GuildMember,
  optionIndex: number | undefined,
): Promise<void> {
  const leaf = leafFromSession(session);
  if (!leaf) {
    await render(interaction, buildCategoryView(session, member));
    return;
  }
  if (interaction.isModalSubmit()) return;
  await (interaction as ComponentInteraction)
    .showModal(buildTextModal(session, leaf, optionIndex))
    .catch(() => undefined);
}

async function handleTextModalSubmit(
  interaction: RoutableInteraction,
  session: UiSession,
  member: GuildMember,
  args: string[],
): Promise<void> {
  if (!interaction.isModalSubmit()) return;
  const modal = interaction as ModalSubmitInteraction;
  const leaf = leafFromSession(session);
  if (!leaf) {
    await render(modal, buildCategoryView(session, member));
    return;
  }

  const token = args[0];
  const targets =
    token === BULK_MODAL_TOKEN
      ? leaf.options.filter(isTextLike).slice(0, 5)
      : [leaf.options[Number(token)]].filter(Boolean);

  const problems: string[] = [];
  for (const option of targets) {
    let raw: string;
    try {
      raw = modal.fields.getTextInputValue(option.name);
    } catch {
      continue;
    }
    const parsed = parseScalar(option, raw);
    if (!parsed.ok) {
      problems.push(parsed.error ?? `\`${option.name}\` ist ungültig.`);
      continue;
    }
    if (parsed.value) session.values.set(option.name, parsed.value);
    else session.values.delete(option.name);
  }

  if (problems.length > 0) session.notice = problems.join('\n');
  await renderLeaf(modal, session, member);
}

async function handleValueSelect(
  interaction: RoutableInteraction,
  session: UiSession,
  member: GuildMember,
  action: UiAction,
  optionIndex: number,
): Promise<void> {
  const leaf = leafFromSession(session);
  if (!leaf) {
    await render(interaction, buildCategoryView(session, member));
    return;
  }
  const option = leaf.options[optionIndex];
  if (!option) {
    await renderLeaf(interaction, session, member);
    return;
  }

  const clear = (): void => {
    session.values.delete(option.name);
  };

  switch (action) {
    case UiAction.OptionChoice: {
      if (!interaction.isStringSelectMenu()) return;
      const picked = (interaction as StringSelectMenuInteraction).values[0];
      if (picked === undefined) clear();
      else {
        const parsed = parseScalar(option, picked);
        if (parsed.ok && parsed.value) session.values.set(option.name, parsed.value);
        else session.values.set(option.name, { kind: 'text', raw: picked });
      }
      break;
    }
    case UiAction.OptionBool: {
      if (!interaction.isStringSelectMenu()) return;
      const picked = (interaction as StringSelectMenuInteraction).values[0];
      if (picked === undefined) clear();
      else session.values.set(option.name, { kind: 'boolean', raw: picked === BOOLEAN_TRUE });
      break;
    }
    case UiAction.OptionUser: {
      if (!interaction.isUserSelectMenu()) return;
      const id = (interaction as UserSelectMenuInteraction).values[0];
      if (!id) clear();
      else session.values.set(option.name, { kind: 'user', id });
      break;
    }
    case UiAction.OptionRole: {
      if (!interaction.isRoleSelectMenu()) return;
      const id = (interaction as RoleSelectMenuInteraction).values[0];
      if (!id) clear();
      else session.values.set(option.name, { kind: 'role', id });
      break;
    }
    case UiAction.OptionChannel: {
      if (!interaction.isChannelSelectMenu()) return;
      const id = (interaction as ChannelSelectMenuInteraction).values[0];
      if (!id) clear();
      else session.values.set(option.name, { kind: 'channel', id });
      break;
    }
    case UiAction.OptionMentionable: {
      if (!interaction.isMentionableSelectMenu()) return;
      const mentionable = interaction as MentionableSelectMenuInteraction;
      const id = mentionable.values[0];
      if (!id) clear();
      else {
        session.values.set(option.name, {
          kind: 'mentionable',
          id,
          isRole: mentionable.roles.has(id),
        });
      }
      break;
    }
    default:
      break;
  }

  await renderLeaf(interaction, session, member);
}

// ── Execution ────────────────────────────────────────────────────────────────

async function handleRun(
  interaction: RoutableInteraction,
  session: UiSession,
  member: GuildMember,
  client: BotClient,
): Promise<void> {
  if (interaction.isModalSubmit()) return;
  const button = interaction as ButtonInteraction;
  const leaf = leafFromSession(session);
  if (!leaf) {
    await render(button, buildCategoryView(session, member));
    return;
  }

  const denied = assertLeafAccess(session, member, leaf);
  if (denied) {
    await ephemeral(button, deniedPayload(denied));
    return;
  }
  if (leaf.blockedReason) {
    await ephemeral(button, deniedPayload(leaf.blockedReason));
    return;
  }

  const missing = missingRequired(leaf, session);
  if (missing.length > 0) {
    await ephemeral(button, {
      embeds: [
        errorEmbed(
          'Missing required fields',
          `Still to fill in: ${missing.map(name => `\`${name}\``).join(', ')}`,
        ),
      ],
      components: [],
    });
    return;
  }

  // `/disable` parity — the hub must not become a bypass for disabled commands.
  const displayName = leaf.commandName === 'games-impl' ? 'games' : leaf.commandName;
  if (
    isCommandDisabled(session.guildId, leaf.commandName) ||
    isCommandDisabled(session.guildId, displayName)
  ) {
    await ephemeral(button, {
      embeds: [
        errorEmbed(
          'Disabled',
          `\`${leaf.path}\` has been disabled on this server.`,
        ),
      ],
      components: [],
    });
    return;
  }

  const command = client.commands.get(leaf.commandName);
  if (!command) {
    await ephemeral(button, {
      embeds: [errorEmbed('Unavailable', 'This command is not loaded right now.')],
      components: [],
    });
    return;
  }

  try {
    const entities = await resolveEntities(button.guild as Guild, session.values);
    const bridged = bridgeInteraction(button, leaf, session.values, entities);
    await command.execute(bridged, client);
  } catch (err) {
    if (err instanceof MissingRequiredOptionError) {
      await ephemeral(button, {
        embeds: [errorEmbed('Incomplete input', err.message)],
        components: [],
      });
      return;
    }
    console.error(`[UI] Ausführung von ${leaf.path} fehlgeschlagen:`, err);
    logError(`ui:${leaf.key}`, err, { guildId: session.guildId, userId: session.userId });
    const payload = {
      embeds: [
        errorEmbed('Internal error', 'The action could not be run. Please try again later.'),
      ],
      components: [] as never[],
    };
    if (button.replied || button.deferred) await button.followUp({ ...payload, flags: MessageFlags.Ephemeral }).catch(() => undefined);
    else await button.reply({ ...payload, flags: MessageFlags.Ephemeral }).catch(() => undefined);
  }
}

// ── Permission editor ────────────────────────────────────────────────────────

async function handlePermLevelRoles(
  interaction: RoutableInteraction,
  session: UiSession,
  args: string[],
): Promise<void> {
  if (!interaction.isRoleSelectMenu()) return;
  const level: AccessLevel = args[0] === 'admin' ? 'admin' : 'staff';
  const roleIds = [...(interaction as RoleSelectMenuInteraction).values];
  setAccessRoles(session.guildId, level, roleIds);
  session.permLevel = level;
  session.view = 'perm-level';
  await render(interaction, buildPermLevelView(session));
}

async function handlePermNodePick(
  interaction: RoutableInteraction,
  session: UiSession,
): Promise<void> {
  if (interaction.isStringSelectMenu()) {
    session.permNode = (interaction as StringSelectMenuInteraction).values[0];
    session.view = 'perm-node';
    await render(interaction, buildPermNodeView(session));
    return;
  }
  session.view = 'perm-list';
  await render(interaction, buildPermNodeListView(session));
}

async function handlePermNodeMode(
  interaction: RoutableInteraction,
  session: UiSession,
  mode: OverrideMode,
): Promise<void> {
  if (!session.permNode) {
    session.view = 'perm-list';
    await render(interaction, buildPermNodeListView(session));
    return;
  }
  // Switching to "roles" keeps whatever roles were already picked; every other
  // mode ignores the list, so it is dropped to avoid stale data in the table.
  const roleIds = mode === 'roles' ? getOverride(session.guildId, session.permNode)?.roleIds ?? [] : [];
  setOverride(session.guildId, session.permNode, mode, roleIds, session.userId);
  session.view = 'perm-node';
  await render(interaction, buildPermNodeView(session));
}

async function handlePermNodeRoles(
  interaction: RoutableInteraction,
  session: UiSession,
): Promise<void> {
  if (!interaction.isRoleSelectMenu() || !session.permNode) return;
  const roleIds = [...(interaction as RoleSelectMenuInteraction).values];
  setOverride(
    session.guildId,
    session.permNode,
    roleIds.length > 0 ? 'roles' : 'inherit',
    roleIds,
    session.userId,
  );
  session.view = 'perm-node';
  await render(interaction, buildPermNodeView(session));
}

export { buildUiId };
