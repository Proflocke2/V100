import { Message, TextChannel, ChannelType } from 'discord.js';
import { BotClient } from '../utils/types';
import db, { getGuild, getUser } from '../database/db';
import { grantXp, announceLevelUp } from '../modules/leveling/service';
import { handleApplicationDM } from '../commands/application/applyHandler';
import { getLocalized, Language } from '../utils/localization';
import { recordActivity } from '../merged/impl/inactivitykick';
import { touchTicketActivity } from '../modules/tickets/repository';
import { handleAutomod3 } from '../modules/moderation/automod3Handler';
import { handleSecurityMessage } from '../modules/security/securityEngine';
import { onChannelMessage as onStickyChannelMessage } from '../modules/stickyMessage/service';
import { isChannelExempt } from '../modules/moderation/channelExceptions';
import { maybeTriggerLuckyDrop } from '../modules/luckyDrops/service';
import { recordChatActivity } from '../modules/activityCallout/service';
import { maybeLogMessage } from '../modules/serverBackup/messages';
import { isDiscordInvite, recordPartnerPost, getPartnerConfig } from '../modules/partnerTracking/service';
import { getAfk, clearAfk, elapsed } from '../modules/afk/service';
import '../modules/customCommands/service'; // registers custom_commands table

const SPAM_MAP = new Map<string, number[]>();

setInterval(() => {
  const cutoff = Date.now() - 5_000;
  for (const [key, times] of SPAM_MAP) {
    if (times.every(t => t < cutoff)) SPAM_MAP.delete(key);
  }
}, 60_000);

export default {
  async execute(message: Message, client: BotClient) {
    if (message.author.bot) return;

    if (message.channel.type === ChannelType.DM) {
      await handleApplicationDM(message);
      return;
    }

    if (!message.guild) return;

    // ── AFK system ────────────────────────────────────────────────────────────

    // 1. If the message author was AFK, clear their status (they're back).
    if (!message.author.bot) {
      const wasAfk = clearAfk(message.guild.id, message.author.id);
      if (wasAfk) {
        message.reply({ content: `👋 Welcome back, <@${message.author.id}>! I've removed your AFK status.` })
          .then(m => setTimeout(() => m.delete().catch(() => {}), 8000))
          .catch(() => {});
      }
    }

    // 2. If any mentioned user is AFK, reply once with their status.
    //    Capped at 3 mentions to avoid spammy replies on mass-pings.
    if (!message.author.bot && message.mentions.users.size > 0) {
      const replies: string[] = [];
      for (const [, user] of message.mentions.users) {
        if (user.bot || user.id === message.author.id) continue;
        const afk = getAfk(message.guild.id, user.id);
        if (!afk) continue;
        const time = elapsed(afk.set_at);
        replies.push(`😴 <@${user.id}> is AFK (${time} ago)${afk.reason ? ` — *${afk.reason}*` : '.'}`);
        if (replies.length >= 3) break;
      }
      if (replies.length) {
        message.reply({ content: replies.join('\n') }).catch(() => {});
      }
    }

    // ── Server-Backup message log — before ANYTHING else touches the message
    //    (moderation, automod, etc), so a message that gets deleted a moment
    //    later is still captured. No-ops instantly if the guild hasn't opted
    //    into message logging (see modules/serverBackup/messages.ts).
    maybeLogMessage(message);

    try { touchTicketActivity(message.channelId); } catch (_) {}
    try { recordActivity(message.guild.id, message.author.id); } catch (_) {}

    // ── Sticky Messages — re-post the pinned-style sticky at the bottom of
    //    the channel, if this channel has one configured. Fire-and-forget so
    //    a slow repost never delays the rest of message handling.
    onStickyChannelMessage(message).catch(() => {});

    // ── Per-user slowmode check ───────────────────────────────────────────────
    try {
      const slowRow = db.prepare('SELECT * FROM user_slowmode WHERE guild_id=? AND user_id=? AND channel_id=?')
        .get(message.guild.id, message.author.id, message.channelId) as any;
      if (slowRow) {
        const now = Math.floor(Date.now() / 1000);
        if (now - slowRow.last_message < slowRow.cooldown_seconds) {
          await message.delete().catch(() => {});
          const warn = await (message.channel as TextChannel).send(`<@${message.author.id}> You're in slowmode (${slowRow.cooldown_seconds}s).`);
          setTimeout(() => warn.delete().catch(() => {}), 4000);
          return;
        }
        db.prepare('UPDATE user_slowmode SET last_message=? WHERE guild_id=? AND user_id=? AND channel_id=?')
          .run(now, message.guild.id, message.author.id, message.channelId);
      }
    } catch (_) {}

    // ── Security Engine — highest priority, fire-and-forget for latency ───────
    // Returns true if message was handled (deleted/action taken) → skip further processing
    const handled = await handleSecurityMessage(message).catch(() => false);
    if (handled) return;

    const guild = getGuild(message.guild.id);
    const lang  = (guild.language || 'en') as Language;

    // ── AutoMod3 (Regex/Spam/MassPing/Phishing — higher-priority) ────────────
    await handleAutomod3(message);
    if (!message.deletable && !message.channel) return; // message was deleted by automod3

    // ── AutoMod (existing) ────────────────────────────────────────────────────
    if (guild.automod_enabled) {
      const lowerContent = message.content.toLowerCase();

      if (guild.automod_badwords && !isChannelExempt(message.guild.id, message.channelId, 'badwords')) {
        const words: string[] = JSON.parse(guild.automod_badwords);
        if (words.some(w => lowerContent.includes(w))) {
          await message.delete().catch(() => {});
          await (message.channel as TextChannel)
            .send(`<@${message.author.id}> ${getLocalized('automod.watch_language', lang)}`)
            .then((m: Message) => setTimeout(() => m.delete().catch(() => {}), 5000));
          return;
        }
      }

      if (guild.automod_antilink && !isChannelExempt(message.guild.id, message.channelId, 'antilink')) {
        const linkRegex = /(https?:\/\/|www\.)\S+/i;
        if (linkRegex.test(message.content) && !message.member?.permissions.has('ManageMessages')) {
          await message.delete().catch(() => {});
          await (message.channel as TextChannel)
            .send(`<@${message.author.id}> External links are not allowed.`)
            .then((m: Message) => setTimeout(() => m.delete().catch(() => {}), 5000));
          return;
        }
      }

      if (guild.automod_antiinvite && !isChannelExempt(message.guild.id, message.channelId, 'antiinvite')) {
        const inviteRegex = /discord\.gg\/\S+|discord\.com\/invite\/\S+/i;
        if (inviteRegex.test(message.content) && !message.member?.permissions.has('ManageMessages')) {
          await message.delete().catch(() => {});
          await (message.channel as TextChannel)
            .send(`<@${message.author.id}> Discord invites are not allowed.`)
            .then((m: Message) => setTimeout(() => m.delete().catch(() => {}), 5000));
          return;
        }
      }

      if (guild.automod_anticaps && !isChannelExempt(message.guild.id, message.channelId, 'anticaps')) {
        const text = message.content;
        if (text.length > 10) {
          const upper = text.replace(/[^a-zA-Z]/g, '');
          const capsRatio = upper.length > 0 ? (text.replace(/[^A-Z]/g, '').length / upper.length) : 0;
          if (capsRatio > 0.7) {
            await message.delete().catch(() => {});
            await (message.channel as TextChannel)
              .send(`<@${message.author.id}> Please avoid excessive CAPS LOCK.`)
              .then((m: Message) => setTimeout(() => m.delete().catch(() => {}), 5000));
            return;
          }
        }
      }

      if (guild.automod_antispam && !isChannelExempt(message.guild.id, message.channelId, 'antispam')) {
        const key    = `${message.guild.id}-${message.author.id}`;
        const now    = Date.now();
        const times  = SPAM_MAP.get(key) ?? [];
        times.push(now);
        const recent = times.filter(t => now - t < 5000);
        SPAM_MAP.set(key, recent);
        if (recent.length >= 5) {
          await message.delete().catch(() => {});
          await message.member?.timeout(30000, 'Spam detected').catch(() => {});
          return;
        }
      }
    }

    // ── Partner tracking — check if this is a discord.gg invite in the partners channel
    if (!message.author.bot && message.guild && isDiscordInvite(message.content)) {
      const pc = getPartnerConfig(message.guild.id);
      if (pc && pc.partners_channel === message.channelId) {
        recordPartnerPost(message.guild.id, message.author.id);
      }
    }

    // ── Engagement features (chat activity, independent of level_enabled) ────
    // Lucky drops and the activity callout are economy/social features, not
    // part of the leveling system — they still run even if a guild has
    // levels turned off entirely, gated only by their own guild settings.
    recordChatActivity(message.guild.id, message.author.id);
    maybeTriggerLuckyDrop(message).catch(() => {});

    // ── XP & Level System ─────────────────────────────────────────────────────
    if (!guild.level_enabled) return;

    const user = getUser(message.author.id, message.guild.id);
    const now  = Math.floor(Date.now() / 1000);

    if (now - user.last_xp < 30) return;

    const xpGain = Math.floor(Math.random() * 11) + 15;
    const { newLevel, newXp, leveledUp } = grantXp(message.author.id, message.guild.id, xpGain);

    db.prepare(
      'UPDATE users SET messages = messages + 1, last_xp = ? WHERE id = ? AND guild_id = ?'
    ).run(now, message.author.id, message.guild.id);

    if (leveledUp) {
      await announceLevelUp(message.guild, message.member, guild, lang, newLevel, newXp, message.channel as TextChannel);
    }
  },
};
