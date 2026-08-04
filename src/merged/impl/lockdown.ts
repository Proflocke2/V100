import {
  SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits,
  TextChannel, ChannelType, EmbedBuilder, MessageFlags,
} from 'discord.js';
import { requireAdmin } from '../../utils/guards';
import { success, info } from '../../utils/embeds';
import db, { getGuild } from '../../database/db';
import { getLocalized, Language } from '../../utils/localization';

db.exec(`
  CREATE TABLE IF NOT EXISTS lockdown_channels (
    guild_id    TEXT NOT NULL,
    channel_id  TEXT NOT NULL,
    locked_at   INTEGER DEFAULT (unixepoch()),
    PRIMARY KEY (guild_id, channel_id)
  );
`);

function getLocked(gid: string): string[] {
  return (db.prepare('SELECT channel_id FROM lockdown_channels WHERE guild_id = ?').all(gid) as { channel_id: string }[]).map(r => r.channel_id);
}
function markLocked(gid: string, chId: string) { db.prepare('INSERT OR IGNORE INTO lockdown_channels (guild_id, channel_id) VALUES (?, ?)').run(gid, chId); }
function markUnlocked(gid: string, chId: string) { db.prepare('DELETE FROM lockdown_channels WHERE guild_id = ? AND channel_id = ?').run(gid, chId); }
function markAllUnlocked(gid: string) { db.prepare('DELETE FROM lockdown_channels WHERE guild_id = ?').run(gid); }

export default {
  data: new SlashCommandBuilder()
    .setName('lockdown')
    .setDescription('Manual server lockdown — restricts channels for regular users')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand(s => s.setName('start').setDescription('Start lockdown')
      .addChannelOption(o => o.setName('channel').setDescription('Channel to lock (leave empty = entire server)').addChannelTypes(ChannelType.GuildText))
      .addStringOption(o => o.setName('reason').setDescription('Reason for lockdown')))
    .addSubcommand(s => s.setName('end').setDescription('End lockdown')
      .addChannelOption(o => o.setName('channel').setDescription('Channel to unlock (leave empty = unlock all)').addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(s => s.setName('status').setDescription('Show currently locked channels')),

  async execute(ix: ChatInputCommandInteraction) {
    if (!await requireAdmin(ix)) return;
    const sub   = ix.options.getSubcommand();
    const gid   = ix.guildId!;
    const guild = ix.guild!;
    const lang  = ((getGuild(gid) as any).language || 'en') as Language;
    const t     = (key: string, vars?: Record<string, string>) => getLocalized(key, lang, vars);

    if (sub === 'start') {
      await ix.deferReply({ flags: MessageFlags.Ephemeral });
      const specificCh = ix.options.getChannel('channel') as TextChannel | null;
      const reason     = ix.options.getString('reason') ?? t('lockdown.default_reason');
      const locked: string[] = [], failed: string[] = [];

      const channels = specificCh
        ? [specificCh]
        : [...guild.channels.cache.filter(c => c.type === ChannelType.GuildText && c.permissionsFor(guild.roles.everyone)?.has(PermissionFlagsBits.SendMessages)).values()] as TextChannel[];

      for (const ch of channels) {
        try {
          await (ch as TextChannel).permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false }, { reason: `Lockdown: ${reason}` });
          markLocked(gid, ch.id);
          locked.push(ch.id);
          await (ch as TextChannel).send({ embeds: [new EmbedBuilder().setColor('#ed4245').setTitle(t('lockdown.channel_locked')).setDescription(t('lockdown.locked_desc', { reason })).setTimestamp()] }).catch(() => {});
        } catch { failed.push(ch.id); }
      }

      const lines = [
        t('lockdown.summary_locked', { n: String(locked.length) }),
        locked.map(id => `<#${id}>`).slice(0, 10).join(' '),
        failed.length > 0 ? t('lockdown.summary_failed', { n: String(failed.length) }) : '',
      ].filter(Boolean).join('\n');

      return ix.editReply({ embeds: [success(t('lockdown.started'), lines)] });
    }

    if (sub === 'end') {
      await ix.deferReply({ flags: MessageFlags.Ephemeral });
      const specificCh = ix.options.getChannel('channel') as TextChannel | null;
      const unlocked: string[] = [];

      for (const chId of specificCh ? [specificCh.id] : getLocked(gid)) {
        const ch = guild.channels.cache.get(chId) as TextChannel | undefined;
        if (!ch) { markUnlocked(gid, chId); continue; }
        try {
          await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null });
          markUnlocked(gid, chId);
          unlocked.push(chId);
          await ch.send({ embeds: [new EmbedBuilder().setColor('#57f287').setTitle(t('lockdown.channel_unlocked')).setDescription(t('lockdown.unlocked_desc')).setTimestamp()] }).catch(() => {});
        } catch { /* ignore */ }
      }
      if (!specificCh) markAllUnlocked(gid);
      return ix.editReply({ embeds: [success(t('lockdown.ended'), t('lockdown.summary_unlocked', { n: String(unlocked.length) }))] });
    }

    if (sub === 'status') {
      const locked = getLocked(gid);
      if (!locked.length)
        return ix.reply({ embeds: [info('Lockdown', t('lockdown.no_active'))], flags: MessageFlags.Ephemeral });
      return ix.reply({
        embeds: [new EmbedBuilder().setColor('#ed4245').setTitle(t('lockdown.status_title'))
          .setDescription(t('lockdown.status_desc', { n: String(locked.length) }) + '\n' + locked.map(id => `<#${id}>`).join('\n'))
          .setTimestamp()],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
