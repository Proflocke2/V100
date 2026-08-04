/**
 * /ultra-mode — Instant full protection during an active attack.
 *
 * Enables:
 *   • Score-based fingerprinting on every new join
 *   • Instant ban for accounts with risk score >= threshold
 *   • Coordinated-spam detection (identical message from multiple users)
 *   • Automatic lockdown on raid detection
 *
 * Can be run by anyone with Manage Server permission.
 */

import {
  SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits,
  EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} from 'discord.js';
import { requireAdmin } from '../../utils/guards';
import { success, error, info } from '../../utils/embeds';
import { getGuild } from '../../database/db';
import { getLocalized, Language } from '../../utils/localization';
import {
  getSecurityConfig, updateSecurityConfig,
  activateUltraMode, deactivateUltraMode,
  isUltraModeActive, getUltraModeInfo,
  liftLockdown, isLockdownActive,
  resetJoinWindows, resetSpamWindows,
  getRecentIncidents,
} from '../../modules/security/securityEngine';

export default {
  data: new SlashCommandBuilder()
    .setName('ultra-mode')
    .setDescription('⚡ Instant full defense — stops all attack types immediately without waiting')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand(s => s
      .setName('on')
      .setDescription('⚡ Activate Ultra-Mode — score-based instant ban of all suspicious joiners')
      .addIntegerOption(o => o
        .setName('score_threshold')
        .setDescription('Risk score 0–100 to trigger instant ban (default: 60). Lower = stricter.')
        .setMinValue(20).setMaxValue(95))
      .addBooleanOption(o => o
        .setName('lockdown')
        .setDescription('Immediately lock all channels too? (default: no)')))
    .addSubcommand(s => s
      .setName('off')
      .setDescription('Deactivate Ultra-Mode and return to normal protection'))
    .addSubcommand(s => s
      .setName('status')
      .setDescription('Show Ultra-Mode status, recent threat score and incident overview')),

  async execute(ix: ChatInputCommandInteraction) {
    if (!await requireAdmin(ix)) return;
    await ix.deferReply({ flags: MessageFlags.Ephemeral });

    const sub   = ix.options.getSubcommand();
    const gid   = ix.guildId!;
    const guild = ix.guild!;
    const lang  = ((getGuild(gid) as any).language || 'en') as Language;
    const t     = (k: string, v?: Record<string, string>) => getLocalized(k, lang, v);

    // ── STATUS ──────────────────────────────────────────────────────────────
    if (sub === 'status') {
      const cfg       = getSecurityConfig(gid);
      const info      = getUltraModeInfo(gid);
      const incidents = getRecentIncidents(gid, 20);
      const ultraBans = incidents.filter(i => i.type === 'ultra_ban').length;
      const ultraFlags = incidents.filter(i => i.type === 'ultra_flag').length;
      const coordSpam = incidents.filter(i => i.type === 'coordinated_spam').length;

      const isOn = isUltraModeActive(gid) || cfg.ultra_mode === 1;

      await ix.editReply({
        embeds: [new EmbedBuilder()
          .setColor(isOn ? '#6600ff' : '#5865f2')
          .setTitle('⚡ Ultra-Mode Status')
          .setDescription(
            `**Ultra-Mode:** ${isOn ? '⚡ **ACTIVE**' : '⬜ Inactive'}\n` +
            `**Score-Threshold:** ${cfg.ultra_score_threshold ?? 60}/100\n` +
            `**Lockdown active:** ${isLockdownActive(gid) ? '🔴 Yes' : '🟢 No'}\n` +
            (info ? `**Activated by:** ${info.activatedBy} • <t:${Math.floor(info.activatedAt / 1000)}:R>\n` : '') +
            `\n**Last 20 Incidents:**\n` +
            `• Ultra-Bans: **${ultraBans}** instant bans\n` +
            `• Flagged: **${ultraFlags}** suspicious joins\n` +
            `• Coordinated Spam: **${coordSpam}** detections`,
          )
          .addFields({
            name: '⚡ Score Indicators (on every join)',
            value:
              '`+35` No profile picture (default avatar)\n' +
              '`+30` Account < 1 day old\n' +
              '`+25` Account < 7 days old\n' +
              '`+20` Bot-typical name pattern\n' +
              '`+15` Join during a join burst (< 5s)\n' +
              '`-20` Account > 1 year old\n' +
              `\n**Threshold:** ${cfg.ultra_score_threshold ?? 60}+ → **Instant ban**`,
          })
          .setTimestamp()],
      });
      return;
    }

    // ── ON ──────────────────────────────────────────────────────────────────
    if (sub === 'on') {
      const threshold = ix.options.getInteger('score_threshold') ?? 60;
      const doLockdown = ix.options.getBoolean('lockdown') ?? false;

      // Persist ultra_mode = 1 and threshold in DB
      updateSecurityConfig(gid, {
        ultra_mode:            1,
        ultra_score_threshold: threshold,
      });
      activateUltraMode(gid, ix.user.tag);

      const steps: string[] = [
        `⚡ **Ultra-Mode activated** (score threshold: ${threshold}/100)`,
        '🔍 **Score fingerprinting** active — every new join is scored immediately',
        '🚫 **Automatic ban** for accounts with score >= ' + threshold,
        '🎯 **Coordinated-spam detection** active — identical messages from multiple users',
      ];

      if (doLockdown && !isLockdownActive(gid)) {
        const cfg = getSecurityConfig(gid);
        await liftLockdown(guild); // clear any stale state first
        const { triggerLockdown } = await import('../../modules/security/securityEngine');
        await triggerLockdown(guild, cfg, `Ultra-Mode activated by ${ix.user.tag}`);
        steps.push(`🔒 **All channels locked** (auto-lift in 5 min.)`);
      }

      // Reset sliding windows so fresh start
      resetJoinWindows();
      resetSpamWindows();
      steps.push('🔄 **Tracking windows reset** — clean start');

      await ix.editReply({
        embeds: [new EmbedBuilder()
          .setColor('#6600ff')
          .setTitle('⚡ Ultra-Mode ACTIVE')
          .setDescription(steps.join('\n'))
          .addFields({
            name: 'What happens now',
            value:
              `Every new user who joins gets **scored immediately**.\n` +
              `Score >= ${threshold}: **Instant ban**, no waiting.\n` +
              `Score 40–${threshold - 1}: Logged, but no ban.\n\n` +
              `Disable with \`/ultra-mode off\`.`,
          })
          .setTimestamp()
          .setFooter({ text: `Activated by ${ix.user.tag}` })],
      });
      return;
    }

    // ── OFF ─────────────────────────────────────────────────────────────────
    if (sub === 'off') {
      const wasActive = isUltraModeActive(gid);
      deactivateUltraMode(gid);
      updateSecurityConfig(gid, { ultra_mode: 0 });

      if (!wasActive) {
        await ix.editReply({
          embeds: [info('Ultra-Mode', 'Ultra-Mode was not active.')],
        });
        return;
      }

      const incidents = getRecentIncidents(gid, 50);
      const ultraBans  = incidents.filter(i => i.type === 'ultra_ban').length;
      const ultraFlags = incidents.filter(i => i.type === 'ultra_flag').length;

      await ix.editReply({
        embeds: [new EmbedBuilder()
          .setColor('#57f287')
          .setTitle('✅ Ultra-Mode Deactivated')
          .setDescription(
            'Normal protection mode restored.\n\n' +
            '**Summary:**\n' +
            `• **${ultraBans}** instant bans via score system\n` +
            `• **${ultraFlags}** flagged accounts (score 40–threshold)\n\n` +
            `The normal security engine protection (Anti-Raid, Anti-Spam etc.) is still running.`,
          )
          .setTimestamp()
          .setFooter({ text: `Deactivated by ${ix.user.tag}` })],
      });
    }
  },
};
