/**
 * src/ui/permissions.ts
 *
 * Granular, per-guild configurable access control for the wizard UI.
 *
 * Two layers, both stored in SQLite and both evaluated server-side *before*
 * any staff/admin view is rendered — never merely hidden in the client:
 *
 *   1. Access roles  — "which roles count as staff / admin on this server"
 *                      (table `ui_access_roles`), the coarse switch.
 *   2. Node overrides — per-command / per-subcommand rules
 *                      (table `ui_permission_overrides`), the scalpel.
 *
 * Nodes are dot-paths that mirror the command tree:
 *   hub.staff            → the whole /staff hub
 *   cmd.ban              → /ban
 *   cmd.security.antinuke        → /security antinuke *
 *   cmd.security.antinuke.setup  → one single leaf
 *
 * Resolution walks from the most specific node up to the hub node, so a
 * server can allow the entire moderation hub to @Moderator but carve out
 * `cmd.mass-action` for @Head-Mod only — or the other way round.
 */

import { GuildMember, PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import db from '../database/db';

export type AccessLevel = 'member' | 'staff' | 'admin' | 'owner';

export type OverrideMode = 'inherit' | 'allow' | 'deny' | 'roles';

export interface PermissionOverride {
  node: string;
  mode: OverrideMode;
  roleIds: string[];
}

export interface AccessDecision {
  allowed: boolean;
  /** Node that produced the decision — useful for the "why" line in the UI. */
  source: string;
  reason: string;
}

/** Ranking used when a node inherits its requirement from its parents. */
export const LEVEL_ORDER: Record<AccessLevel, number> = {
  member: 0,
  staff: 1,
  admin: 2,
  owner: 3,
};

export const LEVEL_LABEL: Record<AccessLevel, string> = {
  member: '👤 Member',
  staff: '🛡️ Staff',
  admin: '⚙️ Admin',
  owner: '👑 Server Owner',
};

/** Discord fallback permission when a guild has configured nothing at all. */
const LEVEL_FALLBACK_PERMISSION: Record<AccessLevel, bigint | null> = {
  member: null,
  staff: PermissionFlagsBits.ModerateMembers,
  admin: PermissionFlagsBits.ManageGuild,
  owner: PermissionFlagsBits.Administrator,
};

// ── Schema ───────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS ui_access_roles (
    guild_id TEXT NOT NULL,
    level    TEXT NOT NULL,
    role_id  TEXT NOT NULL,
    PRIMARY KEY (guild_id, level, role_id)
  );
  CREATE TABLE IF NOT EXISTS ui_permission_overrides (
    guild_id   TEXT NOT NULL,
    node       TEXT NOT NULL,
    mode       TEXT NOT NULL DEFAULT 'inherit',
    role_ids   TEXT NOT NULL DEFAULT '[]',
    updated_at INTEGER DEFAULT (unixepoch()),
    updated_by TEXT,
    PRIMARY KEY (guild_id, node)
  );
`);

// ── Access roles ─────────────────────────────────────────────────────────────

interface AccessRoleRow { role_id: string }

export function getAccessRoles(guildId: string, level: AccessLevel): string[] {
  const rows = db
    .prepare('SELECT role_id FROM ui_access_roles WHERE guild_id = ? AND level = ?')
    .all(guildId, level) as AccessRoleRow[];
  return rows.map(r => r.role_id);
}

/** Replaces the full role list for one level (the editor always sends a full set). */
export function setAccessRoles(guildId: string, level: AccessLevel, roleIds: string[]): void {
  db.prepare('DELETE FROM ui_access_roles WHERE guild_id = ? AND level = ?').run(guildId, level);
  const insert = db.prepare(
    'INSERT OR IGNORE INTO ui_access_roles (guild_id, level, role_id) VALUES (?, ?, ?)',
  );
  for (const roleId of roleIds) insert.run(guildId, level, roleId);
}

// ── Node overrides ───────────────────────────────────────────────────────────

interface OverrideRow { node: string; mode: string; role_ids: string }

function parseRoleIds(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export function getOverride(guildId: string, node: string): PermissionOverride | null {
  const row = db
    .prepare('SELECT node, mode, role_ids FROM ui_permission_overrides WHERE guild_id = ? AND node = ?')
    .get(guildId, node) as OverrideRow | undefined;
  if (!row) return null;
  return { node: row.node, mode: row.mode as OverrideMode, roleIds: parseRoleIds(row.role_ids) };
}

export function listOverrides(guildId: string): PermissionOverride[] {
  const rows = db
    .prepare('SELECT node, mode, role_ids FROM ui_permission_overrides WHERE guild_id = ? ORDER BY node')
    .all(guildId) as OverrideRow[];
  return rows.map(r => ({ node: r.node, mode: r.mode as OverrideMode, roleIds: parseRoleIds(r.role_ids) }));
}

export function setOverride(
  guildId: string,
  node: string,
  mode: OverrideMode,
  roleIds: string[],
  updatedBy: string,
): void {
  if (mode === 'inherit') {
    clearOverride(guildId, node);
    return;
  }
  db.prepare(`
    INSERT INTO ui_permission_overrides (guild_id, node, mode, role_ids, updated_at, updated_by)
    VALUES (?, ?, ?, ?, unixepoch(), ?)
    ON CONFLICT(guild_id, node) DO UPDATE SET
      mode = excluded.mode,
      role_ids = excluded.role_ids,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by
  `).run(guildId, node, mode, JSON.stringify(roleIds), updatedBy);
}

export function clearOverride(guildId: string, node: string): void {
  db.prepare('DELETE FROM ui_permission_overrides WHERE guild_id = ? AND node = ?').run(guildId, node);
}

// ── Resolution ───────────────────────────────────────────────────────────────

/** `cmd.security.antinuke.setup` → [`cmd.security.antinuke.setup`, `cmd.security.antinuke`, `cmd.security`]. */
export function nodeChain(node: string): string[] {
  const parts = node.split('.');
  const chain: string[] = [];
  for (let i = parts.length; i > 1; i--) chain.push(parts.slice(0, i).join('.'));
  return chain;
}

function hasAnyRole(member: GuildMember, roleIds: string[]): boolean {
  return roleIds.some(id => member.roles.cache.has(id));
}

function memberPermissions(member: GuildMember): PermissionsBitField {
  return member.permissions;
}

/**
 * The single authority on "may this member touch this node".
 *
 * @param hubNode Node of the owning hub (`hub.staff`), consulted last so a
 *                blanket hub rule still governs commands with no own override.
 */
export function resolveAccess(
  member: GuildMember,
  node: string,
  level: AccessLevel,
  hubNode?: string,
): AccessDecision {
  const guildId = member.guild.id;

  if (member.id === member.guild.ownerId) {
    return { allowed: true, source: node, reason: 'Server owner' };
  }
  if (memberPermissions(member).has(PermissionFlagsBits.Administrator)) {
    return { allowed: true, source: node, reason: 'Administrator permission' };
  }
  if (level === 'owner') {
    return { allowed: false, source: node, reason: 'Nur der Server owner darf das.' };
  }

  const chain = hubNode ? [...nodeChain(node), hubNode] : nodeChain(node);
  for (const candidate of chain) {
    const override = getOverride(guildId, candidate);
    if (!override || override.mode === 'inherit') continue;

    if (override.mode === 'allow') {
      return { allowed: true, source: candidate, reason: 'Override: allowed for everyone' };
    }
    if (override.mode === 'deny') {
      return { allowed: false, source: candidate, reason: 'Override: blocked' };
    }
    // mode === 'roles'
    if (hasAnyRole(member, override.roleIds)) {
      return { allowed: true, source: candidate, reason: 'Override: role access' };
    }
    return {
      allowed: false,
      source: candidate,
      reason: 'You are missing one of the allowed roles.',
    };
  }

  if (level === 'member') {
    return { allowed: true, source: node, reason: 'Member feature' };
  }

  // Configured access roles (staff implies admin-level roles too).
  const acceptedLevels: AccessLevel[] = level === 'staff' ? ['staff', 'admin'] : ['admin'];
  let configured = false;
  for (const lvl of acceptedLevels) {
    const roles = getAccessRoles(guildId, lvl);
    if (roles.length > 0) {
      configured = true;
      if (hasAnyRole(member, roles)) {
        return { allowed: true, source: node, reason: `${LEVEL_LABEL[lvl]}role` };
      }
    }
  }
  if (configured) {
    return {
      allowed: false,
      source: node,
      reason: `Requires a ${LEVEL_LABEL[level]}role (in \`/config → Berechtigungen\` festgelegt).`,
    };
  }

  // Nothing configured anywhere → fall back to plain Discord permissions.
  const fallback = LEVEL_FALLBACK_PERMISSION[level];
  if (fallback && memberPermissions(member).has(fallback)) {
    return { allowed: true, source: node, reason: 'Discord permission' };
  }
  return {
    allowed: false,
    source: node,
    reason: `Requires ${LEVEL_LABEL[level]} — konfigurierbar über \`/config → Berechtigungen\`.`,
  };
}

/** Convenience wrapper for call sites that only care about the boolean. */
export function canAccess(
  member: GuildMember,
  node: string,
  level: AccessLevel,
  hubNode?: string,
): boolean {
  return resolveAccess(member, node, level, hubNode).allowed;
}
