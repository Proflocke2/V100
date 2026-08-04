/**
 * src/ui/bridge.ts
 *
 * The piece that makes "zero breaking changes" literal.
 *
 * Every legacy command still reads its input via
 * `interaction.options.getString('reason')` and friends. Instead of rewriting
 * ~50 execute() bodies, the wizard hands them a *bridged* interaction: a Proxy
 * over the real ButtonInteraction that answers `options.*` from the values the
 * user picked in the UI, reports itself as a chat-input command, and forwards
 * everything else (reply, deferReply, editReply, followUp, showModal, user,
 * guild, channel, client, locale, …) untouched to the live interaction.
 *
 * Consequence: command logic and every database call underneath it run byte
 * for byte as before. The only thing that changed is where the arguments came
 * from.
 */

import {
  Attachment,
  ButtonInteraction,
  ChatInputCommandInteraction,
  Guild,
  GuildBasedChannel,
  GuildMember,
  InteractionType,
  ModalSubmitInteraction,
  Role,
  User,
} from 'discord.js';
import { CatalogLeaf } from './catalog';
import { OptionValue } from './session';

export type BridgeSource = ButtonInteraction | ModalSubmitInteraction;

interface ResolvedEntities {
  users: Map<string, User>;
  members: Map<string, GuildMember>;
  roles: Map<string, Role>;
  channels: Map<string, GuildBasedChannel>;
}

/**
 * Fetches the concrete Discord objects behind the IDs the select menus
 * produced, once, before execution — so the resolver stays synchronous exactly
 * like the real one.
 */
export async function resolveEntities(
  guild: Guild,
  values: Map<string, OptionValue>,
): Promise<ResolvedEntities> {
  const resolved: ResolvedEntities = {
    users: new Map(),
    members: new Map(),
    roles: new Map(),
    channels: new Map(),
  };

  for (const value of values.values()) {
    if (value.kind === 'user' || (value.kind === 'mentionable' && !value.isRole)) {
      const id = value.id;
      const member = guild.members.cache.get(id) ?? (await guild.members.fetch(id).catch(() => null));
      if (member) {
        resolved.members.set(id, member);
        resolved.users.set(id, member.user);
      } else {
        const user = await guild.client.users.fetch(id).catch(() => null);
        if (user) resolved.users.set(id, user);
      }
    } else if (value.kind === 'role' || (value.kind === 'mentionable' && value.isRole)) {
      const role = guild.roles.cache.get(value.id) ?? (await guild.roles.fetch(value.id).catch(() => null));
      if (role) resolved.roles.set(value.id, role);
    } else if (value.kind === 'channel') {
      const channel =
        guild.channels.cache.get(value.id) ?? (await guild.channels.fetch(value.id).catch(() => null));
      if (channel) resolved.channels.set(value.id, channel);
    }
  }

  return resolved;
}

class MissingRequiredOptionError extends Error {
  constructor(name: string) {
    super(`Required field "${name}" was not filled in.`);
    this.name = 'MissingRequiredOptionError';
  }
}

/**
 * Stand-in for CommandInteractionOptionResolver covering every accessor the
 * codebase actually uses (verified by grep across src/).
 */
export class BridgedOptionResolver {
  constructor(
    private readonly leaf: CatalogLeaf,
    private readonly values: Map<string, OptionValue>,
    private readonly entities: ResolvedEntities,
  ) {}

  private value(name: string): OptionValue | undefined {
    return this.values.get(name);
  }

  private require<T>(name: string, value: T | null, required?: boolean): T | null {
    if (value === null && required) throw new MissingRequiredOptionError(name);
    return value;
  }

  getSubcommand(required = true): string {
    if (!this.leaf.sub) {
      if (required) throw new Error(`/${this.leaf.commandName} hat keinen Subcommand.`);
      return null as unknown as string;
    }
    return this.leaf.sub;
  }

  getSubcommandGroup(required = false): string | null {
    if (!this.leaf.group) {
      if (required) throw new Error(`/${this.leaf.commandName} hat keine Subcommand-Gruppe.`);
      return null;
    }
    return this.leaf.group;
  }

  getString(name: string, required?: boolean): string | null {
    const value = this.value(name);
    const out = value && value.kind === 'text' ? value.raw : null;
    return this.require(name, out, required);
  }

  getInteger(name: string, required?: boolean): number | null {
    const value = this.value(name);
    const out = value && value.kind === 'number' ? Math.trunc(value.raw) : null;
    return this.require(name, out, required);
  }

  getNumber(name: string, required?: boolean): number | null {
    const value = this.value(name);
    const out = value && value.kind === 'number' ? value.raw : null;
    return this.require(name, out, required);
  }

  getBoolean(name: string, required?: boolean): boolean | null {
    const value = this.value(name);
    const out = value && value.kind === 'boolean' ? value.raw : null;
    return this.require(name, out, required);
  }

  getUser(name: string, required?: boolean): User | null {
    const value = this.value(name);
    const id =
      value && (value.kind === 'user' || (value.kind === 'mentionable' && !value.isRole))
        ? value.id
        : null;
    return this.require(name, id ? this.entities.users.get(id) ?? null : null, required);
  }

  getMember(name: string): GuildMember | null {
    const value = this.value(name);
    const id =
      value && (value.kind === 'user' || (value.kind === 'mentionable' && !value.isRole))
        ? value.id
        : null;
    return id ? this.entities.members.get(id) ?? null : null;
  }

  getRole(name: string, required?: boolean): Role | null {
    const value = this.value(name);
    const id =
      value && (value.kind === 'role' || (value.kind === 'mentionable' && value.isRole))
        ? value.id
        : null;
    return this.require(name, id ? this.entities.roles.get(id) ?? null : null, required);
  }

  getChannel(name: string, required?: boolean): GuildBasedChannel | null {
    const value = this.value(name);
    const id = value && value.kind === 'channel' ? value.id : null;
    return this.require(name, id ? this.entities.channels.get(id) ?? null : null, required);
  }

  getMentionable(name: string, required?: boolean): User | Role | GuildMember | null {
    const value = this.value(name);
    if (!value || value.kind !== 'mentionable') return this.require(name, null, required);
    const found = value.isRole
      ? this.entities.roles.get(value.id) ?? null
      : this.entities.members.get(value.id) ?? this.entities.users.get(value.id) ?? null;
    return this.require(name, found, required);
  }

  /** File uploads cannot originate from a component — such entries are blocked upstream. */
  getAttachment(name: string, required?: boolean): Attachment | null {
    return this.require(name, null, required);
  }

  getFocused(): string {
    return '';
  }

  get(name: string): { name: string; value: string | number | boolean } | null {
    const value = this.value(name);
    if (!value) return null;
    switch (value.kind) {
      case 'text':
        return { name, value: value.raw };
      case 'number':
        return { name, value: value.raw };
      case 'boolean':
        return { name, value: value.raw };
      default:
        return { name, value: value.id };
    }
  }

  get data(): Array<{ name: string; value: string | number | boolean }> {
    return this.leaf.options
      .map(option => this.get(option.name))
      .filter((entry): entry is { name: string; value: string | number | boolean } => entry !== null);
  }
}

/**
 * Wraps a live component interaction so legacy `execute()` code believes it is
 * handling a slash command.
 *
 * The single `as unknown as ChatInputCommandInteraction` cast is deliberate and
 * contained here: structurally the Proxy satisfies everything the command layer
 * touches, but discord.js interactions are classes, so nominal typing cannot be
 * satisfied without it.
 */
export function bridgeInteraction(
  source: BridgeSource,
  leaf: CatalogLeaf,
  values: Map<string, OptionValue>,
  entities: ResolvedEntities,
): ChatInputCommandInteraction {
  const resolver = new BridgedOptionResolver(leaf, values, entities);

  const overrides: Record<string | symbol, unknown> = {
    options: resolver,
    commandName: leaf.commandName,
    commandId: source.id,
    commandType: 1,
    commandGuildId: source.guildId,
    type: InteractionType.ApplicationCommand,
    isChatInputCommand: () => true,
    isCommand: () => true,
    isContextMenuCommand: () => false,
    isUserContextMenuCommand: () => false,
    isMessageContextMenuCommand: () => false,
    isButton: () => false,
    isAnySelectMenu: () => false,
    isStringSelectMenu: () => false,
    isModalSubmit: () => false,
    isMessageComponent: () => false,
    isAutocomplete: () => false,
    isRepliable: () => true,
  };

  const proxy = new Proxy(source as object, {
    get(target, property, receiver) {
      if (property in overrides) return overrides[property];
      const value = Reflect.get(target, property, target as object);
      return typeof value === 'function' ? value.bind(target) : value;
    },
    has(target, property) {
      return property in overrides || Reflect.has(target, property);
    },
    set(target, property, value) {
      return Reflect.set(target, property, value, target as object);
    },
  });

  return proxy as unknown as ChatInputCommandInteraction;
}

export { MissingRequiredOptionError };
