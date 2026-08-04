import {
  SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits,
  EmbedBuilder, MessageFlags,
} from 'discord.js';
import { requireAdmin } from '../../utils/guards';
import { error } from '../../utils/embeds';
import { getGuild, logModAction } from '../../database/db';
import { getLocalized, Language } from '../../utils/localization';

export default {
  data: new SlashCommandBuilder()
    .setName('massban')
    .setDescription('Ban multiple users at once (raid control)')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setDMPermission(false)
    .addSubcommand(s => s.setName('ids').setDescription('Ban comma-separated user IDs')
      .addStringOption(o => o.setName('ids').setDescription('Comma-separated user IDs').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Ban reason')))
    .addSubcommand(s => s.setName('recent').setDescription('Ban all users who joined in the last X minutes')
      .addIntegerOption(o => o.setName('minutes').setDescription('Time window in minutes (max 60)').setRequired(true).setMinValue(1).setMaxValue(60))
      .addStringOption(o => o.setName('reason').setDescription('Ban reason'))),

  async execute(ix: ChatInputCommandInteraction) {
    if (!await requireAdmin(ix)) return;
    await ix.deferReply({ flags: MessageFlags.Ephemeral });
    const sub   = ix.options.getSubcommand();
    const gid   = ix.guildId!;
    const guild = ix.guild!;
    const lang  = ((getGuild(gid) as any).language || 'en') as Language;
    const t     = (key: string, vars?: Record<string, string>) => getLocalized(key, lang, vars);
    const reason = ix.options.getString('reason') ?? 'Mass-ban';
    let targets: string[] = [];

    if (sub === 'ids') {
      targets = ix.options.getString('ids', true).split(',').map(s => s.trim()).filter(s => /^\d{17,20}$/.test(s));
      if (!targets.length)     return ix.editReply({ embeds: [error('Error', t('massban.no_valid_ids'))] });
      if (targets.length > 200) return ix.editReply({ embeds: [error('Error', t('massban.too_many'))] });
    }

    if (sub === 'recent') {
      const minutes = ix.options.getInteger('minutes', true);
      const cutoff  = Date.now() - minutes * 60_000;
      await guild.members.fetch().catch(() => {});
      targets = guild.members.cache.filter(m => !m.user.bot && m.joinedTimestamp !== null && m.joinedTimestamp >= cutoff).map(m => m.id);
      if (!targets.length)
        return ix.editReply({ embeds: [error('Error', t('massban.no_recent', { minutes: String(minutes) }))] });
    }

    const banned: string[] = [], failed: string[] = [];
    for (const id of targets) {
      try {
        await guild.members.ban(id, { reason, deleteMessageSeconds: 86400 });
        banned.push(id);
        // Each user in a mass-ban still gets its own searchable case — a
        // batch of 50 raid-bans showing up as zero /modcase entries would
        // defeat the point of having a case system at all.
        logModAction(gid, id, ix.user.id, 'ban', `[Mass-ban: ${sub}] ${reason}`);
      }
      catch { failed.push(id); }
      await new Promise(r => setTimeout(r, 300));
    }

    const embed = new EmbedBuilder()
      .setColor(banned.length > 0 ? '#ed4245' : '#fee75c')
      .setTitle(t('massban.done_title'))
      .addFields(
        { name: t('massban.field_banned'), value: `${banned.length} User`, inline: true },
        { name: t('massban.field_failed'), value: `${failed.length} User`, inline: true },
        { name: t('massban.field_reason'), value: reason },
      ).setTimestamp();

    if (banned.length > 0 && banned.length <= 20)
      embed.addFields({ name: t('massban.field_ids'), value: banned.join('\n') });

    return ix.editReply({ embeds: [embed] });
  },
};
