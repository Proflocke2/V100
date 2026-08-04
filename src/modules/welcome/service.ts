/**
 * WELCOME — service.
 *
 * onMemberJoin   — runs alt-detection, posts welcome message + card, sends DM,
 *                  applies instant + delayed auto-roles.
 * onMemberLeave  — posts leave message in configured channel.
 * applyDueRoles  — called by the scheduler to attach delayed roles.
 * applyAfterVerifyRole — called by the verification module on success.
 */

import {
  GuildMember, EmbedBuilder, AttachmentBuilder, TextChannel, PartialGuildMember, GuildChannel,
} from 'discord.js';
import * as Repo from './repository';
import { createWelcomeCard } from './card';
import { tGuild } from '../../i18n';
import { replacePlaceholders } from '../../utils/helpers';

function placeholders(member: GuildMember | PartialGuildMember, channelCache?: ReadonlyMap<string, GuildChannel | undefined>) {
  return {
    user:        member.user?.tag ?? 'unknown',
    username:    member.user?.username ?? 'unknown',
    mention:     member.toString(),
    server:      member.guild.name,
    membercount: member.guild.memberCount.toString(),
    join_date:   new Date().toISOString().slice(0, 10),
    // Dynamic channel placeholders work via {channel:<channel_id>} syntax —
    // resolved by resolveDynamicPlaceholders() after the static replace pass.
  };
}

/**
 * After the static placeholder pass, resolve {channel:<id>} tokens into
 * Discord channel mentions (<#id>). Safe to run on any string — tokens that
 * don't match a real channel are left as-is so they're visible in the result
 * rather than silently stripped.
 */
function resolveDynamicPlaceholders(text: string): string {
  return text.replace(/\{channel:(\d{17,20})\}/g, (_, id) => `<#${id}>`);
}

function ageDays(member: GuildMember): number {
  return Math.floor((Date.now() - member.user.createdTimestamp) / 86_400_000);
}

async function handleAltDetection(member: GuildMember, s: Repo.WelcomeSettings): Promise<boolean> {
  if (!s.alt_enabled) return false;
  if (ageDays(member) >= s.alt_min_age_days) return false;

  const gid = member.guild.id;

  if (s.alt_log_channel_id) {
    const ch = member.guild.channels.cache.get(s.alt_log_channel_id) as TextChannel | undefined;
    if (ch) {
      const e = new EmbedBuilder()
        .setColor('#fee75c')
        .setTitle(tGuild(gid, 'welcome.alt.log_title'))
        .setDescription(tGuild(gid, 'welcome.alt.log_desc', {
          user: `<@${member.id}>`,
          age: `${ageDays(member)}d`,
          timestamp: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
        }))
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp();
      ch.send({ embeds: [e] }).catch(() => {});
    }
  }

  if (s.alt_action === 'kick') {
    const dm = tGuild(gid, 'welcome.alt.action_dm_kick', {
      server: member.guild.name, days: s.alt_min_age_days,
    });
    await member.send(dm).catch(() => {});
    await member.kick(tGuild(gid, 'welcome.alt.action_kick')).catch(() => {});
    return true; // skip welcome flow for kicked members
  }
  return false;
}

async function applyAutoRoles(member: GuildMember, s: Repo.WelcomeSettings): Promise<void> {
  if (s.autorole_id) {
    await member.roles.add(s.autorole_id, 'Welcome auto-role').catch(() => {});
  }
  if (s.autorole_delay_id && s.autorole_delay_min > 0) {
    Repo.schedulePendingRole(
      member.guild.id, member.id, s.autorole_delay_id,
      Math.floor(Date.now() / 1000) + s.autorole_delay_min * 60,
    );
  }
}

async function sendWelcomeMessage(member: GuildMember, s: Repo.WelcomeSettings): Promise<void> {
  if (!s.channel_id) return;
  const channel = member.guild.channels.cache.get(s.channel_id) as TextChannel | undefined;
  if (!channel) return;

  const ph = placeholders(member);
  const text = resolveDynamicPlaceholders(
    s.message
      ? replacePlaceholders(s.message, ph)
      : replacePlaceholders(tGuild(member.guild.id, 'welcome.default_message'), ph)
  );

  let attachment: AttachmentBuilder | null = null;
  if (s.use_card) {
    try {
      const buf = await createWelcomeCard(member, s.background_url, s.card_image_url, s.avatar_bg_enabled === 1);
      attachment = new AttachmentBuilder(buf, { name: 'welcome.png' });
    } catch (err) {
      console.error('[Welcome] card failed:', err);
    }
  }

  const e = new EmbedBuilder()
    .setColor((s.color || '#5865f2') as `#${string}`)
    .setDescription(text)
    .setTimestamp();
  if (attachment) e.setImage('attachment://welcome.png');

  await channel.send({
    content: member.toString(),
    embeds: [e],
    files: attachment ? [attachment] : [],
  }).catch(() => {});
}

async function sendDmIfEnabled(member: GuildMember, s: Repo.WelcomeSettings): Promise<void> {
  if (!s.dm_enabled) return;
  const ph = placeholders(member);
  const text = resolveDynamicPlaceholders(
    s.dm_message
      ? replacePlaceholders(s.dm_message, ph)
      : replacePlaceholders(tGuild(member.guild.id, 'welcome.default_dm'), ph)
  );
  await member.send(text).catch(() => {});
}

export async function onMemberJoin(member: GuildMember): Promise<void> {
  const s = Repo.getSettings(member.guild.id);
  if (!s.enabled) return;

  const skipped = await handleAltDetection(member, s);
  if (skipped) return;

  await applyAutoRoles(member, s);
  await sendWelcomeMessage(member, s);
  await sendDmIfEnabled(member, s);
}

export async function onMemberLeave(member: GuildMember | PartialGuildMember): Promise<void> {
  const s = Repo.getSettings(member.guild.id);
  if (!s.leave_enabled || !s.leave_channel_id) return;
  const ch = member.guild.channels.cache.get(s.leave_channel_id) as TextChannel | undefined;
  if (!ch) return;

  const ph = placeholders(member);
  const text = resolveDynamicPlaceholders(
    s.leave_message
      ? replacePlaceholders(s.leave_message, ph)
      : replacePlaceholders(tGuild(member.guild.id, 'welcome.default_leave_message'), ph)
  );

  const e = new EmbedBuilder()
    .setColor((s.leave_color || '#ed4245') as `#${string}`)
    .setDescription(text)
    .setTimestamp();
  if (member.user) e.setThumbnail(member.user.displayAvatarURL());

  await ch.send({ embeds: [e] }).catch(() => {});
}

export async function applyDueRoles(client: import('discord.js').Client): Promise<void> {
  const due = Repo.listDuePendingRoles(Math.floor(Date.now() / 1000));
  for (const row of due) {
    const guild = client.guilds.cache.get(row.guild_id);
    Repo.deletePendingRole(row.id);
    if (!guild) continue;
    const member = await guild.members.fetch(row.user_id).catch(() => null);
    if (!member) continue;
    await member.roles.add(row.role_id, 'Welcome delayed auto-role').catch(() => {});
  }
}

export async function applyAfterVerifyRole(member: GuildMember): Promise<void> {
  const s = Repo.getSettings(member.guild.id);
  if (!s.autorole_after_verify) return;
  await member.roles.add(s.autorole_after_verify, 'Welcome post-verification role').catch(() => {});
}
