/**
 * SERVER-BACKUP — structure snapshot + live restore.
 *
 * createStructureSnapshot — reads roles, channels (incl. permission
 *   overwrites), and the current ban list DIRECTLY from Discord's live
 *   API (not from anything the bot stores itself) and writes it to a
 *   versioned JSON file, same never-overwritten pattern as /backup.
 *
 * restoreStructureSnapshot — applies a saved snapshot BACK to the live
 *   guild: recreates any role/channel whose ID no longer exists, updates
 *   settings on ones that still do, and re-issues every banned ID. This is
 *   explicitly additive/corrective, never destructive — nothing present on
 *   the server now but absent from the snapshot gets deleted. A full
 *   wipe-and-replace would risk destroying live channel history for
 *   comparatively little benefit, and wasn't what was asked for; recreating
 *   what's missing and correcting what's changed is the safer interpretation
 *   of "restore my server structure."
 *
 * Because this writes live to Discord, the command wraps it behind an
 * explicit confirm button (see handleServerBackupRestoreButton) — never
 * called directly from the slash command without that step.
 */

import {
  Guild, Role, GuildChannel, ChannelType,
  OverwriteType, PermissionOverwrites,
  EmbedBuilder, ButtonInteraction,
} from 'discord.js';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import * as Repo from './repository';

const BACKUP_DIR = path.join(process.cwd(), 'server-backups');
if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });

const RESTORABLE_CHANNEL_TYPES = new Set([
  ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildCategory,
  ChannelType.GuildAnnouncement, ChannelType.GuildStageVoice, ChannelType.GuildForum,
]);

// ── Snapshot payload shape ───────────────────────────────────────────────────

interface RoleSnapshot {
  id: string; name: string; color: number; hoist: boolean;
  mentionable: boolean; permissions: string; position: number; managed: boolean;
}

interface OverwriteSnapshot { id: string; type: OverwriteType; allow: string; deny: string; }

interface ChannelSnapshot {
  id: string; name: string; type: ChannelType; parentId: string | null; position: number;
  topic: string | null; nsfw: boolean; rateLimitPerUser: number | null;
  bitrate: number | null; userLimit: number | null;
  overwrites: OverwriteSnapshot[];
}

interface BanSnapshot { userId: string; reason: string | null; }

interface ServerSnapshotPayload {
  guildId: string; version: string; createdAt: number;
  roles: RoleSnapshot[]; channels: ChannelSnapshot[]; bans: BanSnapshot[];
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createStructureSnapshot(guild: Guild): Promise<{ version: string; file: string; roles: number; channels: number; bans: number }> {
  const roles: RoleSnapshot[] = guild.roles.cache.map((r: Role) => ({
    id: r.id, name: r.name, color: r.color, hoist: r.hoist,
    mentionable: r.mentionable, permissions: r.permissions.bitfield.toString(),
    position: r.position, managed: r.managed,
  }));

  const channels: ChannelSnapshot[] = guild.channels.cache
    .filter(c => RESTORABLE_CHANNEL_TYPES.has(c.type))
    .map((c) => {
      const ch = c as GuildChannel;
      const overwrites: OverwriteSnapshot[] = ch.permissionOverwrites
        ? [...ch.permissionOverwrites.cache.values()].map((o: PermissionOverwrites) => ({
            id: o.id, type: o.type, allow: o.allow.bitfield.toString(), deny: o.deny.bitfield.toString(),
          }))
        : [];
      const anyCh = ch as unknown as {
        topic?: string | null; nsfw?: boolean; rateLimitPerUser?: number | null;
        bitrate?: number | null; userLimit?: number | null;
      };
      return {
        id: ch.id, name: ch.name, type: ch.type, parentId: ch.parentId, position: ch.position,
        topic: anyCh.topic ?? null, nsfw: anyCh.nsfw ?? false,
        rateLimitPerUser: anyCh.rateLimitPerUser ?? null,
        bitrate: anyCh.bitrate ?? null, userLimit: anyCh.userLimit ?? null,
        overwrites,
      };
    });

  const bansCollection = await guild.bans.fetch().catch(() => new Map());
  const bans: BanSnapshot[] = [...bansCollection.values()].map((b: any) => ({
    userId: b.user.id, reason: b.reason ?? null,
  }));

  const version = Repo.nextVersion(guild.id);
  const ts = Date.now();
  const filename = `server-${guild.id}-${version}-${ts}.json`;
  const filepath = path.join(BACKUP_DIR, filename);

  const payload: ServerSnapshotPayload = { guildId: guild.id, version, createdAt: ts, roles, channels, bans };
  writeFileSync(filepath, JSON.stringify(payload, null, 2), 'utf-8');

  Repo.recordSnapshot({
    guild_id: guild.id, version, file_path: filepath,
    roles: roles.length, channels: channels.length, bans: bans.length,
  });

  return { version, file: filename, roles: roles.length, channels: channels.length, bans: bans.length };
}

export function deleteStructureSnapshot(guildId: string, version: string): void {
  Repo.deleteByVersion(guildId, version);
  // File kept on disk, same "never delete the actual file" policy as /backup.
}

function readPayload(filePath: string): ServerSnapshotPayload {
  return JSON.parse(readFileSync(filePath, 'utf-8')) as ServerSnapshotPayload;
}

// ── Restore ───────────────────────────────────────────────────────────────────

export interface RestoreSummary {
  rolesCreated: number; rolesUpdated: number; rolesFailed: number;
  channelsCreated: number; channelsUpdated: number; channelsFailed: number;
  bansApplied: number; bansFailed: number;
  failures: string[];
}

export async function restoreStructureSnapshot(guild: Guild, version: string): Promise<RestoreSummary> {
  const meta = Repo.getByVersion(guild.id, version);
  if (!meta) throw new Error(`snapshot not found: ${version}`);
  const payload = readPayload(meta.file_path);
  if (payload.guildId !== guild.id) throw new Error('snapshot belongs to a different guild');

  const summary: RestoreSummary = {
    rolesCreated: 0, rolesUpdated: 0, rolesFailed: 0,
    channelsCreated: 0, channelsUpdated: 0, channelsFailed: 0,
    bansApplied: 0, bansFailed: 0, failures: [],
  };

  // ── Roles ──────────────────────────────────────────────────────────────────
  // snapshot role id → live role id, so channel overwrites (and role
  // creation itself) can point at whatever ID the role actually has NOW,
  // which for recreated roles is a brand-new snowflake.
  const roleIdMap = new Map<string, string>();

  for (const r of payload.roles) {
    if (r.id === guild.id) {
      // @everyone — can't be recreated or renamed, only its permissions matter.
      try {
        await guild.roles.everyone.setPermissions(BigInt(r.permissions), 'Server-backup restore: @everyone permissions');
        roleIdMap.set(r.id, guild.roles.everyone.id);
        summary.rolesUpdated++;
      } catch (err) {
        summary.rolesFailed++;
        summary.failures.push(`Role @everyone: ${errMsg(err)}`);
      }
      continue;
    }
    if (r.managed) { roleIdMap.set(r.id, r.id); continue; } // integration/booster roles — can't be manually created, skip silently

    const existing = guild.roles.cache.get(r.id);
    if (existing) {
      try {
        await existing.edit({
          name: r.name, color: r.color, hoist: r.hoist, mentionable: r.mentionable,
          permissions: BigInt(r.permissions), reason: 'Server-backup restore',
        });
        roleIdMap.set(r.id, existing.id);
        summary.rolesUpdated++;
      } catch (err) {
        roleIdMap.set(r.id, existing.id); // still usable for channel overwrites even if the edit failed
        summary.rolesFailed++;
        summary.failures.push(`Role "${r.name}": ${errMsg(err)}`);
      }
      continue;
    }

    try {
      const created = await guild.roles.create({
        name: r.name, color: r.color, hoist: r.hoist, mentionable: r.mentionable,
        permissions: BigInt(r.permissions), reason: 'Server-backup restore',
      });
      roleIdMap.set(r.id, created.id);
      summary.rolesCreated++;
    } catch (err) {
      summary.rolesFailed++;
      summary.failures.push(`Role "${r.name}" (create): ${errMsg(err)}`);
    }
  }

  // ── Channels ───────────────────────────────────────────────────────────────
  // Categories first, so children can resolve their new parent ID.
  const channelIdMap = new Map<string, string>();
  const byCategoryFirst = [...payload.channels].sort((a, b) =>
    (a.type === ChannelType.GuildCategory ? 0 : 1) - (b.type === ChannelType.GuildCategory ? 0 : 1));

  for (const c of byCategoryFirst) {
    const mappedParentId = c.parentId ? (channelIdMap.get(c.parentId) ?? c.parentId) : null;
    const overwrites = c.overwrites.map(o => {
      const mappedId = o.type === OverwriteType.Role ? (roleIdMap.get(o.id) ?? o.id) : o.id;
      return { id: mappedId, type: o.type, allow: BigInt(o.allow), deny: BigInt(o.deny) };
    });

    const existing = guild.channels.cache.get(c.id) as GuildChannel | undefined;
    try {
      if (existing) {
        await existing.edit({
          name: c.name,
          topic: 'topic' in existing ? c.topic ?? undefined : undefined,
          nsfw: 'nsfw' in existing ? c.nsfw : undefined,
          rateLimitPerUser: c.rateLimitPerUser ?? undefined,
          bitrate: c.bitrate ?? undefined,
          userLimit: c.userLimit ?? undefined,
          parent: mappedParentId ?? null,
          permissionOverwrites: overwrites,
          reason: 'Server-backup restore',
        } as never);
        channelIdMap.set(c.id, existing.id);
        summary.channelsUpdated++;
      } else {
        const created = await guild.channels.create({
          name: c.name, type: c.type as never, parent: mappedParentId ?? undefined,
          topic: c.topic ?? undefined, nsfw: c.nsfw, rateLimitPerUser: c.rateLimitPerUser ?? undefined,
          bitrate: c.bitrate ?? undefined, userLimit: c.userLimit ?? undefined,
          permissionOverwrites: overwrites, reason: 'Server-backup restore',
        } as never);
        channelIdMap.set(c.id, created.id);
        summary.channelsCreated++;
      }
    } catch (err) {
      summary.channelsFailed++;
      summary.failures.push(`Channel "${c.name}": ${errMsg(err)}`);
    }
  }

  // ── Bans ───────────────────────────────────────────────────────────────────
  // Purely additive — re-applies snapshot bans, never unbans anyone not in it.
  for (const b of payload.bans) {
    try {
      await guild.members.ban(b.userId, { reason: b.reason ?? 'Server-backup restore' });
      summary.bansApplied++;
    } catch (err) {
      summary.bansFailed++;
      summary.failures.push(`Ban ${b.userId}: ${errMsg(err)}`);
    }
  }

  return summary;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ── Auto server-backup scheduler ─────────────────────────────────────────────

function isAutoBackupDue(intervalMinutes: number, lastRunTs: number | null, now: Date): boolean {
  if (lastRunTs === null) return true;
  const elapsedMinutes = (now.getTime() / 1000 - lastRunTs) / 60;
  return elapsedMinutes >= intervalMinutes;
}

export async function runAutoServerBackupTick(guilds: Map<string, Guild>): Promise<void> {
  const now = new Date();
  const guildIds = Repo.getAutoServerBackupGuildIds();

  for (const guildId of guildIds) {
    const guild = guilds.get(guildId);
    if (!guild) continue;

    const cfg = Repo.getAutoServerBackupConfig(guildId);
    if (!cfg.enabled) continue;
    if (!isAutoBackupDue(cfg.intervalMinutes, cfg.lastRunTs, now)) continue;

    try {
      const snap = await createStructureSnapshot(guild);
      const meta = Repo.getByVersion(guildId, snap.version);
      if (!meta) continue;

      const buf = Buffer.from(readFileSync(meta.file_path));
      const { AttachmentBuilder } = await import('discord.js');
      const attachment = new AttachmentBuilder(buf, { name: `server-backup-${guildId}-${snap.version}.json` });
      const embed = new EmbedBuilder()
        .setTitle('🏗️ Automatic server-structure backup')
        .setColor('#ff6b35')
        .setDescription(
          `**${guild.name}** — version \`${snap.version}\`\n` +
          `${snap.roles} roles • ${snap.channels} channels • ${snap.bans} bans\n\n` +
          'This is the live Discord structure (roles/channels/permissions/bans), not the bot\'s own config — see `/backup` for that.',
        )
        .setTimestamp();

      if (cfg.delivery === 'channel' && cfg.channel) {
        const ch = guild.channels.cache.get(cfg.channel);
        if (ch && ch.isTextBased()) await ch.send({ embeds: [embed], files: [attachment] }).catch(() => {});
      } else if (cfg.delivery === 'dm' && cfg.recipient) {
        const member = await guild.members.fetch(cfg.recipient).catch(() => null);
        if (member) await member.send({ embeds: [embed], files: [attachment] }).catch(() => {});
      }
    } catch (err) {
      console.error(`[ServerBackup] Auto-backup failed for guild ${guildId}:`, err);
    } finally {
      Repo.setAutoServerBackupLastRunTs(guildId, Math.floor(now.getTime() / 1000));
    }
  }
}

// ── Restore confirm/cancel buttons ───────────────────────────────────────────
// customId: sbackup:restore_confirm:<version> | sbackup:restore_cancel

export async function handleServerBackupRestoreButton(btn: ButtonInteraction): Promise<void> {
  if (btn.customId === 'sbackup:restore_cancel') {
    await btn.update({
      embeds: [new EmbedBuilder().setColor('#95a5a6').setTitle('Cancelled').setDescription('No changes were made.')],
      components: [],
    });
    return;
  }

  const version = btn.customId.replace('sbackup:restore_confirm:', '');
  const guild = btn.guild;
  if (!guild) return;

  await btn.update({
    embeds: [new EmbedBuilder().setColor('#f1c40f').setTitle('⏳ Restoring…').setDescription('This can take a while for large servers — recreating/updating roles and channels one at a time to stay within Discord\'s rate limits.')],
    components: [],
  });

  try {
    const summary = await restoreStructureSnapshot(guild, version);
    const embed = new EmbedBuilder()
      .setColor(summary.rolesFailed + summary.channelsFailed + summary.bansFailed === 0 ? '#57f287' : '#e67e22')
      .setTitle('✅ Restore complete')
      .addFields(
        { name: 'Roles',    value: `${summary.rolesCreated} created, ${summary.rolesUpdated} updated${summary.rolesFailed ? `, ${summary.rolesFailed} failed` : ''}`, inline: true },
        { name: 'Channels', value: `${summary.channelsCreated} created, ${summary.channelsUpdated} updated${summary.channelsFailed ? `, ${summary.channelsFailed} failed` : ''}`, inline: true },
        { name: 'Bans',     value: `${summary.bansApplied} applied${summary.bansFailed ? `, ${summary.bansFailed} failed` : ''}`, inline: true },
      );
    if (summary.failures.length) {
      embed.addFields({ name: 'Failures (first 10)', value: summary.failures.slice(0, 10).map(f => `• ${f}`).join('\n') || 'none' });
    }
    await btn.editReply({ embeds: [embed] });
  } catch (err) {
    await btn.editReply({
      embeds: [new EmbedBuilder().setColor('#ed4245').setTitle('❌ Restore failed').setDescription(errMsg(err))],
    });
  }
}
