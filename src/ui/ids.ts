/**
 * src/ui/ids.ts
 *
 * Single source of truth for every customId the wizard UI layer emits.
 *
 * Format: `ui:<sessionId>:<action>[:<arg>...]`
 *
 * Discord caps customIds at 100 characters. Everything the router needs is
 * therefore encoded as short tokens plus *numeric indices* into the session's
 * catalog snapshot — never as command names, which would blow the budget on
 * entries like `security.inactivity-kick.configure`.
 */

export const UI_NAMESPACE = 'ui';

/** Every action the wizard router can dispatch on. */
export enum UiAction {
  /** Return to the hub landing view. */
  Home = 'home',
  /** Open a category (arg0 = category index). */
  Category = 'cat',
  /** Open a single command entry (arg0 = leaf index within category). */
  Leaf = 'leaf',
  /** Paginate a list view (arg0 = new page). */
  Page = 'pg',
  /** Step one level up. */
  Back = 'back',
  /** Tear the session down. */
  Close = 'x',

  /** Select menu listing the parameters of the active entry. */
  OptionPick = 'op',
  /** Button that opens the bulk text modal. */
  OptionTextModal = 'otm',
  /** Modal submit carrying text/number values. */
  OptionTextSubmit = 'ots',
  /** String select for an option that declares choices (arg0 = option index). */
  OptionChoice = 'och',
  /** String select for a boolean option (arg0 = option index). */
  OptionBool = 'obl',
  /** Entity selects (arg0 = option index). */
  OptionUser = 'ous',
  OptionRole = 'orl',
  OptionChannel = 'och2',
  OptionMentionable = 'omn',
  /** Reset all collected values of the active entry. */
  OptionReset = 'orst',

  /** Execute the active entry. */
  Run = 'run',

  /** Permission editor. */
  PermHome = 'ph',
  PermLevelPick = 'plv',
  PermLevelRoles = 'plr',
  PermNodePick = 'pnp',
  PermNodeMode = 'pnm',
  PermNodeRoles = 'pnr',
  PermNodeReset = 'pnx',
}

export interface DecodedUiId {
  sessionId: string;
  action: UiAction;
  args: string[];
}

/** Builds `ui:<sessionId>:<action>:<args...>`. */
export function buildUiId(
  sessionId: string,
  action: UiAction,
  ...args: Array<string | number>
): string {
  const id = [UI_NAMESPACE, sessionId, action, ...args.map(String)].join(':');
  if (id.length > 100) {
    throw new Error(`[ui/ids] customId exceeds Discord's 100 char limit: ${id}`);
  }
  return id;
}

/** Cheap prefix test used by the interaction router. */
export function isUiId(customId: string): boolean {
  return customId.startsWith(`${UI_NAMESPACE}:`);
}

const ACTION_VALUES = new Set<string>(Object.values(UiAction));

/** Parses a customId back into a typed shape. Returns null when malformed. */
export function decodeUiId(customId: string): DecodedUiId | null {
  if (!isUiId(customId)) return null;
  const [, sessionId, action, ...args] = customId.split(':');
  if (!sessionId || !action || !ACTION_VALUES.has(action)) return null;
  return { sessionId, action: action as UiAction, args };
}

/** Reads `args[index]` as a non-negative integer, falling back to `fallback`. */
export function numArg(args: string[], index: number, fallback = 0): number {
  const raw = Number(args[index]);
  return Number.isInteger(raw) && raw >= 0 ? raw : fallback;
}
