/**
 * /config-audit — view the config change audit trail (see modules/audit/configAudit.ts).
 * Not exhaustive across every single settings write in the bot — scoped to
 * security-sensitive and structural changes: security/anti-nuke settings,
 * per-channel exceptions, command disable/enable, welcome toggles, and
 * reaction-role panel structure.
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, EmbedBuilder, MessageFlags } from 'discord.js';
import { requireAdmin } from '../../utils/guards';
import { getRecentConfigChanges } from '../../modules/audit/configAudit';
import { info } from '../../utils/embeds';
import { tGuild } from '../../i18n';

export default {
  data: new SlashCommandBuilder()
    .setName('config-audit')
    .setDescription('Show who changed which security/config setting, and when')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addIntegerOption(o => o.setName('limit').setDescription('How many entries to show (default 20, max 50)').setMinValue(1).setMaxValue(50)),

  async execute(ix: ChatInputCommandInteraction) {
    if (!await requireAdmin(ix)) return;
    const gid = ix.guildId!;
    const limit = ix.options.getInteger('limit') ?? 20;

    const rows = getRecentConfigChanges(gid, limit);
    if (rows.length === 0) {
      await ix.reply({ embeds: [info(tGuild(gid, 'configaudit.title'), tGuild(gid, 'configaudit.empty'))], flags: MessageFlags.Ephemeral });
      return;
    }

    const lines = rows.map(r => {
      const label = tGuild(gid, `configaudit.action.${r.action}`, { fallback: r.action });
      const detail = r.detail ? ` — ${r.detail}` : '';
      return `<t:${r.created_at}:R> **${label}**${detail} *(<@${r.user_id}>)*`;
    });

    const embed = new EmbedBuilder()
      .setTitle(tGuild(gid, 'configaudit.title'))
      .setColor('#5865f2')
      .setDescription(lines.join('\n').slice(0, 4000))
      .setFooter({ text: tGuild(gid, 'configaudit.footer') });

    await ix.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
