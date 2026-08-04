import {
  SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
  TextChannel, Guild,
} from 'discord.js';
import { info } from '../../utils/embeds';
import db, { getGuild } from '../../database/db';
import { getLocalized, Language } from '../../utils/localization';
import {
  liftLockdown, isLockdownActive, getSecurityConfig,
  getRecentIncidents, resetJoinWindows, resetSpamWindows,
} from '../../modules/security/securityEngine';

async function unlockAll(guild: Guild): Promise<{ channels: number; sources: string[] }> {
  const sources: string[] = [];
  let channels = 0;

  if (isLockdownActive(guild.id)) {
    const n = await liftLockdown(guild);
    channels += n;
    sources.push(`Security-Engine (${n})`);
  }

  const legacy = (db.prepare('SELECT channel_id FROM lockdown_channels WHERE guild_id = ?').all(guild.id) as { channel_id: string }[]).map(r => r.channel_id);
  if (legacy.length > 0) {
    await Promise.allSettled(legacy.map(async chId => {
      const ch = guild.channels.cache.get(chId) as TextChannel | undefined;
      if (ch) await ch.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null }, { reason: '[raid-end] lifting lockdown' }).then(() => channels++).catch(() => {});
    }));
    db.prepare('DELETE FROM lockdown_channels WHERE guild_id = ?').run(guild.id);
    sources.push(`Manual (${legacy.length})`);
  }

  db.prepare('DELETE FROM security_lockdown_state WHERE guild_id = ?').run(guild.id);
  return { channels, sources };
}

function getAttackerSummary(guildId: string) {
  const cutoff    = Math.floor(Date.now() / 1000) - 30 * 60;
  const incidents = (db.prepare('SELECT type, target_id, action, detail, ts FROM security_incidents WHERE guild_id = ? AND ts > ? ORDER BY ts DESC').all(guildId, cutoff) as { type: string; target_id: string | null; action: string; detail: string | null; ts: number }[]);
  const byType: Record<string, number> = {};
  const seenUsers = new Set<string>();
  for (const i of incidents) { byType[i.type] = (byType[i.type] ?? 0) + 1; if (i.target_id) seenUsers.add(i.target_id); }
  const lines = incidents.slice(0, 10).map(i => {
    const time = new Date(i.ts * 1000).toLocaleTimeString();
    const user = i.target_id ? `<@${i.target_id}>` : '—';
    return `\`${time}\` **${i.type}** ${user} → \`${i.action}\`${i.detail ? ` *(${i.detail})*` : ''}`;
  });
  return { total: incidents.length, byType, uniqueUsers: [...seenUsers], lines };
}

export default {
  data: new SlashCommandBuilder()
    .setName('raid-end')
    .setDescription('🛡️ Raid ended — unlock server, reset tracking & attacker overview')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addBooleanOption(o => o.setName('reset_tracking').setDescription('Reset join & spam tracking? (prevents false positives) — default: yes'))
    .addStringOption(o => o.setName('grund').setDescription('Optional reason / note for the mod log')),

  async execute(ix: ChatInputCommandInteraction) {
    await ix.deferReply({ flags: MessageFlags.Ephemeral });
    const gid      = ix.guildId!;
    const guild    = ix.guild!;
    const lang     = ((getGuild(gid) as any).language || 'en') as Language;
    const t        = (k: string, v?: Record<string, string>) => getLocalized(k, lang, v);
    const doReset  = ix.options.getBoolean('reset_tracking') ?? true;
    const grund    = ix.options.getString('grund') ?? null;
    const steps: string[] = [];
    let hadAnything = false;

    // Phase 1: unlock
    const { channels, sources } = await unlockAll(guild);
    if (channels > 0) {
      hadAnything = true;
      steps.push(t('raidend.unlocked', { n: String(channels) }) + '\n' + sources.map(s => `  └ ${s}`).join('\n'));
    } else {
      steps.push(t('raidend.no_lockdown'));
    }

    // Phase 2: reset tracking
    if (doReset) { resetJoinWindows(); resetSpamWindows(); steps.push(t('raidend.tracking_reset')); hadAnything = true; }

    // Phase 3: incident summary
    const atk = getAttackerSummary(gid);
    const typeList = Object.entries(atk.byType).map(([tp, n]) => `  └ \`${tp}\`: ${n}×`).join('\n') || `  └ ${t('raidend.incidents_none')}`;
    const incidentBlock = atk.lines.length > 0 ? atk.lines.join('\n') : '_—_';

    const cfg       = getSecurityConfig(gid);
    const footerParts = [t('raidend.footer', { sev: cfg.severity, user: ix.user.tag })];
    if (grund) footerParts.push(t('raidend.footer_note', { note: grund }));

    const embed = new EmbedBuilder()
      .setColor(hadAnything ? '#57f287' : '#5865f2')
      .setTitle(t('raidend.done_title'))
      .setDescription(steps.join('\n\n'))
      .addFields(
        { name: t('raidend.incidents_title'), value: `${atk.total} total, ${atk.uniqueUsers.length} unique\n${typeList}`, inline: false },
        { name: t('raidend.recent_events'),   value: incidentBlock.slice(0, 1024), inline: false },
      )
      .setFooter({ text: footerParts.join(' • ') })
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('raidend:view_bans').setLabel(t('raidend.view_bans')).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('raidend:done').setLabel(t('raidend.all_done')).setStyle(ButtonStyle.Success),
    );

    const response = await ix.editReply({ embeds: [embed], components: [row] });

    const collector = response.createMessageComponentCollector({ filter: (i) => i.user.id === ix.user.id, time: 5 * 60 * 1000 });

    collector.on('collect', async (btn) => {
      const bl = ((getGuild(gid) as any).language || 'en') as Language;
      const bt = (k: string, v?: Record<string, string>) => getLocalized(k, bl, v);

      if (btn.customId === 'raidend:done') { await btn.update({ components: [] }); collector.stop(); return; }

      if (btn.customId === 'raidend:view_bans') {
        const bannedAttackers = atk.uniqueUsers.filter(uid =>
          db.prepare("SELECT 1 FROM security_incidents WHERE guild_id = ? AND target_id = ? AND action = 'banned' AND ts > ?")
            .get(gid, uid, Math.floor(Date.now() / 1000) - 30 * 60)
        );

        if (!bannedAttackers.length) {
          await btn.reply({ embeds: [info('', bt('raidend.no_bans'))], flags: MessageFlags.Ephemeral });
          return;
        }

        const banLines = bannedAttackers.map(uid => `• <@${uid}> (\`${uid}\`)`).join('\n');
        const unbanRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId('raidend:confirm_unban').setLabel(bt('raidend.unban_all', { n: String(bannedAttackers.length) })).setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('raidend:cancel_unban').setLabel(bt('sec.btn_cancel')).setStyle(ButtonStyle.Secondary),
        );

        await btn.reply({
          embeds: [new EmbedBuilder().setColor('#fee75c').setTitle(bt('raidend.bans_title', { n: String(bannedAttackers.length) })).setDescription(`${banLines}\n\n${bt('raidend.bans_warning')}`)],
          components: [unbanRow],
          flags: MessageFlags.Ephemeral,
        });

        const unbanMsg = await btn.fetchReply();
        const uc = unbanMsg.createMessageComponentCollector({ filter: (i) => i.user.id === ix.user.id, time: 60_000, max: 1 });
        uc.on('collect', async (ubtn) => {
          if (ubtn.customId === 'raidend:confirm_unban') {
            await ubtn.deferUpdate();
            let unbanned = 0; const failed: string[] = [];
            await Promise.allSettled(bannedAttackers.map(uid =>
              guild.members.unban(uid, `[raid-end] by ${ix.user.tag}`).then(() => unbanned++).catch(() => failed.push(uid))
            ));
            await ubtn.editReply({
              embeds: [new EmbedBuilder().setColor('#57f287').setTitle('✅').setDescription(
                failed.length ? bt('raidend.unban_partial', { ok: String(unbanned), fail: String(failed.length) }) : bt('raidend.unban_done', { n: String(unbanned) })
              )],
              components: [],
            });
          } else { await ubtn.update({ components: [] }); }
        });
      }
    });

    collector.on('end', async () => { await ix.editReply({ components: [] }).catch(() => {}); });
  },
};
