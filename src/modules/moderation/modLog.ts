/**
 * MOD LOG — logs server events into an admin channel.
 *
 * Geloggte Events:
 *   messageDelete           – Deleted messages
 *   messageUpdate           – Bearbeitete Nachrichten
 *   messageReactionAdd      – Added reactions
 *   messageReactionRemove   – Entfernte Reaktionen
 *   guildMemberAdd          – Beitritte
 *   guildMemberRemove       – Departures (with reason if kick/ban)
 *   voiceStateUpdate        – Voice-Join/Leave/Move
 *   channelCreate/Delete    – Channel created/deleted (incl. audit-log actor)
 *   roleCreate/Delete/Update – Role created/deleted/edited (update only on
 *                              name/color/permissions/hoist/mentionable change)
 *
 * Channel setup: /automod logchannel channel:#your-channel viewer_role:@HighStaff
 * (the viewer_role option automatically locks the channel down — see
 * merged/impl/automod2.ts — so only that role + the bot can view it).
 *
 * i18n: every embed here is built via tGuild(guild.id, 'modlog.*') against
 * src/locales/{en-US,de-DE}/modlog.json — the log posts in whatever language
 * the guild has configured (/settings language, same as everywhere else in
 * the bot), not hardcoded to one language. Add a locale by adding a
 * `modlog.json` under a new src/locales/<locale>/ directory; nothing here
 * needs to change.
 *
 * Partials: message/reaction objects can arrive "partial" (uncached, e.g.
 * after a restart or for old messages) — see events/messageReactionAdd.ts
 * and events/messageReactionRemove.ts, which call `.fetch()` on partials
 * before handing off to the functions below. A deleted message that was
 * NEVER cached can't be recovered (Discord doesn't send its content), so
 * logMessageDelete() falls back to a clear "uncached message" placeholder
 * instead of silently showing nothing.
 */

import {
  Guild, Message, PartialMessage, GuildMember, PartialGuildMember,
  TextChannel, EmbedBuilder, AuditLogEvent, MessageReaction, PartialMessageReaction,
  User, PartialUser, VoiceBasedChannel, NonThreadGuildBasedChannel, Role, ChannelType,
} from 'discord.js';
import db from '../../database/db';
import { tGuild } from '../../i18n';

// Distinct color per event type, per the logging spec.
const COLORS = {
  delete:         '#ed4245', // red
  edit:           '#e67e22', // orange
  reactionAdd:    '#57f287', // green
  reactionRemove: '#3498db', // blue
  voiceJoin:      '#57f287', // green
  voiceLeave:     '#99aab5', // grey
  voiceMove:      '#3498db', // blue
  channelCreate:  '#57f287', // green
  channelDelete:  '#ed4245', // red
  roleCreate:     '#57f287', // green
  roleDelete:     '#ed4245', // red
  roleUpdate:     '#e67e22', // orange
} as const;

/** Localized label for the common channel types — falls back to "Type {n}" for anything exotic. */
function channelTypeLabel(guildId: string, type: ChannelType): string {
  const key = (): string => {
    switch (type) {
      case ChannelType.GuildText:         return 'text';
      case ChannelType.GuildVoice:        return 'voice';
      case ChannelType.GuildCategory:     return 'category';
      case ChannelType.GuildAnnouncement: return 'announcement';
      case ChannelType.GuildStageVoice:   return 'stage';
      case ChannelType.GuildForum:        return 'forum';
      case ChannelType.GuildMedia:        return 'media';
      default:                            return 'other';
    }
  };
  return tGuild(guildId, `modlog.channel_type.${key()}`, { type });
}

// ── Config helpers ─────────────────────────────────────────────────────────────

export function getLogChannel(guildId: string): string | null {
  const row = db.prepare('SELECT mod_log_channel FROM guilds WHERE id = ?').get(guildId) as { mod_log_channel: string | null } | undefined;
  return row?.mod_log_channel ?? null;
}

async function sendLog(guild: Guild, embed: EmbedBuilder): Promise<void> {
  const channelId = getLogChannel(guild.id);
  if (!channelId) return;
  const ch = guild.channels.cache.get(channelId) as TextChannel | undefined;
  if (!ch) return;
  await ch.send({ embeds: [embed] }).catch(() => {});
}

// ── Event handlers ─────────────────────────────────────────────────────────────

export async function logMessageDelete(message: Message | PartialMessage): Promise<void> {
  if (!message.guild || message.author?.bot) return;
  const gid = message.guild.id;

  // A message that was never cached before deletion has no recoverable content —
  // Discord's gateway only sends the ID in that case. Say so clearly instead of
  // showing a blank/misleading field.
  const wasCached = !message.partial;
  const contentValue = wasCached
    ? ((message.content?.slice(0, 1024)) || tGuild(gid, 'modlog.message_deleted.content_empty'))
    : tGuild(gid, 'modlog.message_deleted.content_uncached');

  const embed = new EmbedBuilder()
    .setTitle(tGuild(gid, 'modlog.message_deleted.title'))
    .setColor(COLORS.delete)
    .addFields(
      { name: tGuild(gid, 'modlog.message_deleted.channel'), value: `<#${message.channelId}>`, inline: true },
      { name: tGuild(gid, 'modlog.message_deleted.author'),  value: message.author ? `<@${message.author.id}> (${message.author.tag})` : tGuild(gid, 'modlog.message_deleted.unknown_author'), inline: true },
      { name: tGuild(gid, 'modlog.message_deleted.content'), value: contentValue },
    )
    .setFooter({ text: tGuild(gid, 'modlog.message_deleted.footer_user_id', { id: message.author?.id ?? '?' }) })
    .setTimestamp();

  if (wasCached && message.attachments.size > 0) {
    embed.addFields({ name: tGuild(gid, 'modlog.message_deleted.attachments'), value: message.attachments.map(a => a.url).join('\n').slice(0, 1024) });
  }

  await sendLog(message.guild, embed);
}

export async function logMessageEdit(oldMsg: Message | PartialMessage, newMsg: Message | PartialMessage): Promise<void> {
  if (!newMsg.guild || newMsg.author?.bot) return;
  if (oldMsg.content === newMsg.content) return; // embed-only updates ignored
  const gid = newMsg.guild.id;

  // .slice() only trims the DISPLAYED length for the embed field — it never
  // touches the actual message.content, so paragraph breaks, blank lines,
  // and all other whitespace inside that first 512-char window come through
  // completely untouched. Discord embed fields render markdown/newlines
  // exactly like a normal message, so multi-paragraph edits still look the
  // same as what the user actually typed.
  const beforeValue = oldMsg.partial
    ? tGuild(gid, 'modlog.message_edited.before_uncached')
    : ((oldMsg.content?.slice(0, 512)) || tGuild(gid, 'modlog.message_edited.before_empty'));
  const afterValue = (newMsg.content?.slice(0, 512)) || tGuild(gid, 'modlog.message_edited.after_empty');

  const embed = new EmbedBuilder()
    .setTitle(tGuild(gid, 'modlog.message_edited.title'))
    .setColor(COLORS.edit)
    .addFields(
      { name: tGuild(gid, 'modlog.message_edited.channel'), value: `<#${newMsg.channelId}>`, inline: true },
      { name: tGuild(gid, 'modlog.message_edited.author'),  value: `<@${newMsg.author?.id}>`, inline: true },
      { name: tGuild(gid, 'modlog.message_edited.before'),  value: beforeValue },
      { name: tGuild(gid, 'modlog.message_edited.after'),   value: afterValue },
    )
    .setFooter({ text: tGuild(gid, 'modlog.message_edited.footer_user_id', { id: newMsg.author?.id ?? '?' }) })
    .setTimestamp();

  // .url is always constructible from guild/channel/message IDs, even for a
  // partial message — no fetch needed for the link itself.
  if (newMsg.url) embed.setURL(newMsg.url);

  await sendLog(newMsg.guild, embed);
}

export async function logReactionAdd(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser): Promise<void> {
  const message = reaction.message;
  if (!message.guild || user.bot) return;
  const gid = message.guild.id;

  const emojiDisplay = reaction.emoji.id
    ? `<${reaction.emoji.animated ? 'a' : ''}:${reaction.emoji.name}:${reaction.emoji.id}>`
    : (reaction.emoji.name ?? '❓');

  const embed = new EmbedBuilder()
    .setTitle(tGuild(gid, 'modlog.reaction_added.title'))
    .setColor(COLORS.reactionAdd)
    .addFields(
      { name: tGuild(gid, 'modlog.reaction_added.user'),    value: `<@${user.id}> (${user.id})`, inline: true },
      { name: tGuild(gid, 'modlog.reaction_added.emoji'),   value: emojiDisplay,                  inline: true },
      { name: tGuild(gid, 'modlog.reaction_added.channel'), value: `<#${message.channelId}>`,     inline: true },
      { name: tGuild(gid, 'modlog.reaction_added.message'), value: message.url ? tGuild(gid, 'modlog.reaction_added.message_link', { url: message.url }) : tGuild(gid, 'modlog.reaction_added.message_unavailable') },
    )
    .setTimestamp();

  await sendLog(message.guild, embed);
}

export async function logReactionRemove(reaction: MessageReaction | PartialMessageReaction, user: User | PartialUser): Promise<void> {
  const message = reaction.message;
  if (!message.guild || user.bot) return;
  const gid = message.guild.id;

  const emojiDisplay = reaction.emoji.id
    ? `<${reaction.emoji.animated ? 'a' : ''}:${reaction.emoji.name}:${reaction.emoji.id}>`
    : (reaction.emoji.name ?? '❓');

  const embed = new EmbedBuilder()
    .setTitle(tGuild(gid, 'modlog.reaction_removed.title'))
    .setColor(COLORS.reactionRemove)
    .addFields(
      { name: tGuild(gid, 'modlog.reaction_removed.user'),    value: `<@${user.id}> (${user.id})`, inline: true },
      { name: tGuild(gid, 'modlog.reaction_removed.emoji'),   value: emojiDisplay,                  inline: true },
      { name: tGuild(gid, 'modlog.reaction_removed.channel'), value: `<#${message.channelId}>`,     inline: true },
      { name: tGuild(gid, 'modlog.reaction_removed.message'), value: message.url ? tGuild(gid, 'modlog.reaction_removed.message_link', { url: message.url }) : tGuild(gid, 'modlog.reaction_removed.message_unavailable') },
    )
    .setTimestamp();

  await sendLog(message.guild, embed);
}

export async function logMemberJoin(member: GuildMember): Promise<void> {
  const gid = member.guild.id;
  const accountAge = Math.floor((Date.now() - member.user.createdTimestamp) / 86_400_000);

  const embed = new EmbedBuilder()
    .setTitle(tGuild(gid, 'modlog.member_join.title'))
    .setColor('#57f287')
    .setThumbnail(member.user.displayAvatarURL())
    .addFields(
      { name: tGuild(gid, 'modlog.member_join.user'),        value: `<@${member.id}> (${member.user.tag})`, inline: true },
      { name: tGuild(gid, 'modlog.member_join.account_age'), value: tGuild(gid, 'modlog.member_join.account_age_days', { days: accountAge }), inline: true },
      { name: tGuild(gid, 'modlog.member_join.created'),     value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
    )
    .setFooter({ text: tGuild(gid, 'modlog.member_join.footer', { id: member.id, count: member.guild.memberCount }) })
    .setTimestamp();

  await sendLog(member.guild, embed);
}

export async function logMemberLeave(member: GuildMember | PartialGuildMember): Promise<void> {
  const gid = member.guild.id;

  // Check audit log to detect kick/ban
  let leaveReason = tGuild(gid, 'modlog.member_leave.reason_voluntary');
  let color: `#${string}` = '#99aab5';

  try {
    const auditLogs = await member.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.MemberKick }).catch(() => null);
    const kickEntry = auditLogs?.entries.first();
    if (kickEntry && kickEntry.target?.id === member.id && Date.now() - kickEntry.createdTimestamp < 5000) {
      leaveReason = kickEntry.reason
        ? tGuild(gid, 'modlog.member_leave.reason_kicked_with_note', { executor: `<@${kickEntry.executor?.id}>`, note: kickEntry.reason })
        : tGuild(gid, 'modlog.member_leave.reason_kicked', { executor: `<@${kickEntry.executor?.id}>` });
      color = '#ed4245';
    }
  } catch {}

  const embed = new EmbedBuilder()
    .setTitle(tGuild(gid, 'modlog.member_leave.title'))
    .setColor(color)
    .setThumbnail(member.user?.displayAvatarURL() ?? null)
    .addFields(
      { name: tGuild(gid, 'modlog.member_leave.user'),   value: `<@${member.id}> (${member.user?.tag ?? '?'})`, inline: true },
      { name: tGuild(gid, 'modlog.member_leave.reason'), value: leaveReason, inline: true },
    )
    .setFooter({ text: tGuild(gid, 'modlog.member_leave.footer', { id: member.id, count: member.guild.memberCount }) })
    .setTimestamp();

  await sendLog(member.guild, embed);
}

// ── Voice events ──────────────────────────────────────────────────────────────
// NOTE on rate-limit risk: voiceMove in particular can get chatty in large,
// active servers (people hopping between channels a lot). If that becomes a
// problem in practice, this is the natural place to add its own
// staff_voice_log_enabled-style toggle later — deliberately not doing that
// now to keep this change scoped to "wire up the missing event types".

export async function logVoiceJoin(member: GuildMember, channel: VoiceBasedChannel): Promise<void> {
  if (member.user.bot) return;
  const gid = member.guild.id;

  const embed = new EmbedBuilder()
    .setTitle(tGuild(gid, 'modlog.voice_join.title'))
    .setColor(COLORS.voiceJoin)
    .addFields(
      { name: tGuild(gid, 'modlog.voice_join.user'),    value: `<@${member.id}> (${member.user.tag})`, inline: true },
      { name: tGuild(gid, 'modlog.voice_join.channel'), value: `<#${channel.id}>`,                     inline: true },
    )
    .setFooter({ text: tGuild(gid, 'modlog.voice_join.footer_user_id', { id: member.id }) })
    .setTimestamp();

  await sendLog(member.guild, embed);
}

export async function logVoiceLeave(member: GuildMember, channel: VoiceBasedChannel): Promise<void> {
  if (member.user.bot) return;
  const gid = member.guild.id;

  const embed = new EmbedBuilder()
    .setTitle(tGuild(gid, 'modlog.voice_leave.title'))
    .setColor(COLORS.voiceLeave)
    .addFields(
      { name: tGuild(gid, 'modlog.voice_leave.user'),    value: `<@${member.id}> (${member.user.tag})`, inline: true },
      { name: tGuild(gid, 'modlog.voice_leave.channel'), value: `<#${channel.id}>`,                     inline: true },
    )
    .setFooter({ text: tGuild(gid, 'modlog.voice_leave.footer_user_id', { id: member.id }) })
    .setTimestamp();

  await sendLog(member.guild, embed);
}

export async function logVoiceMove(member: GuildMember, oldChannel: VoiceBasedChannel, newChannel: VoiceBasedChannel): Promise<void> {
  if (member.user.bot) return;
  const gid = member.guild.id;

  const embed = new EmbedBuilder()
    .setTitle(tGuild(gid, 'modlog.voice_move.title'))
    .setColor(COLORS.voiceMove)
    .addFields(
      { name: tGuild(gid, 'modlog.voice_move.user'), value: `<@${member.id}> (${member.user.tag})`, inline: true },
      { name: tGuild(gid, 'modlog.voice_move.from'), value: `<#${oldChannel.id}>`,                  inline: true },
      { name: tGuild(gid, 'modlog.voice_move.to'),   value: `<#${newChannel.id}>`,                  inline: true },
    )
    .setFooter({ text: tGuild(gid, 'modlog.voice_move.footer_user_id', { id: member.id }) })
    .setTimestamp();

  await sendLog(member.guild, embed);
}

// ── Channel events ────────────────────────────────────────────────────────────

export async function logChannelCreate(channel: NonThreadGuildBasedChannel): Promise<void> {
  const gid = channel.guild.id;
  let creator = tGuild(gid, 'modlog.channel_create.unknown');
  try {
    const auditLogs = await channel.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.ChannelCreate }).catch(() => null);
    const entry = auditLogs?.entries.first();
    if (entry && entry.target?.id === channel.id && Date.now() - entry.createdTimestamp < 5000) {
      creator = `<@${entry.executor?.id}>`;
    }
  } catch {}

  const embed = new EmbedBuilder()
    .setTitle(tGuild(gid, 'modlog.channel_create.title'))
    .setColor(COLORS.channelCreate)
    .addFields(
      { name: tGuild(gid, 'modlog.channel_create.name'),       value: `<#${channel.id}>`,                     inline: true },
      { name: tGuild(gid, 'modlog.channel_create.type'),       value: channelTypeLabel(gid, channel.type),    inline: true },
      { name: tGuild(gid, 'modlog.channel_create.created_by'), value: creator,                                inline: true },
    )
    .setFooter({ text: tGuild(gid, 'modlog.channel_create.footer_channel_id', { id: channel.id }) })
    .setTimestamp();

  await sendLog(channel.guild, embed);
}

export async function logChannelDelete(channel: NonThreadGuildBasedChannel): Promise<void> {
  const gid = channel.guild.id;
  let deleter = tGuild(gid, 'modlog.channel_delete.unknown');
  try {
    const auditLogs = await channel.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.ChannelDelete }).catch(() => null);
    const entry = auditLogs?.entries.first();
    if (entry && entry.target?.id === channel.id && Date.now() - entry.createdTimestamp < 5000) {
      deleter = `<@${entry.executor?.id}>`;
    }
  } catch {}

  const embed = new EmbedBuilder()
    .setTitle(tGuild(gid, 'modlog.channel_delete.title'))
    // Channel is already gone at this point — <#id> would render as a dead
    // mention, so show the plain name instead (unlike logChannelCreate,
    // which can still link it).
    .setColor(COLORS.channelDelete)
    .addFields(
      { name: tGuild(gid, 'modlog.channel_delete.name'),       value: `#${channel.name}`,                     inline: true },
      { name: tGuild(gid, 'modlog.channel_delete.type'),       value: channelTypeLabel(gid, channel.type),    inline: true },
      { name: tGuild(gid, 'modlog.channel_delete.deleted_by'), value: deleter,                                inline: true },
    )
    .setFooter({ text: tGuild(gid, 'modlog.channel_delete.footer_channel_id', { id: channel.id }) })
    .setTimestamp();

  await sendLog(channel.guild, embed);
}

// ── Role events ───────────────────────────────────────────────────────────────

export async function logRoleCreate(role: Role): Promise<void> {
  const gid = role.guild.id;
  let creator = tGuild(gid, 'modlog.role_create.unknown');
  try {
    const auditLogs = await role.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.RoleCreate }).catch(() => null);
    const entry = auditLogs?.entries.first();
    if (entry && entry.target?.id === role.id && Date.now() - entry.createdTimestamp < 5000) {
      creator = `<@${entry.executor?.id}>`;
    }
  } catch {}

  const embed = new EmbedBuilder()
    .setTitle(tGuild(gid, 'modlog.role_create.title'))
    .setColor(COLORS.roleCreate)
    .addFields(
      { name: tGuild(gid, 'modlog.role_create.role'),        value: `${role}`,      inline: true },
      { name: tGuild(gid, 'modlog.role_create.color'),       value: role.hexColor,  inline: true },
      { name: tGuild(gid, 'modlog.role_create.created_by'),  value: creator,        inline: true },
    )
    .setFooter({ text: tGuild(gid, 'modlog.role_create.footer_role_id', { id: role.id }) })
    .setTimestamp();

  await sendLog(role.guild, embed);
}

export async function logRoleDelete(role: Role): Promise<void> {
  const gid = role.guild.id;
  let deleter = tGuild(gid, 'modlog.role_delete.unknown');
  try {
    const auditLogs = await role.guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent.RoleDelete }).catch(() => null);
    const entry = auditLogs?.entries.first();
    if (entry && entry.target?.id === role.id && Date.now() - entry.createdTimestamp < 5000) {
      deleter = `<@${entry.executor?.id}>`;
    }
  } catch {}

  const embed = new EmbedBuilder()
    .setTitle(tGuild(gid, 'modlog.role_delete.title'))
    .setColor(COLORS.roleDelete)
    .addFields(
      { name: tGuild(gid, 'modlog.role_delete.name'),        value: role.name,      inline: true },
      { name: tGuild(gid, 'modlog.role_delete.color'),       value: role.hexColor,  inline: true },
      { name: tGuild(gid, 'modlog.role_delete.deleted_by'),  value: deleter,        inline: true },
    )
    .setFooter({ text: tGuild(gid, 'modlog.role_delete.footer_role_id', { id: role.id }) })
    .setTimestamp();

  await sendLog(role.guild, embed);
}

/**
 * Only fires the log if something a human actually cares about changed —
 * name, color, permissions, hoisted, or mentionable. `position` changes
 * fire constantly (every drag-reorder touches EVERY role in the hierarchy)
 * and icon/unicode-emoji changes are rare and low-value here, so both are
 * deliberately ignored to avoid flooding the log channel with noise.
 */
export async function logRoleUpdate(oldRole: Role, newRole: Role): Promise<void> {
  const gid = newRole.guild.id;
  const changes: string[] = [];

  if (oldRole.name !== newRole.name) {
    changes.push(`**${tGuild(gid, 'modlog.role_update.field_name')}:** ${oldRole.name} → ${newRole.name}`);
  }
  if (oldRole.hexColor !== newRole.hexColor) {
    changes.push(`**${tGuild(gid, 'modlog.role_update.field_color')}:** ${oldRole.hexColor} → ${newRole.hexColor}`);
  }
  if (!oldRole.permissions.equals(newRole.permissions)) {
    const added   = newRole.permissions.toArray().filter(p => !oldRole.permissions.has(p));
    const removed = oldRole.permissions.toArray().filter(p => !newRole.permissions.has(p));
    const parts: string[] = [];
    if (added.length)   parts.push(`+ ${added.join(', ')}`);
    if (removed.length) parts.push(`− ${removed.join(', ')}`);
    changes.push(`**${tGuild(gid, 'modlog.role_update.field_permissions')}:**\n${parts.join('\n').slice(0, 500)}`);
  }
  if (oldRole.hoist !== newRole.hoist) {
    const y = tGuild(gid, 'modlog.role_update.yes');
    const n = tGuild(gid, 'modlog.role_update.no');
    changes.push(`**${tGuild(gid, 'modlog.role_update.field_hoisted')}:** ${oldRole.hoist ? y : n} → ${newRole.hoist ? y : n}`);
  }
  if (oldRole.mentionable !== newRole.mentionable) {
    const y = tGuild(gid, 'modlog.role_update.yes');
    const n = tGuild(gid, 'modlog.role_update.no');
    changes.push(`**${tGuild(gid, 'modlog.role_update.field_mentionable')}:** ${oldRole.mentionable ? y : n} → ${newRole.mentionable ? y : n}`);
  }

  if (changes.length === 0) return; // only position/icon etc changed — skip

  const embed = new EmbedBuilder()
    .setTitle(tGuild(gid, 'modlog.role_update.title'))
    .setColor(COLORS.roleUpdate)
    .addFields(
      { name: tGuild(gid, 'modlog.role_update.role'),    value: `${newRole}`, inline: true },
      { name: tGuild(gid, 'modlog.role_update.changes'), value: changes.join('\n').slice(0, 1024) },
    )
    .setFooter({ text: tGuild(gid, 'modlog.role_update.footer_role_id', { id: newRole.id }) })
    .setTimestamp();

  await sendLog(newRole.guild, embed);
}
