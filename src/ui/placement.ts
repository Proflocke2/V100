/**
 * src/ui/placement.ts
 *
 * Declares the four wizard hubs, their categories, and the rules that sort
 * every existing command leaf into exactly one of them.
 *
 * Nothing here duplicates command *options* — those are read straight off the
 * live SlashCommandBuilder JSON in catalog.ts, so a new option on any legacy
 * command shows up in the wizard automatically. This file only answers
 * "where does it live and who may run it".
 */

import { AccessLevel } from './permissions';

export type HubId = 'menu' | 'games' | 'staff' | 'config';

export interface HubDefinition {
  id: HubId;
  command: string;
  title: string;
  emoji: string;
  description: string;
  /** Minimum level required to open the hub at all. */
  level: AccessLevel;
  node: string;
}

export const HUBS: Record<HubId, HubDefinition> = {
  menu: {
    id: 'menu',
    command: 'menu',
    title: 'Member Menu',
    emoji: '🏠',
    description:
      'Everything you need as a member: economy, levels, tickets, feedback and handy tools. Pick a category below — every entry explains itself.',
    level: 'member',
    node: 'hub.menu',
  },
  games: {
    id: 'games',
    command: 'games',
    title: 'Game Center',
    emoji: '🎮',
    description:
      'Every game in one place. Solo, duel or party — pick a category, choose a game and start right away.',
    level: 'member',
    node: 'hub.games',
  },
  staff: {
    id: 'staff',
    command: 'staff',
    title: 'Staff Hub',
    emoji: '🛡️',
    description:
      'Moderation, member management, records and raid tools. You only see the areas you are cleared for on this server.',
    level: 'staff',
    node: 'hub.staff',
  },
  config: {
    id: 'config',
    command: 'config',
    title: 'Server Config',
    emoji: '⚙️',
    description:
      'Set up and fine-tune every module — security, tickets, welcome, economy, backups and the permission system itself.',
    level: 'admin',
    node: 'hub.config',
  },
};

export interface CategoryDefinition {
  id: string;
  hub: HubId;
  label: string;
  emoji: string;
  description: string;
}

/** Order matters — it is the order shown in the select menu. */
export const CATEGORIES: CategoryDefinition[] = [
  // ── /menu ──────────────────────────────────────────────────────────────────
  { id: 'economy', hub: 'menu', emoji: '💰', label: 'Economy', description: 'Earn, spend and gift coins, and shop for perks.' },
  { id: 'profile', hub: 'menu', emoji: '📈', label: 'Levels & Profile', description: 'Your rank, XP, leaderboards and stats.' },
  { id: 'community', hub: 'menu', emoji: '🎉', label: 'Community', description: 'Birthdays, polls, quotes and everything social.' },
  { id: 'tickets', hub: 'menu', emoji: '🎫', label: 'Support & Tickets', description: 'Open and rate support tickets.' },
  { id: 'tools', hub: 'menu', emoji: '🛠️', label: 'Tools', description: 'AFK, reminders, calculator, server info.' },
  { id: 'feedback', hub: 'menu', emoji: '📬', label: 'Feedback & Reports', description: 'Submit suggestions and report staff members.' },
  { id: 'privacy', hub: 'menu', emoji: '🔒', label: 'Your Data', description: 'View or delete the data stored about you (GDPR).' },
  { id: 'guides', hub: 'menu', emoji: '📖', label: 'Help & Guides', description: 'Guides to the bot and the server rules.' },
  { id: 'misc', hub: 'menu', emoji: '📦', label: 'Miscellaneous', description: 'Everything that does not fit elsewhere.' },

  // ── /games ─────────────────────────────────────────────────────────────────
  { id: 'games-solo', hub: 'games', emoji: '🎲', label: 'Solo & Puzzles', description: 'Games you play alone against the bot.' },
  { id: 'games-duel', hub: 'games', emoji: '⚔️', label: 'Duels', description: 'One on one — board, card and thinking games.' },
  { id: 'games-party', hub: 'games', emoji: '🃏', label: 'Party & Group', description: 'Three or more players, perfect for busy chats.' },
  { id: 'games-bet', hub: 'games', emoji: '🪙', label: 'Betting & Luck', description: 'Games where coins are on the line.' },
  { id: 'games-meta', hub: 'games', emoji: 'ℹ️', label: 'Rules & Leaderboards', description: 'Game guides, challenges, leaderboards.' },

  // ── /staff ─────────────────────────────────────────────────────────────────
  { id: 'mod-actions', hub: 'staff', emoji: '🔨', label: 'Moderation', description: 'Ban, timeout, warn, delete messages.' },
  { id: 'mod-members', hub: 'staff', emoji: '👤', label: 'Members', description: 'Kick, nickname, roles, mass actions.' },
  { id: 'mod-channels', hub: 'staff', emoji: '💬', label: 'Channels', description: 'Lockdown, slowmode, sticky mute, channel locks.' },
  { id: 'mod-records', hub: 'staff', emoji: '📋', label: 'Records & History', description: 'Infractions, notes, case files, escalation tiers.' },
  { id: 'mod-security', hub: 'staff', emoji: '🛡️', label: 'Raid & Security', description: 'Anti-raid, anti-nuke, attack simulations, emergency mode.' },
  { id: 'staff-tickets', hub: 'staff', emoji: '🎫', label: 'Ticket Handling', description: 'Claim, close, rename and tag tickets.' },
  { id: 'staff-comms', hub: 'staff', emoji: '📣', label: 'Communication', description: 'Embeds, giveaways, sticky messages, announcements.' },
  { id: 'staff-misc', hub: 'staff', emoji: '📦', label: 'More Staff Tools', description: 'Everything else in the staff area.' },

  // ── /config ────────────────────────────────────────────────────────────────
  { id: 'cfg-start', hub: 'config', emoji: '🚀', label: 'Getting Started', description: 'Quick-start wizards and base configuration.' },
  { id: 'cfg-security', hub: 'config', emoji: '🛡️', label: 'Security & AutoMod', description: 'Filters, anti-nuke, anti-raid, auto-defense, escalation.' },
  { id: 'cfg-tickets', hub: 'config', emoji: '🎫', label: 'Ticket System', description: 'Panels, ticket types, tags, transcripts, stats.' },
  { id: 'cfg-welcome', hub: 'config', emoji: '👋', label: 'Welcome & Leveling', description: 'Join/leave messages, auto-roles, the XP system.' },
  { id: 'cfg-economy', hub: 'config', emoji: '💰', label: 'Economy Settings', description: 'Shop, gambling limits, lottery, activity rewards.' },
  { id: 'cfg-modules', hub: 'config', emoji: '🧩', label: 'Modules & Automation', description: 'Suggestions, birthdays, chat revival, quotes, custom commands.' },
  { id: 'cfg-apply', hub: 'config', emoji: '📝', label: 'Applications & Verification', description: 'Application forms, panels and the verification gate.' },
  { id: 'cfg-team', hub: 'config', emoji: '📊', label: 'Team & Stats', description: 'Staff activity quotas, counter channels, partner program.' },
  { id: 'cfg-backups', hub: 'config', emoji: '💾', label: 'Backups', description: 'Bot and server backups, auto-snapshots, restore.' },
  { id: 'cfg-perms', hub: 'config', emoji: '🔑', label: 'Permissions', description: 'Staff and admin roles plus fine-grained per-command access.' },
  { id: 'cfg-diag', hub: 'config', emoji: '🩺', label: 'Diagnostics & Maintenance', description: 'Error logs, bot status, audit log, maintenance tasks.' },
  { id: 'cfg-misc', hub: 'config', emoji: '📦', label: 'Other Settings', description: 'Everything else in the admin area.' },
];

export const CATEGORY_BY_ID = new Map(CATEGORIES.map(c => [c.id, c]));

export interface Placement {
  hub: HubId;
  category: string;
  level: AccessLevel;
}

const DEFAULT_PLACEMENT: Placement = { hub: 'menu', category: 'misc', level: 'member' };

/**
 * Per top-level command. Applied to every leaf of that command unless a more
 * specific rule below overrides it.
 */
const BY_COMMAND: Record<string, Placement> = {
  // Member
  'economy': { hub: 'menu', category: 'economy', level: 'member' },
  'daily': { hub: 'menu', category: 'economy', level: 'member' },
  'pay': { hub: 'menu', category: 'economy', level: 'member' },
  'level': { hub: 'menu', category: 'profile', level: 'member' },
  'dashboard': { hub: 'menu', category: 'profile', level: 'member' },
  'birthday': { hub: 'menu', category: 'community', level: 'member' },
  'poll': { hub: 'menu', category: 'community', level: 'member' },
  'quoteboard': { hub: 'menu', category: 'community', level: 'member' },
  'afk': { hub: 'menu', category: 'tools', level: 'member' },
  'remind': { hub: 'menu', category: 'tools', level: 'member' },
  'calc': { hub: 'menu', category: 'tools', level: 'member' },
  'ping': { hub: 'menu', category: 'tools', level: 'member' },
  'info': { hub: 'menu', category: 'tools', level: 'member' },
  'cmd': { hub: 'menu', category: 'tools', level: 'member' },
  'suggest': { hub: 'menu', category: 'feedback', level: 'member' },
  'report-staff': { hub: 'menu', category: 'feedback', level: 'member' },
  'data': { hub: 'menu', category: 'privacy', level: 'member' },
  'guide': { hub: 'menu', category: 'guides', level: 'member' },
  'staff-guide': { hub: 'menu', category: 'guides', level: 'member' },
  'ticket': { hub: 'staff', category: 'staff-tickets', level: 'staff' },

  // Games
  'games-impl': { hub: 'games', category: 'games-party', level: 'member' },
  'play': { hub: 'games', category: 'games-meta', level: 'member' },
  'challenge': { hub: 'games', category: 'games-duel', level: 'member' },
  'eco-challenge': { hub: 'games', category: 'games-bet', level: 'member' },
  'slots': { hub: 'games', category: 'games-bet', level: 'member' },
  'blackjack': { hub: 'games', category: 'games-bet', level: 'member' },

  // Staff
  'ban': { hub: 'staff', category: 'mod-actions', level: 'staff' },
  'timeout': { hub: 'staff', category: 'mod-actions', level: 'staff' },
  'purge': { hub: 'staff', category: 'mod-actions', level: 'staff' },
  'warnings': { hub: 'staff', category: 'mod-actions', level: 'staff' },
  'member': { hub: 'staff', category: 'mod-members', level: 'staff' },
  'mass-action': { hub: 'staff', category: 'mod-members', level: 'admin' },
  'restrict': { hub: 'staff', category: 'mod-channels', level: 'staff' },
  'records': { hub: 'staff', category: 'mod-records', level: 'staff' },
  'raid-tools': { hub: 'staff', category: 'mod-security', level: 'admin' },
  'security': { hub: 'staff', category: 'mod-security', level: 'admin' },
  'mod': { hub: 'staff', category: 'mod-actions', level: 'staff' },
  'embed': { hub: 'staff', category: 'staff-comms', level: 'staff' },
  'giveaway': { hub: 'staff', category: 'staff-comms', level: 'staff' },
  'sticky': { hub: 'staff', category: 'staff-comms', level: 'staff' },

  // Config
  'setup': { hub: 'config', category: 'cfg-start', level: 'admin' },
  'bot-admin': { hub: 'config', category: 'cfg-start', level: 'admin' },
  'welcome': { hub: 'config', category: 'cfg-welcome', level: 'admin' },
  'application': { hub: 'config', category: 'cfg-apply', level: 'admin' },
  'chat-revival': { hub: 'config', category: 'cfg-modules', level: 'admin' },
  'bot-backup': { hub: 'config', category: 'cfg-backups', level: 'admin' },
  'server-backup': { hub: 'config', category: 'cfg-backups', level: 'admin' },
};

/**
 * Per leaf. Key format: `<command>` + `.<group>` + `.<sub>` — the longest
 * matching prefix wins, so `ticket.close` and `ticket` can coexist.
 */
const BY_LEAF: Record<string, Placement> = {
  // /ticket — member-facing leaf lives in the member hub, the rest is staff work
  'ticket.review': { hub: 'menu', category: 'tickets', level: 'member' },

  // /birthday — members set their own, admins configure the module
  'birthday.config': { hub: 'config', category: 'cfg-modules', level: 'admin' },

  // /suggest, /report-staff — submission vs. module configuration
  'suggest.config': { hub: 'config', category: 'cfg-modules', level: 'admin' },
  'report-staff.config': { hub: 'config', category: 'cfg-modules', level: 'admin' },

  // /quoteboard — pinning is community, wiring is admin
  'quoteboard.setup': { hub: 'config', category: 'cfg-modules', level: 'admin' },
  'quoteboard.disable': { hub: 'config', category: 'cfg-modules', level: 'admin' },

  // /economy — the config groups belong in the admin hub
  'economy.shop': { hub: 'menu', category: 'economy', level: 'member' },
  'economy.stats': { hub: 'menu', category: 'economy', level: 'member' },
  'economy.admin': { hub: 'config', category: 'cfg-economy', level: 'admin' },
  'economy.gambling': { hub: 'config', category: 'cfg-economy', level: 'admin' },
  'economy.lottery': { hub: 'config', category: 'cfg-economy', level: 'admin' },
  'economy.activity': { hub: 'config', category: 'cfg-economy', level: 'admin' },

  // /level — `rank`, `leaderboard` and `status` are what members look at;
  // everything else writes to the XP system and belongs to the admins.
  'level.set': { hub: 'config', category: 'cfg-welcome', level: 'admin' },
  'level.reset': { hub: 'config', category: 'cfg-welcome', level: 'admin' },
  'level.reset-user': { hub: 'config', category: 'cfg-welcome', level: 'admin' },
  'level.role': { hub: 'config', category: 'cfg-welcome', level: 'admin' },
  'level.remove-role': { hub: 'config', category: 'cfg-welcome', level: 'admin' },
  'level.toggle': { hub: 'config', category: 'cfg-welcome', level: 'admin' },
  'level.setup': { hub: 'config', category: 'cfg-welcome', level: 'admin' },
  'level.config': { hub: 'config', category: 'cfg-welcome', level: 'admin' },
  'level.channel': { hub: 'config', category: 'cfg-welcome', level: 'admin' },
  'level.season-config': { hub: 'config', category: 'cfg-welcome', level: 'admin' },
  'level.leaderboard-config': { hub: 'config', category: 'cfg-welcome', level: 'admin' },
  'level.leaderboard-season': { hub: 'config', category: 'cfg-welcome', level: 'admin' },
  'level.leaderboard-post': { hub: 'staff', category: 'staff-comms', level: 'staff' },

  // /mod — mixed bag
  'mod.channel': { hub: 'staff', category: 'mod-channels', level: 'staff' },
  'mod.history': { hub: 'staff', category: 'mod-records', level: 'staff' },
  'mod.attacksim': { hub: 'staff', category: 'mod-security', level: 'admin' },
  'mod.setup': { hub: 'config', category: 'cfg-security', level: 'admin' },

  // /security — configuration assistants
  'security.config': { hub: 'config', category: 'cfg-security', level: 'admin' },
  'security.antinuke': { hub: 'config', category: 'cfg-security', level: 'admin' },
  'security.antiraid': { hub: 'config', category: 'cfg-security', level: 'admin' },
  'security.auto-defend': { hub: 'config', category: 'cfg-security', level: 'admin' },
  'security.inactivity-kick': { hub: 'config', category: 'cfg-security', level: 'admin' },
  'security.ultra-mode': { hub: 'staff', category: 'mod-security', level: 'admin' },

  // /records — warn escalation thresholds are configuration
  'records.warnconfig': { hub: 'config', category: 'cfg-security', level: 'admin' },

  // /staff-guide — reading is for everyone, editing is not
  'staff-guide.manage': { hub: 'config', category: 'cfg-misc', level: 'admin' },

  // /sticky — status readout stays with the team, wiring too
  'sticky.status': { hub: 'staff', category: 'staff-comms', level: 'staff' },

  // /chat-revival — list is harmless, the rest is setup
  'chat-revival.list': { hub: 'staff', category: 'staff-misc', level: 'staff' },

  // /ticket — the panel/type/tag builder is configuration, not daily ticket work
  'ticket.setup': { hub: 'config', category: 'cfg-tickets', level: 'admin' },

  // /bot-admin — one command, seven very different jobs underneath it
  'bot-admin.dashboard': { hub: 'config', category: 'cfg-diag', level: 'admin' },
  'bot-admin.moderation': { hub: 'config', category: 'cfg-start', level: 'admin' },
  'bot-admin.tickets': { hub: 'config', category: 'cfg-start', level: 'admin' },
  'bot-admin.errorlog': { hub: 'config', category: 'cfg-diag', level: 'admin' },
  'bot-admin.config-audit': { hub: 'config', category: 'cfg-diag', level: 'admin' },
  'bot-admin.deploy': { hub: 'config', category: 'cfg-diag', level: 'admin' },
  'bot-admin.commands': { hub: 'config', category: 'cfg-diag', level: 'admin' },
  'bot-admin.disable': { hub: 'config', category: 'cfg-diag', level: 'admin' },
  'bot-admin.stats': { hub: 'config', category: 'cfg-team', level: 'admin' },
  'bot-admin.verification': { hub: 'config', category: 'cfg-apply', level: 'admin' },
  'bot-admin.partners': { hub: 'config', category: 'cfg-team', level: 'admin' },
  'bot-admin.custom-commands': { hub: 'config', category: 'cfg-modules', level: 'admin' },
  'bot-admin.customize': { hub: 'config', category: 'cfg-misc', level: 'admin' },
  'bot-admin.announce': { hub: 'staff', category: 'staff-comms', level: 'staff' },
  'bot-admin.webhook': { hub: 'staff', category: 'staff-comms', level: 'staff' },
  // Team activity: reading is team work, configuring is admin work
  'bot-admin.team-activity': { hub: 'config', category: 'cfg-team', level: 'admin' },
  'bot-admin.team-activity.leaderboard': { hub: 'staff', category: 'staff-misc', level: 'staff' },
  'bot-admin.team-activity.profile': { hub: 'staff', category: 'staff-misc', level: 'staff' },
  'bot-admin.team-activity.sponsor': { hub: 'staff', category: 'staff-misc', level: 'staff' },
};

/** Game leaves are grouped by name, since they all live under one command. */
const GAME_CATEGORY: Record<string, string> = {
  dice: 'games-solo',
  hangman: 'games-solo',
  minesweeper: 'games-solo',
  numguess: 'games-solo',
  quiz: 'games-solo',
  wordle: 'games-solo',
  higherorlower: 'games-solo',
  guesssong: 'games-solo',
  tictactoe: 'games-duel',
  connectfour: 'games-duel',
  chess: 'games-duel',
  battleship: 'games-duel',
  mastermind: 'games-duel',
  rps: 'games-duel',
  triviaduel: 'games-duel',
  yahtzee: 'games-duel',
  uno: 'games-party',
  ghostsagainst: 'games-party',
  memelord: 'games-party',
  truthordare: 'games-party',
  wouldyourather: 'games-party',
  whoami: 'games-party',
  guide: 'games-meta',
};

/**
 * Resolves the placement of one leaf.
 *
 * @param command Top-level command name as registered in `client.commands`.
 * @param group   Subcommand group, if any.
 * @param sub     Subcommand, if any.
 */
export function resolvePlacement(command: string, group?: string, sub?: string): Placement {
  if (command === 'games-impl') {
    const key = group ?? sub ?? '';
    const category = GAME_CATEGORY[key] ?? 'games-party';
    return { hub: 'games', category, level: 'member' };
  }

  const keys: string[] = [];
  if (group && sub) keys.push(`${command}.${group}.${sub}`);
  if (group) keys.push(`${command}.${group}`);
  if (!group && sub) keys.push(`${command}.${sub}`);

  for (const key of keys) {
    const hit = BY_LEAF[key];
    if (hit) return hit;
  }
  return BY_COMMAND[command] ?? DEFAULT_PLACEMENT;
}

/** Permission node for a leaf — mirrors the command tree. */
export function buildNode(command: string, group?: string, sub?: string): string {
  return ['cmd', command, group, sub].filter(Boolean).join('.');
}
