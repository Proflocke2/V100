import {
  SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits,
  EmbedBuilder, GuildMember, MessageFlags,
} from 'discord.js';
import { requirePermission } from '../../utils/guards';
import { success, error } from '../../utils/embeds';
import { addStickyMute, removeStickyMute, getStickyMute, listStickyMutes } from '../../modules/moderation/stickyMute';
import db, { getGuild } from '../../database/db';
import { getLocalized, Language } from '../../utils/localization';

export default {
  data: new SlashCommandBuilder()
    .setName('stickymute')
    .setDescription('Sticky Mute — persists even if the user leaves and rejoins')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false)
    .addSubcommand(s => s.setName('add').setDescription('Apply a sticky mute')
      .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
      .addStringOption(o => o.setName('duration').setDescription('Duration: e.g. 1h, 30m, 7d, permanent (default: permanent)'))
      .addStringOption(o => o.setName('reason').setDescription('Reason')))
    .addSubcommand(s => s.setName('remove').setDescription('Remove a sticky mute')
      .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true)))
    .addSubcommand(s => s.setName('list').setDescription('Show all active sticky mutes')),

  async execute(ix: ChatInputCommandInteraction) {
    if (!await requirePermission(ix, PermissionFlagsBits.ModerateMembers)) return;
    const sub  = ix.options.getSubcommand();
    const gid  = ix.guildId!;
    const lang = ((getGuild(gid) as any).language || 'en') as Language;
    const t    = (key: string, vars?: Record<string, string>) => getLocalized(key, lang, vars);

    if (sub === 'add') {
      const user   = ix.options.getUser('user', true);
      const durStr = ix.options.getString('duration') ?? 'permanent';
      const reason = ix.options.getString('reason') ?? 'No reason provided';
      const member = ix.options.getMember('user') as GuildMember | null;

      let expiresAt = 0, durationMs = 0;

      if (durStr.toLowerCase() !== 'permanent') {
        const match = durStr.match(/^(\d+)(s|m|h|d|w)$/i);
        if (!match) return ix.reply({ embeds: [error('Error', t('stickymute.invalid_duration'))], flags: MessageFlags.Ephemeral });
        const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
        durationMs = parseInt(match[1]) * multipliers[match[2].toLowerCase()] * 1000;
        expiresAt  = Math.floor(Date.now() / 1000) + Math.floor(durationMs / 1000);
      }

      if (member) {
        const maxMs = 28 * 24 * 60 * 60 * 1000;
        await member.timeout(durationMs > 0 ? Math.min(durationMs, maxMs) : maxMs, `[Sticky Mute] ${reason}`).catch(() => {});
        const muteRoleId = (db.prepare('SELECT mute_role FROM guilds WHERE id = ?').get(gid) as any)?.mute_role;
        if (muteRoleId) await member.roles.add(muteRoleId, `[Sticky Mute] ${reason}`).catch(() => {});
      }

      addStickyMute(gid, user.id, expiresAt, reason, ix.user.id);
      const duration = expiresAt > 0 ? `<t:${expiresAt}:R>` : t('stickymute.permanent');
      return ix.reply({
        embeds: [success(t('stickymute.applied_title'), t('stickymute.applied_desc', { user: user.id, duration, reason }))],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'remove') {
      const user   = ix.options.getUser('user', true);
      const record = getStickyMute(gid, user.id);
      if (!record) return ix.reply({ embeds: [error('Error', t('stickymute.no_mute', { user: user.id }))], flags: MessageFlags.Ephemeral });
      const member = ix.guild?.members.cache.get(user.id);
      if (member) {
        await member.timeout(null).catch(() => {});
        const muteRoleId = (db.prepare('SELECT mute_role FROM guilds WHERE id = ?').get(gid) as any)?.mute_role;
        if (muteRoleId) await member.roles.remove(muteRoleId).catch(() => {});
      }
      removeStickyMute(gid, user.id);
      return ix.reply({
        embeds: [success(t('stickymute.removed_title'), t('stickymute.removed_desc', { user: user.id }))],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'list') {
      const mutes = listStickyMutes(gid);
      if (!mutes.length) return ix.reply({
        embeds: [new EmbedBuilder().setColor('#5865f2').setTitle(t('stickymute.list_title')).setDescription(t('stickymute.list_none'))],
        flags: MessageFlags.Ephemeral,
      });
      const now = Math.floor(Date.now() / 1000);
      return ix.reply({
        embeds: [new EmbedBuilder().setColor('#fee75c')
          .setTitle(t('stickymute.list_active_title', { n: String(mutes.length) }))
          .setDescription(mutes.map(m => {
            const expired  = m.expires_at > 0 && m.expires_at <= now;
            const duration = m.expires_at === 0
              ? t('stickymute.permanent_short')
              : `${t('stickymute.expires')} <t:${m.expires_at}:R>`;
            const expTag   = expired ? ` ${t('stickymute.expired')}` : '';
            return `${expired ? '~~' : ''}<@${m.user_id}>${expired ? '~~' : ''}${expTag}\n└ ${duration} — ${m.reason ?? t('stickymute.no_reason')} — <@${m.muted_by}>`;
          }).join('\n\n'))],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
