import { closePoll } from '../commands/utility/poll';
import { runInactivityKick } from '../merged/impl/inactivitykick';
import { BotClient } from '../utils/types';
import db, { getGuild } from '../database/db';
import { runAutoclose } from '../modules/tickets/service';
import * as Repo from '../modules/tickets/repository';
import { GiveawayRow } from '../utils/types';
import { EmbedBuilder, TextChannel } from 'discord.js';
import { getLocalized, Language } from '../utils/localization';
import { runStaffActivityTick } from '../modules/staffActivity/service';
import { runAutoBackupTick } from '../modules/backup/service';
import { pruneOldData, vacuumDatabase } from '../modules/maintenance/dbMaintenance';
import { logError } from '../modules/errorTracking/service';
import { runBirthdayTick } from '../modules/birthday/service';
import { runTempBanTick } from '../modules/moderation/tempBan';
import { runVoiceXpTick } from '../modules/voiceXp/service';
import { runActivityCalloutTick } from '../modules/activityCallout/service';
import { runChatRevivalTick } from '../modules/chatRevival/service';
import { runAutoServerBackupTick } from '../modules/serverBackup/structure';
import { pruneOldMessages } from '../modules/serverBackup/messages';
import { runPartnerTrackingTick } from '../modules/partnerTracking/service';

export function startGiveawayScheduler(client: BotClient) {
  setInterval(async () => {
    try {
    const now = Math.floor(Date.now() / 1000);
    const due = db.prepare('SELECT * FROM giveaways WHERE ended = 0 AND ends_at <= ?').all(now) as GiveawayRow[];

    for (const g of due) {
      db.prepare('UPDATE giveaways SET ended = 1 WHERE id = ?').run(g.id);
      const participants: string[] = JSON.parse(g.participants);

      try {
        const channel  = await client.channels.fetch(g.channel_id) as TextChannel;
        const msg      = g.message_id ? await channel.messages.fetch(g.message_id) : null;
        const guild    = getGuild(g.guild_id);
        const lang     = (guild.language || 'en') as Language;

        if (participants.length === 0) {
          const noWinners = new EmbedBuilder()
            .setTitle(getLocalized('giveaway.ended', lang))
            .setDescription(`**${g.prize}**\n\nNo valid participants.`)
            .setColor('#ed4245')
            .setTimestamp();
          if (msg) await msg.edit({ embeds: [noWinners], components: [] });
          continue;
        }

        const winners: string[] = [];
        const pool = [...participants];
        for (let i = 0; i < Math.min(g.winners, pool.length); i++) {
          const idx = Math.floor(Math.random() * pool.length);
          winners.push(pool.splice(idx, 1)[0]);
        }

        db.prepare('UPDATE giveaways SET winner_ids = ? WHERE id = ?').run(JSON.stringify(winners), g.id);

        const winEmbed = new EmbedBuilder()
          .setTitle(getLocalized('giveaway.ended', lang))
          .setDescription(`${getLocalized('giveaway.prize', lang)}: **${g.prize}**\n\n${getLocalized('giveaway.winners', lang)}: ${winners.map(w => `<@${w}>`).join(', ')}`)
          .setColor('#57f287')
          .setFooter({ text: `${participants.length} participants` })
          .setTimestamp();

        if (msg) await msg.edit({ embeds: [winEmbed], components: [] });
        await channel.send(`🎊 ${winners.map(w => `<@${w}>`).join(', ')} won **${g.prize}**!`);
      } catch {
        // channel or message was deleted, skip silently
      }
    }
    } catch (err) {
      console.error('[Giveaway] Scheduler tick failed:', err);
      logError('scheduler:giveaway', err);
    }
  }, 10000);
}

export function startReminderScheduler(client: BotClient) {
  setInterval(async () => {
    try {
    const now = Math.floor(Date.now() / 1000);
    const due = db.prepare('SELECT * FROM reminders WHERE done = 0 AND remind_at <= ?').all(now) as any[];

    for (const r of due) {
      try {
        const ch = await client.channels.fetch(r.channel_id) as TextChannel;
        await ch.send(`<@${r.user_id}> ⏰ Reminder: ${r.message}`);
      } catch {
        // channel may have been deleted
      }
      const repeatInterval = r.repeat_interval ?? 0;
      if (repeatInterval > 0) {
        const nextRemindAt = Math.floor(Date.now() / 1000) + repeatInterval;
        db.prepare('UPDATE reminders SET remind_at=? WHERE id=?').run(nextRemindAt, r.id);
      } else {
        db.prepare('UPDATE reminders SET done = 1 WHERE id = ?').run(r.id);
      }
    }
    } catch (err) {
      console.error('[Reminder] Scheduler tick failed:', err);
      logError('scheduler:reminder', err);
    }
  }, 15000);
}

// ── Autoclose Scheduler ───────────────────────────────────────────────────────
// Runs every 5 minutes. Closes all inactive tickets in guilds with autoclose on.

export function startAutocloseScheduler(client: BotClient) {
  setInterval(async () => {
    try {
    // Collect all guilds that have autoclose enabled
    const guildsWithAutoclose = (db.prepare(
      `SELECT guild_id, autoclose_hours FROM ticket_settings WHERE autoclose_enabled = 1`,
    ).all() as Array<{ guild_id: string; autoclose_hours: number }>);

    for (const { guild_id } of guildsWithAutoclose) {
      const guild = client.guilds.cache.get(guild_id);
      if (!guild) continue;
      try {
        const closed = await runAutoclose(guild);
        if (closed > 0) {
          console.log(`[Autoclose] Closed ${closed} inactive ticket(s) in ${guild.name}`);
        }
      } catch (err) {
        console.error(`[Autoclose] Error in guild ${guild_id}:`, err);
        logError('scheduler:autoclose', err, { guildId: guild_id });
      }
    }
    } catch (err) {
      console.error('[Autoclose] Scheduler tick failed:', err);
      logError('scheduler:autoclose', err);
    }
  }, 5 * 60 * 1000); // every 5 minutes
}

export function startLotteryScheduler(client: BotClient) {
  setInterval(async () => {
    try {
    const now = Math.floor(Date.now() / 1000);
    const dueLotteries = db.prepare('SELECT * FROM lottery WHERE drawn=0 AND draw_at<=?').all(now) as any[];
    for (const lottery of dueLotteries) {
      db.prepare('UPDATE lottery SET drawn=1 WHERE id=?').run(lottery.id);
      const tickets = db.prepare('SELECT * FROM lottery_tickets WHERE lottery_id=?').all(lottery.id) as any[];
      if (tickets.length === 0) continue;
      const winner = tickets[Math.floor(Math.random() * tickets.length)];
      db.prepare('UPDATE lottery SET winner_id=? WHERE id=?').run(winner.user_id, lottery.id);
      const { addPoints } = await import('../economy/db/EconomyDB');
      addPoints(winner.user_id, lottery.guild_id, lottery.pot);
      try {
        const guild = client.guilds.cache.get(lottery.guild_id);
        if (!guild) continue;
        const cfg = db.prepare('SELECT log_channel FROM inactivity_config WHERE guild_id=?').get(lottery.guild_id) as any;
        const channels = guild.channels.cache.filter(c => c.isTextBased());
        const ch = channels.first() as any;
        if (ch) await ch.send({ embeds: [{ title: '🎰 Lottery Draw!', color: 0x57f287, description: `<@${winner.user_id}> won the lottery and claimed **${lottery.pot.toLocaleString()} coins**! 🎉
${tickets.length} participants.` }] });
      } catch {}
    }
    } catch (err) {
      console.error('[Lottery] Scheduler tick failed:', err);
      logError('scheduler:lottery', err);
    }
  }, 60_000);
}

export function startPollScheduler(client: BotClient) {
  setInterval(async () => {
    try {
    const now = Math.floor(Date.now() / 1000);
    const duePolls = db.prepare('SELECT * FROM polls WHERE ended=0 AND ends_at IS NOT NULL AND ends_at<=?').all(now) as any[];
    for (const poll of duePolls) {
      await closePoll(client, poll.id);
    }
    } catch (err) {
      console.error('[Poll] Scheduler tick failed:', err);
      logError('scheduler:poll', err);
    }
  }, 30_000);
}

export function startInactivityScheduler(client: BotClient) {
  // Run once per day
  setInterval(async () => {
    try {
      await runInactivityKick(client);
    } catch (err) {
      console.error('[Inactivity] Scheduler tick failed:', err);
      logError('scheduler:inactivity', err);
    }
  }, 24 * 60 * 60 * 1000);
}

// ── Staff Activity Tracking Scheduler ────────────────────────────────────────
// Runs every 15 minutes. Handles: weekly quota DM reminders (fires once at the
// configured weekday+hour), the weekly counter reset (always, every Monday
// 00:00 UTC), and auto-posting the leaderboard on its configured interval.
// Every check is individually guarded (see modules/staffActivity/weekUtils.ts),
// so re-running this every 15 minutes is safe and never double-fires.

export function startStaffActivityScheduler(client: BotClient) {
  setInterval(async () => {
    try {
      await runStaffActivityTick(client.guilds.cache);
    } catch (err) {
      console.error('[StaffActivity] Scheduler tick failed:', err);
      logError('scheduler:staffActivity', err);
    }
  }, 15 * 60 * 1000); // every 15 minutes
}

// ── Auto-Backup Scheduler ────────────────────────────────────────────────────
// Runs every hour. Guarded by a stored day/week key per guild (see
// modules/backup/repository.ts), so it only actually creates + delivers a
// backup once per day (or once per week), no matter how often this fires.

export function startAutoBackupScheduler(client: BotClient) {
  setInterval(async () => {
    try {
      await runAutoBackupTick(client.guilds.cache);
    } catch (err) {
      console.error('[AutoBackup] Scheduler tick failed:', err);
      logError('scheduler:autoBackup', err);
    }
  }, 5 * 60 * 1000); // every 5 minutes — fine enough for a 15-min minimum configured interval
}

// ── DB Sync Scheduler ─────────────────────────────────────────────────────────
// ── DB Maintenance Scheduler ─────────────────────────────────────────────────
// Runs once a day. Prunes transient/log-style tables (see dbMaintenance.ts for
// exactly which ones and why) and then VACUUMs — this is what actually keeps
// bot.db small on disk (and therefore what gets pushed to GitHub). Runs once
// shortly after startup too, so a freshly-deployed instance doesn't wait a
// full day for its first cleanup.

export function startDbMaintenanceScheduler(client: BotClient) {
  const run = () => {
    try {
      const { totalDeleted } = pruneOldData();
      vacuumDatabase();
      if (totalDeleted > 0) {
        console.log(`[DbMaintenance] Pruned ${totalDeleted} old rows and vacuumed bot.db.`);
      }
    } catch (err) {
      console.error('[DbMaintenance] Run failed:', err);
      logError('scheduler:dbMaintenance', err);
    }
  };

  setTimeout(run, 5 * 60 * 1000);            // once, 5 minutes after boot
  setInterval(run, 24 * 60 * 60 * 1000);     // then once a day
}

// ── Birthday Scheduler ────────────────────────────────────────────────────────
// Runs every 20 minutes — plenty for hour-granularity greetings (birthday_ping_hour
// is a whole UTC hour, not a minute), and frequent enough that "just restarted"
// doesn't mean waiting a long time to catch up on a birthday. isGreetingDue() +
// last_greeted_key together guarantee this never double-greets even across
// multiple restarts on the same day (common on Render's free tier).

export function startBirthdayScheduler(client: BotClient) {
  setInterval(async () => {
    try {
      await runBirthdayTick(client.guilds.cache);
    } catch (err) {
      console.error('[Birthday] Scheduler tick failed:', err);
      logError('scheduler:birthday', err);
    }
  }, 20 * 60 * 1000); // every 20 minutes
}

// ── Temp-Ban Scheduler ────────────────────────────────────────────────────────
// Runs every minute — bans should lift close to on time, not hours late.
// The tick itself is cheap (one indexed SELECT, usually zero rows), so a
// tight interval doesn't cost anything on Render's free tier.

export function startTempBanScheduler(client: BotClient) {
  setInterval(async () => {
    try {
      await runTempBanTick(client);
    } catch (err) {
      console.error('[TempBan] Scheduler tick failed:', err);
      logError('scheduler:tempban', err);
    }
  }, 60 * 1000); // every 1 minute
}

// ── Voice-XP Scheduler ────────────────────────────────────────────────────────
// Runs every 5 minutes — grants XP/coins for the last 5 minutes of shared
// voice time to everyone currently tracked as connected (see
// modules/voiceXp/service.ts for why this can't just read discord.js's
// voice-state cache). 5 minutes keeps the per-tick reward small enough that
// a missed tick around a restart isn't noticeable, while still being
// frequent enough that voice time feels like it's actually accumulating.

export function startVoiceXpScheduler(client: BotClient) {
  setInterval(async () => {
    try {
      await runVoiceXpTick(client);
    } catch (err) {
      console.error('[VoiceXP] Scheduler tick failed:', err);
      logError('scheduler:voicexp', err);
    }
  }, 5 * 60 * 1000); // every 5 minutes
}

// ── Activity Callout Scheduler ────────────────────────────────────────────────
// Runs hourly — posts the top chatters for the hour just ended, then resets
// the in-memory counters. See modules/activityCallout/service.ts.

export function startActivityCalloutScheduler(client: BotClient) {
  setInterval(async () => {
    try {
      await runActivityCalloutTick(client);
    } catch (err) {
      console.error('[ActivityCallout] Scheduler tick failed:', err);
      logError('scheduler:activitycallout', err);
    }
  }, 60 * 60 * 1000); // every 60 minutes
}

// ── Chat Revival Scheduler ────────────────────────────────────────────────────
// Runs every 15 minutes — frequent enough that a channel crossing its
// silence threshold doesn't sit noticeably longer than configured, cheap
// enough (no API calls unless a channel actually needs a prompt — silence
// is computed for free from the snowflake in channel.lastMessageId) that
// running it often costs nothing on Render's free tier.

export function startChatRevivalScheduler(client: BotClient) {
  setInterval(async () => {
    try {
      await runChatRevivalTick(client);
    } catch (err) {
      console.error('[ChatRevival] Scheduler tick failed:', err);
      logError('scheduler:chatrevival', err);
    }
  }, 15 * 60 * 1000); // every 15 minutes
}

// ── Server-Backup Auto Scheduler ──────────────────────────────────────────────
// Mirrors startAutoBackupScheduler's pattern exactly, just against the
// separate server-structure snapshot system (modules/serverBackup/*).
// 5-minute tick is finer than any interval admins can actually configure
// (minimum 60 minutes here, vs 15 for /backup — structure snapshots hit
// the Discord API a lot more, one fetch per role/channel/ban, so a tighter
// minimum would risk rate limits on large servers for little benefit).

export function startServerBackupAutoScheduler(client: BotClient) {
  setInterval(async () => {
    try {
      await runAutoServerBackupTick(client.guilds.cache);
    } catch (err) {
      console.error('[ServerBackup] Auto-backup scheduler tick failed:', err);
      logError('scheduler:serverbackup', err);
    }
  }, 5 * 60 * 1000); // every 5 minutes
}

// ── Server-Backup Message Prune Scheduler ────────────────────────────────────
// Runs once a day — deletes logged chat messages past each guild's own
// retention window. See modules/serverBackup/messages.ts for why this
// matters more here than elsewhere (bot.db gets pushed to GitHub whole).

export function startServerBackupPruneScheduler(client: BotClient) {
  const run = () => {
    try {
      const r = pruneOldMessages();
      if (r.rowsDeleted > 0) {
        console.log(`[ServerBackup] Pruned ${r.rowsDeleted} old logged message(s) across ${r.guildsPruned} guild(s).`);
      }
    } catch (err) {
      console.error('[ServerBackup] Message prune failed:', err);
      logError('scheduler:serverbackup-prune', err);
    }
  };
  setTimeout(run, 10 * 60 * 1000);          // once, 10 minutes after boot
  setInterval(run, 24 * 60 * 60 * 1000);    // then once a day
}

// ── Seasonal-XP Auto-Reset Scheduler ─────────────────────────────────────────

export function startSeasonalResetScheduler(client: BotClient) {
  setInterval(() => {
    try {
      const now = Math.floor(Date.now() / 1000);
      const guilds = db.prepare(
        "SELECT id, seasonal_auto_reset_days, seasonal_last_reset_ts FROM guilds WHERE seasonal_enabled = 1 AND seasonal_auto_reset_days > 0"
      ).all() as { id: string; seasonal_auto_reset_days: number; seasonal_last_reset_ts: number | null }[];
      for (const g of guilds) {
        const lastReset   = g.seasonal_last_reset_ts ?? 0;
        const intervalSec = g.seasonal_auto_reset_days * 86400;
        if (now - lastReset >= intervalSec) {
          db.prepare('UPDATE users SET seasonal_xp = 0, seasonal_level = 0 WHERE guild_id = ?').run(g.id);
          db.prepare('UPDATE guilds SET seasonal_last_reset_ts = ? WHERE id = ?').run(now, g.id);
          console.log(`[SeasonalReset] Auto-reset seasonal XP for guild ${g.id}`);
        }
      }
    } catch (err) {
      console.error('[SeasonalReset] Auto-reset tick failed:', err);
      logError('scheduler:seasonalreset', err);
    }
  }, 60 * 60 * 1000); // check every hour
}

// ── Partner-Tracking Scheduler ────────────────────────────────────────────────
// Runs every hour — checks if a weekly report is due per guild config.
// The actual "is it time" logic lives in runPartnerTrackingTick().

export function startPartnerTrackingScheduler(client: BotClient) {
  const run = async () => {
    try {
      await runPartnerTrackingTick(client);
    } catch (err) {
      console.error('[PartnerTracking] Scheduler tick failed:', err);
      logError('scheduler:partnertracking', err);
    }
  };
  setTimeout(run, 5 * 60 * 1000); // first check 5 minutes after boot
  setInterval(run, 60 * 60 * 1000); // then every hour
}

// ── Level Leaderboard Auto-Post Scheduler ─────────────────────────────────────

export function startLevelLeaderboardScheduler(client: BotClient) {
  setInterval(async () => {
    try {
      const { runLbAutoPostTick } = await import('../modules/levelLeaderboard/service');
      await runLbAutoPostTick(client);
    } catch (err) {
      console.error('[LevelLB] Auto-post tick failed:', err);
      logError('scheduler:levellb', err);
    }
  }, 60 * 60 * 1000); // every hour
}

// ── Shop Temp-Role Expiry Scheduler ───────────────────────────────────────────

export function startShopTempRoleScheduler(client: BotClient) {
  setInterval(async () => {
    try {
      const { runShopTempRoleTick } = await import('../merged/impl/shop');
      await runShopTempRoleTick(client);
    } catch (err) {
      console.error('[Shop] Temp-role expiry tick failed:', err);
      logError('scheduler:shoptemprole', err);
    }
  }, 5 * 60 * 1000); // every 5 minutes
}
