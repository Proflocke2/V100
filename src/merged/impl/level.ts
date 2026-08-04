/**
 * /level — Level system with canvas rank cards.
 *
 * rank              → Rank card as an image (avatar color as accent)
 * leaderboard       → All-time top-10 leaderboard
 * leaderboard-season→ Seasonal top-10 leaderboard (requires seasonal_enabled)
 * set               → Set a user's XP (admin)
 * reset             → Reset a user's XP (admin)
 * season-config     → Enable/disable/reset/auto-reset the seasonal leaderboard (admin)
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AttachmentBuilder,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js';
import db, { getUser, getGuild, setGuildValue } from '../../database/db';
import { error, success } from '../../utils/embeds';
import { xpForLevel, levelFromXp } from '../../utils/helpers';
import { UserRow } from '../../utils/types';
import { createRankCard } from '../../modules/canvas/rankCard';
import { createLeaderboardCard, LeaderboardEntry } from '../../modules/canvas/leaderboardCard';
import { grantXp } from '../../modules/leveling/service';
import { buildLbPayload, takeSnapshot, isoWeekKey } from '../../modules/levelLeaderboard/service';

export default {
  data: new SlashCommandBuilder()
    .setName('level')
    .setDescription('Level system')

    .addSubcommand(s =>
      s.setName('rank').setDescription('Show your rank card')
        .addUserOption(o => o.setName('user').setDescription('User (default: you)'))
        .addBooleanOption(o => o.setName('seasonal').setDescription('Show seasonal rank instead of all-time')),
    )

    .addSubcommand(s =>
      s.setName('leaderboard').setDescription('Show the all-time top-10 leaderboard'),
    )

    .addSubcommand(s =>
      s.setName('leaderboard-season').setDescription('Show the seasonal top-10 leaderboard'),
    )

    .addSubcommand(s =>
      s.setName('set').setDescription('[Admin] Set a user\'s all-time XP')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(true))
        .addIntegerOption(o => o.setName('xp').setDescription('XP amount').setRequired(true).setMinValue(0)),
    )

    .addSubcommand(s =>
      s.setName('reset').setDescription('[Admin] Reset a user\'s all-time XP')
        .addUserOption(o => o.setName('user').setDescription('User').setRequired(true)),
    )

    .addSubcommand(s =>
      s.setName('leaderboard-post').setDescription('[Admin] Post all leaderboard types now')
        .addChannelOption(o => o.setName('channel').setDescription('Channel to post in (default: configured auto-post channel)').addChannelTypes(0)),
    )

    .addSubcommand(s =>
      s.setName('leaderboard-config').setDescription('[Admin] Configure scheduled leaderboard posting')
        .addStringOption(o => o.setName('interval').setDescription('How often to auto-post').setRequired(true)
          .addChoices(
            { name: 'Manual only (no auto-post)', value: 'manual' },
            { name: 'Daily',   value: 'daily' },
            { name: 'Weekly',  value: 'weekly' },
            { name: 'Monthly (1st of the month)', value: 'monthly' },
          ))
        .addChannelOption(o => o.setName('channel').setDescription('Channel for scheduled leaderboards').addChannelTypes(0))
        .addStringOption(o => o.setName('post_day').setDescription('Day of week (for weekly posting, UTC)')
          .addChoices(
            {name:'Monday',value:'0'},{name:'Tuesday',value:'1'},{name:'Wednesday',value:'2'},{name:'Thursday',value:'3'},
            {name:'Friday',value:'4'},{name:'Saturday',value:'5'},{name:'Sunday',value:'6'},
          ))
        .addIntegerOption(o => o.setName('post_hour').setDescription('UTC hour to post (0–23)').setMinValue(0).setMaxValue(23)),
    )

    .addSubcommand(s =>
      s.setName('season-config').setDescription('[Admin] Configure the seasonal leaderboard')
        .addStringOption(o => o.setName('action').setDescription('What to do').setRequired(true)
          .addChoices(
            { name: 'Enable seasonal leaderboard', value: 'enable' },
            { name: 'Disable seasonal leaderboard', value: 'disable' },
            { name: 'Reset seasonal XP for everyone now', value: 'reset' },
            { name: 'Set auto-reset interval (days)', value: 'auto-reset' },
          ))
        .addIntegerOption(o => o.setName('days').setDescription('Auto-reset interval in days (0 = manual only, used with auto-reset action)').setMinValue(0).setMaxValue(365))
        .addStringOption(o => o.setName('label').setDescription('Season label shown in the leaderboard header (e.g. "Summer 2026")')),
    ),

  async execute(ix: ChatInputCommandInteraction) {
    const sub = ix.options.getSubcommand();
    const gid = ix.guildId!;

    const isAdmin = () => ix.memberPermissions?.has('ManageGuild');

    // ── RANK CARD ────────────────────────────────────────────────────────────
    if (sub === 'rank') {
      await ix.deferReply();

      const target   = ix.options.getUser('user') ?? ix.user;
      const seasonal = ix.options.getBoolean('seasonal') ?? false;
      const u        = getUser(target.id, gid);

      const xp    = seasonal ? (u.seasonal_xp ?? 0) : u.xp;
      const level = seasonal ? (u.seasonal_level ?? 0) : u.level;

      // Sync level from XP (all-time only)
      if (!seasonal) {
        const correctLevel = levelFromXp(u.xp);
        if (correctLevel !== u.level) {
          db.prepare('UPDATE users SET level = ? WHERE id = ? AND guild_id = ?').run(correctLevel, u.id, u.guild_id);
          u.level = correctLevel;
        }
      }

      let spent = 0;
      for (let i = 1; i <= level; i++) spent += xpForLevel(i);
      const currentXp = xp - spent;
      const neededXp  = xpForLevel(level + 1);

      const rankCol   = seasonal ? 'seasonal_xp' : 'xp';
      const rankRow   = db.prepare(`SELECT COUNT(*) + 1 as rank FROM users WHERE guild_id = ? AND ${rankCol} > ?`).get(gid, xp) as { rank: number };

      const guild = getGuild(gid) as any;
      const label = seasonal ? (guild.seasonal_label || 'Season') : 'All Time';

      try {
        const buf = await createRankCard({
          avatarUrl: target.displayAvatarURL({ extension: 'png', size: 256 }),
          username:  `${target.username} [${label}]`,
          level,
          rank:      rankRow.rank,
          currentXp,
          neededXp,
          totalXp:   xp,
          messages:  u.messages,
        });
        await ix.editReply({ files: [new AttachmentBuilder(buf, { name: 'rank.png' })] });
      } catch {
        await ix.editReply({
          embeds: [new EmbedBuilder().setTitle(`⭐ ${target.username} [${label}]`).setColor('#5865f2')
            .addFields(
              { name: 'Level',    value: `**${level}**`,       inline: true },
              { name: 'Rank',     value: `**#${rankRow.rank}**`, inline: true },
              { name: 'Total XP', value: `${xp}`,              inline: true },
              { name: 'Progress', value: `${currentXp} / ${neededXp} XP` },
            )],
        });
      }
    }

    // ── ALL-TIME LEADERBOARD ─────────────────────────────────────────────────
    if (sub === 'leaderboard') {
      await ix.deferReply();
      const top = db.prepare('SELECT * FROM users WHERE guild_id = ? ORDER BY xp DESC LIMIT 10').all(gid) as UserRow[];
      if (!top.length) return ix.editReply({ embeds: [new EmbedBuilder().setDescription('No data yet.')] });

      const entries: LeaderboardEntry[] = top.map((u, i) => {
        const m = ix.guild?.members.cache.get(u.id);
        return { rank: i + 1, userId: u.id, username: m?.user.username ?? `User ${u.id.slice(-4)}`, avatarUrl: m?.user.displayAvatarURL({ extension: 'png', size: 64 }) ?? '', level: u.level, totalXp: u.xp, messages: u.messages };
      });
      try {
        const buf = await createLeaderboardCard(entries, `${ix.guild?.name ?? 'Server'} — All Time`);
        await ix.editReply({ files: [new AttachmentBuilder(buf, { name: 'leaderboard.png' })] });
      } catch {
        await ix.editReply({ embeds: [new EmbedBuilder().setTitle('🏆 Leaderboard (All Time)').setColor('#5865f2').setDescription(top.map((u, i) => `**${i+1}.** <@${u.id}> — Level ${u.level} (${u.xp} XP)`).join('\n'))] });
      }
    }

    // ── SEASONAL LEADERBOARD ─────────────────────────────────────────────────
    if (sub === 'leaderboard-season') {
      await ix.deferReply();
      const guild = getGuild(gid) as any;
      if (!guild.seasonal_enabled) {
        return ix.editReply({ embeds: [new EmbedBuilder().setColor('#95a5a6').setDescription('Seasonal leaderboard is not enabled. An admin can enable it with `/level season-config action:Enable`.')]});
      }

      const label = guild.seasonal_label || 'Season';
      const top = db.prepare('SELECT * FROM users WHERE guild_id = ? ORDER BY seasonal_xp DESC LIMIT 10').all(gid) as any[];
      if (!top.length) return ix.editReply({ embeds: [new EmbedBuilder().setDescription(`No ${label} data yet.`)] });

      const entries: LeaderboardEntry[] = top.map((u, i) => {
        const m = ix.guild?.members.cache.get(u.id);
        return { rank: i + 1, userId: u.id, username: m?.user.username ?? `User ${u.id.slice(-4)}`, avatarUrl: m?.user.displayAvatarURL({ extension: 'png', size: 64 }) ?? '', level: u.seasonal_level ?? 0, totalXp: u.seasonal_xp ?? 0, messages: u.messages };
      });
      try {
        const buf = await createLeaderboardCard(entries, `${ix.guild?.name ?? 'Server'} — ${label}`);
        await ix.editReply({ files: [new AttachmentBuilder(buf, { name: 'leaderboard-season.png' })] });
      } catch {
        await ix.editReply({ embeds: [new EmbedBuilder().setTitle(`🏆 ${label} Leaderboard`).setColor('#f1c40f').setDescription(top.map((u, i) => `**${i+1}.** <@${u.id}> — Level ${u.seasonal_level ?? 0} (${u.seasonal_xp ?? 0} XP)`).join('\n'))] });
      }
    }

    // ── SET XP ───────────────────────────────────────────────────────────────
    if (sub === 'set') {
      if (!isAdmin()) return ix.reply({ embeds: [error('No permission.')], flags: MessageFlags.Ephemeral });
      const target = ix.options.getUser('user', true);
      const xp     = ix.options.getInteger('xp', true);
      const lvl    = levelFromXp(xp);
      db.prepare('UPDATE users SET xp = ?, level = ? WHERE id = ? AND guild_id = ?').run(xp, lvl, target.id, gid);
      return ix.reply({ embeds: [success('XP Set', `${target} → **${xp.toLocaleString()} XP** (Level **${lvl}**)`)], flags: MessageFlags.Ephemeral });
    }

    // ── RESET XP ─────────────────────────────────────────────────────────────
    if (sub === 'reset') {
      if (!isAdmin()) return ix.reply({ embeds: [error('No permission.')], flags: MessageFlags.Ephemeral });
      const target = ix.options.getUser('user', true);
      db.prepare('UPDATE users SET xp = 0, level = 0, messages = 0 WHERE id = ? AND guild_id = ?').run(target.id, gid);
      return ix.reply({ embeds: [new EmbedBuilder().setColor('#ed4245').setTitle('🗑️ XP Reset').setDescription(`${target}'s XP has been reset to 0.`)], flags: MessageFlags.Ephemeral });
    }

    // ── LEADERBOARD CONFIG ───────────────────────────────────────────────────────
    if (sub === 'leaderboard-config') {
      if (!isAdmin()) return ix.reply({ embeds: [error('No permission.')], flags: MessageFlags.Ephemeral });
      const interval = ix.options.getString('interval', true);
      const channel  = ix.options.getChannel('channel');
      const postDay  = ix.options.getString('post_day');
      const postHour = ix.options.getInteger('post_hour');

      setGuildValue(gid, 'level_lb_interval', interval);
      if (channel)  setGuildValue(gid, 'level_lb_channel', channel.id);
      if (postDay !== null) setGuildValue(gid, 'level_lb_post_day', parseInt(postDay, 10));
      if (postHour !== null) setGuildValue(gid, 'level_lb_post_hour', postHour);

      const g = getGuild(gid) as any;
      const ch = g.level_lb_channel ? `<#${g.level_lb_channel}>` : '*(none set)*';
      const dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
      const schedNote = interval === 'manual' ? 'No auto-posting.' :
        interval === 'daily'   ? `Posts daily at **${g.level_lb_post_hour ?? postHour ?? 9}:00 UTC** → ${ch}` :
        interval === 'weekly'  ? `Posts every **${dayNames[g.level_lb_post_day ?? 1]}** at **${g.level_lb_post_hour ?? 9}:00 UTC** → ${ch}` :
        `Posts on the **1st of each month** at **${g.level_lb_post_hour ?? 9}:00 UTC** → ${ch}`;
      return ix.reply({ embeds: [success('Leaderboard schedule updated', schedNote)], flags: MessageFlags.Ephemeral });
    }

    // ── LEADERBOARD POST (manual) ─────────────────────────────────────────────
    if (sub === 'leaderboard-post') {
      if (!isAdmin()) return ix.reply({ embeds: [error('No permission.')], flags: MessageFlags.Ephemeral });
      await ix.deferReply({ flags: MessageFlags.Ephemeral });

      const channelOpt = ix.options.getChannel('channel');
      const g = getGuild(gid) as any;
      const channelId = channelOpt?.id ?? g.level_lb_channel;
      if (!channelId) {
        return ix.editReply({ embeds: [error('No channel', 'Provide a channel or set one with `/level leaderboard-config`.')] });
      }
      const ch = ix.guild?.channels.cache.get(channelId) as import('discord.js').TextChannel | undefined;
      if (!ch) return ix.editReply({ embeds: [error('Channel not found')] });

      takeSnapshot(gid);
      const { buildLbPayload: buildPayload } = await import('../../modules/levelLeaderboard/service');
      const types = ['alltime', 'season', 'gain', 'messages'] as const;
      for (const t of types) {
        const payload = buildPayload(ix.guild!, t);
        if (t !== 'messages') payload.components = [];
        await ch.send(payload).catch(() => {});
      }
      return ix.editReply({ embeds: [success('Leaderboards posted', `All 4 types posted to <#${channelId}>.`)] });
    }

    // ── SEASON CONFIG ─────────────────────────────────────────────────────────
    if (sub === 'season-config') {
      if (!isAdmin()) return ix.reply({ embeds: [error('No permission.')], flags: MessageFlags.Ephemeral });

      const action = ix.options.getString('action', true);
      const days   = ix.options.getInteger('days');
      const label  = ix.options.getString('label');

      if (action === 'enable') {
        setGuildValue(gid, 'seasonal_enabled', 1);
        if (label) setGuildValue(gid, 'seasonal_label', label);
        return ix.reply({ embeds: [success('Seasonal leaderboard enabled', label ? `Label: **${label}**` : 'Use `/level leaderboard-season` to view it.')], flags: MessageFlags.Ephemeral });
      }

      if (action === 'disable') {
        setGuildValue(gid, 'seasonal_enabled', 0);
        return ix.reply({ embeds: [success('Seasonal leaderboard disabled', 'Seasonal XP is preserved — re-enable to continue where you left off.')], flags: MessageFlags.Ephemeral });
      }

      if (action === 'reset') {
        db.prepare('UPDATE users SET seasonal_xp = 0, seasonal_level = 0 WHERE guild_id = ?').run(gid);
        setGuildValue(gid, 'seasonal_last_reset_ts', Math.floor(Date.now() / 1000));
        if (label) setGuildValue(gid, 'seasonal_label', label);
        return ix.reply({ embeds: [success('Season reset', `All seasonal XP cleared.${label ? ` New label: **${label}**` : ''}`)], flags: MessageFlags.Ephemeral });
      }

      if (action === 'auto-reset') {
        const d = days ?? 0;
        setGuildValue(gid, 'seasonal_auto_reset_days', d);
        if (label) setGuildValue(gid, 'seasonal_label', label);
        return ix.reply({ embeds: [success('Auto-reset configured', d === 0 ? 'Auto-reset disabled — resets are now manual only.' : `Season will auto-reset every **${d} day(s)**.`)], flags: MessageFlags.Ephemeral });
      }
    }
  },
};
