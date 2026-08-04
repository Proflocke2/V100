import {
  SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits,
  EmbedBuilder, MessageFlags, AuditLogEvent,
} from 'discord.js';
import { requirePermission } from '../../utils/guards';
import db, { getGuild } from '../../database/db';
import { getLocalized, Language } from '../../utils/localization';

export default {
  data: new SlashCommandBuilder()
    .setName('infractions')
    .setDescription('Show full infraction history of a member')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false)
    .addUserOption(o => o.setName('user').setDescription('Member').setRequired(true)),

  async execute(ix: ChatInputCommandInteraction) {
    if (!await requirePermission(ix, PermissionFlagsBits.ModerateMembers)) return;
    await ix.deferReply({ flags: MessageFlags.Ephemeral });

    const user  = ix.options.getUser('user', true);
    const gid   = ix.guildId!;
    const guild = ix.guild!;
    const lang  = ((getGuild(gid) as any).language || 'en') as Language;
    const t     = (key: string, vars?: Record<string, string>) => getLocalized(key, lang, vars);

    const warns = db.prepare('SELECT * FROM warnings WHERE guild_id = ? AND user_id = ? ORDER BY created_at DESC').all(gid, user.id) as { id: number; moderator_id: string; reason: string; created_at: number }[];
    const notes = db.prepare('SELECT COUNT(*) as cnt FROM mod_notes WHERE guild_id = ? AND user_id = ?').get(gid, user.id) as { cnt: number };

    let kicks = 0, bans = 0, timeouts = 0;
    try {
      const [kickLogs, banLogs, timeoutLogs] = await Promise.all([
        guild.fetchAuditLogs({ limit: 50, type: AuditLogEvent.MemberKick }),
        guild.fetchAuditLogs({ limit: 50, type: AuditLogEvent.MemberBanAdd }),
        guild.fetchAuditLogs({ limit: 50, type: AuditLogEvent.MemberUpdate }),
      ]);
      kicks    = kickLogs.entries.filter(e => e.target?.id === user.id).size;
      bans     = banLogs.entries.filter(e => e.target?.id === user.id).size;
      timeouts = timeoutLogs.entries.filter(e => e.target?.id === user.id && (e.changes as any[])?.some((c: any) => c.key === 'communication_disabled_until')).size;
    } catch { /* audit log unavailable */ }

    const member     = await guild.members.fetch(user.id).catch(() => null);
    const accountAge = Math.floor((Date.now() - user.createdTimestamp) / 86_400_000);

    const embed = new EmbedBuilder()
      .setColor(warns.length >= 3 ? '#ed4245' : warns.length >= 1 ? '#fee75c' : '#57f287')
      .setTitle(t('infractions.title', { user: user.username }))
      .setThumbnail(user.displayAvatarURL())
      .addFields(
        { name: t('infractions.field_account'),   value: `<@${user.id}>\n${t('infractions.created_ago', { days: String(accountAge) })}`, inline: true },
        { name: t('infractions.field_joined'),    value: member ? `<t:${Math.floor((member.joinedTimestamp ?? 0) / 1000)}:R>` : t('infractions.not_on_server'), inline: true },
        { name: '\u200B', value: '\u200B', inline: true },
        { name: t('infractions.field_warns'),     value: String(warns.length), inline: true },
        { name: t('infractions.field_timeouts'),  value: String(timeouts), inline: true },
        { name: t('infractions.field_kicks'),     value: String(kicks), inline: true },
        { name: t('infractions.field_bans'),      value: String(bans), inline: true },
        { name: t('infractions.field_notes'),     value: String(notes.cnt), inline: true },
      )
      .setFooter({ text: `ID: ${user.id}` })
      .setTimestamp();

    if (warns.length > 0) {
      embed.addFields({
        name:  t('infractions.field_recent_warns'),
        value: warns.slice(0, 5).map(w => `**#${w.id}** <t:${w.created_at}:R> — ${w.reason} *(by <@${w.moderator_id}>)*`).join('\n'),
      });
    }

    return ix.editReply({ embeds: [embed] });
  },
};
