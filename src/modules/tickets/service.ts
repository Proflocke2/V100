/**
 * TICKETS — service layer.
 *
 * All business logic lives here. Handlers/commands call into this.
 * Repository handles persistence; this layer orchestrates Discord side-effects.
 *
 * Key responsibilities:
 *   checkCooldown()                 – rate-limit, open-ticket-count, and support-hours guard
 *   openTicket()                    – create channel, permissions, post welcome embed
 *   closeTicket()                   – transcript → log channel → archive → DM → survey → mark closed
 *   claimTicket()                   – assign staff, rename channel prefix
 *   unclaimTicket()                 – unassign staff
 *   addUserToTicket()               – add permissions for extra user
 *   removeUserFromTicket()          – remove permissions
 *   generateTranscriptAttachment()  – AttachmentBuilder for on-demand transcript
 *   runAutoclose()                  – close all inactive tickets in a guild (called by scheduler)
 *   refreshPanelMessage()           – live-edit a posted panel on category changes
 *   refreshMultiPanelMessage()      – live-edit a posted multi-panel
 */

import {
  Guild, ChannelType, PermissionFlagsBits, EmbedBuilder, AttachmentBuilder,
  TextChannel, OverwriteResolvable, User, MessageFlags,
} from 'discord.js';
import * as Repo from './repository';
import db from '../../database/db';
import { TicketStatus, FormAnswer, OpenResult, CooldownResult, ActivityEvent } from './types';
import {
  buildPanelEmbed, buildPanelComponents, buildTicketControls,
  buildMultiPanelEmbed, buildMultiPanelComponents,
  buildSurveyComponents, buildArchiveEmbed,
} from './builder';
import { generateTranscript } from './transcript';
import { tGuild } from '../../i18n';
import { recordTicketClosed } from '../staffActivity/service';

// ── Persistent cooldown (SQLite-backed, survives restarts) ───────────────────
function getCooldownTs(guildId: string, userId: string): number {
  const row = db.prepare(
    'SELECT MAX(last_ticket_at) as ts FROM tickets WHERE guild_id = ? AND user_id = ?'
  ).get(guildId, userId) as { ts: number | null } | undefined;
  return row?.ts ?? 0; // unix seconds
}

// ── Support hours helper ──────────────────────────────────────────────────────

/** Returns true if the current UTC time falls within the support window. */
function isWithinSupportHours(start: string, end: string): boolean {
  const now  = new Date();
  const hhmm = `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`;

  if (start <= end) {
    // Normal window  e.g. 09:00 – 18:00
    return hhmm >= start && hhmm <= end;
  } else {
    // Overnight window  e.g. 22:00 – 06:00
    return hhmm >= start || hhmm <= end;
  }
}

// ── Cooldown / open-limit check ───────────────────────────────────────────────

export function checkCooldown(guildId: string, userId: string): CooldownResult {
  const settings = Repo.getSettings(guildId);

  // Support hours gate
  if (
    settings.support_hours_enabled &&
    settings.support_hours_start &&
    settings.support_hours_end &&
    !isWithinSupportHours(settings.support_hours_start, settings.support_hours_end)
  ) {
    return {
      ok:            false,
      outsideHours:  true,
      nextOpen:      settings.support_hours_start,
    };
  }

  const last    = getCooldownTs(guildId, userId); // unix seconds
  const elapsed = Math.floor(Date.now() / 1000) - last; // seconds
  const need    = settings.cooldown_seconds; // seconds

  if (elapsed < need) return { ok: false, remaining: Math.ceil((need - elapsed) / 1000) };

  const open = Repo.countOpenTickets(guildId, userId);
  if (open >= settings.max_open) return { ok: false, openCount: open };

  return { ok: true };
}

// ── Permission overwrites ─────────────────────────────────────────────────────

function buildOverwrites(
  guild: Guild,
  userId: string,
  supportRoleId: string | null,
  extraStaffRoleIds: (string | null)[] = [],
): OverwriteResolvable[] {
  const overwrites: OverwriteResolvable[] = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: userId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.UseExternalEmojis,
      ],
    },
  ];

  // The category's own support role, plus admin_role_id / fallback_staff_role_id
  // from ticket_settings — deduplicated so a role that's set as both the
  // category's support role AND the guild-wide fallback doesn't get pushed
  // twice (Discord rejects duplicate overwrite targets in one create() call).
  const staffRoleIds = [...new Set([supportRoleId, ...extraStaffRoleIds].filter((id): id is string => !!id))];

  for (const roleId of staffRoleIds) {
    overwrites.push({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.UseExternalEmojis,
      ],
    });
  }

  if (guild.members.me) {
    overwrites.push({
      id: guild.members.me.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles,
      ],
    });
  }

  return overwrites;
}

// ── Channel name formatter ────────────────────────────────────────────────────

function formatChannelName(pattern: string, username: string, num: number, categoryLabel: string): string {
  const safeUser = username.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20) || 'user';
  const safeCat  = categoryLabel.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20) || 'ticket';
  const padded   = String(num).padStart(4, '0');
  return pattern
    .replace('{username}', safeUser)
    .replace('{category}', safeCat)
    .replace('{id}',       padded)
    .slice(0, 95)
    .toLowerCase();
}

// ── Open ticket ───────────────────────────────────────────────────────────────

export async function openTicket(
  guild: Guild,
  category: Repo.Category,
  userId: string,
  username: string,
  answers: FormAnswer[],
): Promise<OpenResult> {
  try {
    const settings = Repo.getSettings(guild.id);
    const num      = Repo.nextTicketNumber(guild.id);
    const name     = formatChannelName(settings.name_pattern, username, num, category.label);

    const channel = await guild.channels.create({
      name,
      type:               ChannelType.GuildText,
      parent:             category.category_id,
      permissionOverwrites: buildOverwrites(guild, userId, category.support_role_id, [settings.admin_role_id, settings.fallback_staff_role_id]),
      topic:              `Ticket #${String(num).padStart(4, '0')} • opened by <@${userId}>`,
    });

    // Wait for Discord to propagate the channel and its permission overwrites
    // before sending the welcome message. Without this, the send can fail silently.
    await new Promise(r => setTimeout(r, 1500));

    const ticket = Repo.insertTicket({
      guild_id:    guild.id,
      channel_id:  channel.id,
      user_id:     userId,
      panel_id:    category.panel_id,
      category_id: category.id,
      number:      num,
    });

    db.prepare(`UPDATE tickets SET last_ticket_at = ? WHERE guild_id = ? AND user_id = ? AND status = 'open'`).run(Math.floor(Date.now()/1000), guild.id, userId);

    // Log activity
    Repo.logActivity({ guild_id: guild.id, ticket_id: ticket.id, user_id: userId, event: ActivityEvent.Opened });

    const padded     = String(num).padStart(4, '0');
    const welcomeRaw = category.welcome_message
      ?? tGuild(guild.id, 'tickets.create.welcome_default', { user: `<@${userId}>` });

    const welcomeMsg = welcomeRaw
      .replace(/{user}/g,     `<@${userId}>`)
      .replace(/{channel}/g,  `<#${channel.id}>`)
      .replace(/{category}/g, category.label);

    const welcomeEmbed = new EmbedBuilder()
      .setTitle(tGuild(guild.id, 'tickets.create.welcome_title', {
        emoji:    category.emoji ?? '🎫',
        category: category.label,
        number:   padded,
      }))
      .setColor(settings.remove_branding ? '#5865f2' : '#5865f2')
      .setTimestamp();

    if (!settings.remove_branding) {
      welcomeEmbed.setFooter({ text: 'Powered by MultiBot' });
    }

    let desc = welcomeMsg;
    if (answers.length > 0) {
      desc += '\n\n━━━━━━━━━━━━━━━━━━━━━━━━\n';
      desc += answers.map(a => `**${a.label}**\n${a.value}`).join('\n\n');
    }
    welcomeEmbed.setDescription(desc.slice(0, 4096));

    const mentions = category.support_role_id
      ? `<@${userId}> <@&${category.support_role_id}>`
      : `<@${userId}>`;

    await channel.send({
      content:    mentions,
      embeds:     [welcomeEmbed],
      components: [buildTicketControls(guild.id, ticket.id)],
    }).catch(async (err) => {
      console.error('[Tickets] channel.send failed — retrying once after 2s:', err);
      await new Promise(r => setTimeout(r, 2000));
      await channel.send({
        content:    mentions,
        embeds:     [welcomeEmbed],
        components: [buildTicketControls(guild.id, ticket.id)],
      });
    });

    return { ok: true, channelId: channel.id, ticketId: ticket.id };
  } catch (e) {
    console.error('[Tickets] openTicket failed:', e);
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

// ── Close ticket ──────────────────────────────────────────────────────────────

export async function closeTicket(
  guild: Guild,
  ticket: Repo.TicketRecord,
  closedBy: string,
  reason?: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (ticket.status === TicketStatus.Closed) return { ok: false, reason: 'already_closed' };

  const channel  = guild.channels.cache.get(ticket.channel_id) as TextChannel | undefined;
  const settings = Repo.getSettings(guild.id);

  // Generate transcript once (shared for log + DM to avoid double fetch)
  let transcriptData: { buffer: Buffer; filename: string } | null = null;
  if (channel) {
    transcriptData = await generateTranscript(ticket, channel, settings.transcript_format).catch(() => null);
  }

  const padded = String(ticket.number).padStart(4, '0');

  // 1. Log to log channel
  if (settings.log_channel_id && channel) {
    const log = guild.channels.cache.get(settings.log_channel_id) as TextChannel | undefined;
    if (log) {
      try {
        const logEmbed = new EmbedBuilder()
          .setTitle(`🔒 Ticket #${padded} closed`)
          .setColor('#ed4245')
          .addFields(
            { name: 'Channel',   value: `#${channel.name}`,      inline: true },
            { name: 'Opener',    value: `<@${ticket.user_id}>`,  inline: true },
            { name: 'Closed by', value: `<@${closedBy}>`,        inline: true },
            ...(reason ? [{ name: 'Reason', value: reason.slice(0, 1024) }] : []),
          )
          .setTimestamp();

        const payload: Parameters<typeof log.send>[0] = { embeds: [logEmbed] };
        if (transcriptData) {
          (payload as any).files = [new AttachmentBuilder(transcriptData.buffer, { name: transcriptData.filename })];
        }
        await log.send(payload);
      } catch (err) {
        console.error('[Tickets] log channel send failed:', err);
      }
    }
  }

  // 2. Archive to archive channel (rename + move if archive_channel_id set)
  if (settings.archive_channel_id && channel) {
    const archiveCh = guild.channels.cache.get(settings.archive_channel_id) as TextChannel | undefined;
    if (archiveCh && transcriptData) {
      try {
        const archiveEmbed = buildArchiveEmbed(ticket, channel.name, guild.name);
        await archiveCh.send({
          embeds: [archiveEmbed],
          files:  [new AttachmentBuilder(transcriptData.buffer, { name: transcriptData.filename })],
        });
      } catch (err) {
        console.error('[Tickets] archive send failed:', err);
      }
    }
  }

  // 3. DM opener (optional — only if they didn't close it themselves)
  if (settings.dm_on_close && ticket.user_id !== closedBy) {
    try {
      const opener = await guild.members.fetch(ticket.user_id).catch(() => null);
      if (opener) {
        const dmEmbed = new EmbedBuilder()
          .setTitle(`🔒 Your ticket #${padded} was closed`)
          .setDescription(
            `**Server:** ${guild.name}\n` +
            `**Channel:** #${channel?.name ?? 'unknown'}\n` +
            (reason ? `**Reason:** ${reason}` : ''),
          )
          .setColor('#ed4245')
          .setTimestamp();

        const dmPayload: Parameters<typeof opener.send>[0] = { embeds: [dmEmbed] };
        if (transcriptData) {
          (dmPayload as any).files = [new AttachmentBuilder(transcriptData.buffer, { name: transcriptData.filename })];
        }
        await opener.send(dmPayload).catch(() => {});
      }
    } catch (err) {
      console.error('[Tickets] DM on close failed:', err);
    }
  }

  // 4. Exit survey — send to opener (ephemeral message in ticket channel)
  if (settings.survey_enabled && channel) {
    try {
      const surveyEmbed = new EmbedBuilder()
        .setTitle('⭐ How did we do?')
        .setDescription('Please rate the support you received. Your feedback helps us improve!')
        .setColor('#fee75c');

      await channel.send({
        embeds:     [surveyEmbed],
        components: [buildSurveyComponents(ticket.id)],
      }).catch(() => {});
    } catch (err) {
      console.error('[Tickets] survey send failed:', err);
    }
  }

  // 5. Persist closed state
  Repo.setTicketStatus(ticket.id, TicketStatus.Closed, reason);
  Repo.logActivity({ guild_id: guild.id, ticket_id: ticket.id, user_id: closedBy, event: ActivityEvent.Closed });

  // 6. Staff Activity Tracking — +1 weekly/total closed-ticket count for whoever
  //    closed it (skips self-closes automatically). No-op if the feature is
  //    disabled in guild config. See modules/staffActivity/service.ts.
  recordTicketClosed(guild.id, closedBy, ticket.user_id, ticket.created_at);

  return { ok: true };
}

// ── Claim ticket ──────────────────────────────────────────────────────────────

export async function claimTicket(
  guild: Guild,
  ticket: Repo.TicketRecord,
  claimedByUser: User,
): Promise<{ ok: boolean; alreadyClaimed?: string }> {
  // Bug fix: also check if ticket is closed before claiming
  if (ticket.status === TicketStatus.Closed) return { ok: false, alreadyClaimed: undefined };
  if (ticket.claimed_by) return { ok: false, alreadyClaimed: ticket.claimed_by };

  Repo.setTicketClaim(ticket.id, claimedByUser.id);
  Repo.logActivity({ guild_id: guild.id, ticket_id: ticket.id, user_id: claimedByUser.id, event: ActivityEvent.Claimed });

  const channel = guild.channels.cache.get(ticket.channel_id) as TextChannel | undefined;
  if (channel) {
    const base = channel.name.replace(/^claimed-/, '');
    await channel.setName(`claimed-${base}`.slice(0, 100)).catch(() => {});
  }

  return { ok: true };
}

// ── Unclaim ticket ────────────────────────────────────────────────────────────

export async function unclaimTicket(
  guild: Guild,
  ticket: Repo.TicketRecord,
  unclaimedByUser: User,
): Promise<{ ok: boolean }> {
  if (!ticket.claimed_by) return { ok: false };

  Repo.setTicketClaim(ticket.id, null);
  Repo.logActivity({ guild_id: guild.id, ticket_id: ticket.id, user_id: unclaimedByUser.id, event: ActivityEvent.Unclaimed });

  const channel = guild.channels.cache.get(ticket.channel_id) as TextChannel | undefined;
  if (channel) {
    const base = channel.name.replace(/^claimed-/, '');
    await channel.setName(base.slice(0, 100)).catch(() => {});
  }

  return { ok: true };
}

// ── Add / Remove user ─────────────────────────────────────────────────────────

export async function addUserToTicket(channel: TextChannel, userId: string): Promise<void> {
  await channel.permissionOverwrites.edit(userId, {
    ViewChannel: true, SendMessages: true, ReadMessageHistory: true,
    AttachFiles: true, EmbedLinks: true,
  });
}

export async function removeUserFromTicket(channel: TextChannel, userId: string): Promise<void> {
  await channel.permissionOverwrites.delete(userId).catch(() => {});
}

// ── Transcript attachment helper ──────────────────────────────────────────────

export async function generateTranscriptAttachment(
  guild: Guild,
  ticket: Repo.TicketRecord,
): Promise<AttachmentBuilder | null> {
  const channel = guild.channels.cache.get(ticket.channel_id) as TextChannel | undefined;
  if (!channel) return null;
  const settings            = Repo.getSettings(guild.id);
  const { buffer, filename } = await generateTranscript(ticket, channel, settings.transcript_format);
  return new AttachmentBuilder(buffer, { name: filename });
}

// ── Autoclose ─────────────────────────────────────────────────────────────────

/**
 * Runs autoclose for a specific guild.
 * Called by the scheduler every 5 minutes.
 * Closes all tickets that have been inactive for >= autoclose_hours.
 */
export async function runAutoclose(guild: Guild): Promise<number> {
  const settings = Repo.getSettings(guild.id);
  if (!settings.autoclose_enabled) return 0;

  const inactive = Repo.findInactiveTicketsForGuild(guild.id, settings.autoclose_hours);
  let closed = 0;

  for (const ticket of inactive) {
    try {
      const result = await closeTicket(guild, ticket, guild.members.me?.id ?? 'auto', 'Automatically closed due to inactivity');
      if (result.ok) {
        const channel = guild.channels.cache.get(ticket.channel_id) as TextChannel | undefined;
        if (channel) {
          await channel.send({
            embeds: [
              new EmbedBuilder()
                .setTitle('⏰ Ticket Auto-Closed')
                .setDescription(`This ticket was automatically closed due to **${settings.autoclose_hours}h** of inactivity.`)
                .setColor('#ed4245')
                .setTimestamp(),
            ],
          }).catch(() => {});

          // Delete channel after a short delay
          setTimeout(() => channel.delete().catch(() => {}), 10_000);
        }
        Repo.logActivity({ guild_id: guild.id, ticket_id: ticket.id, user_id: 'autoclose', event: ActivityEvent.AutoClosed });
        closed++;
      }
    } catch (err) {
      console.error(`[Tickets] autoclose failed for ticket ${ticket.id}:`, err);
    }
  }

  return closed;
}

// ── Panel message refresh ─────────────────────────────────────────────────────

export async function refreshPanelMessage(guild: Guild, panel: Repo.Panel): Promise<void> {
  if (!panel.message_id || !panel.channel_id) return;
  const ch  = guild.channels.cache.get(panel.channel_id) as TextChannel | undefined;
  if (!ch)  return;
  const msg = await ch.messages.fetch(panel.message_id).catch(() => null);
  if (!msg) return;
  const cats     = Repo.listCategories(panel.id);
  if (cats.length === 0) return;
  const settings = Repo.getSettings(guild.id);
  await msg.edit({
    content:    panel.content ?? null,
    embeds:     [buildPanelEmbed(panel, settings.remove_branding)],
    components: buildPanelComponents(panel, cats) as any,
  }).catch(() => {});
}

export async function refreshMultiPanelMessage(guild: Guild, multi: Repo.MultiPanel): Promise<void> {
  if (!multi.message_id || !multi.channel_id) return;
  const ch  = guild.channels.cache.get(multi.channel_id) as TextChannel | undefined;
  if (!ch)  return;
  const msg = await ch.messages.fetch(multi.message_id).catch(() => null);
  if (!msg) return;
  const ids      = JSON.parse(multi.panel_ids) as number[];
  const panels   = ids.map(id => Repo.getPanel(id)).filter((p): p is Repo.Panel => p !== null);
  const settings = Repo.getSettings(guild.id);
  await msg.edit({
    content:    multi.content ?? null,
    embeds:     [buildMultiPanelEmbed(multi, panels, settings.remove_branding)],
    components: buildMultiPanelComponents(multi, panels) as any,
  }).catch(() => {});
}
