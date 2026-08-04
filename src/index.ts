import 'dotenv/config';
import http from 'http';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { Client, GatewayIntentBits, Partials, Collection, Options } from 'discord.js';
import { BotClient } from './utils/types';
import { loadCommands } from './handlers/commandHandler';
import { loadEvents } from './handlers/eventHandler';
import { deployCommands } from './handlers/deploy';
import { buildCatalog } from './ui/catalog';
import { startGiveawayScheduler, startReminderScheduler, startAutocloseScheduler, startLotteryScheduler, startPollScheduler, startInactivityScheduler, startStaffActivityScheduler, startAutoBackupScheduler, startDbMaintenanceScheduler, startBirthdayScheduler, startTempBanScheduler, startVoiceXpScheduler, startActivityCalloutScheduler, startChatRevivalScheduler, startServerBackupAutoScheduler, startServerBackupPruneScheduler, startSeasonalResetScheduler, startPartnerTrackingScheduler, startLevelLeaderboardScheduler, startShopTempRoleScheduler } from './handlers/schedulers';
import { VerificationService } from './services/verificationService';
import { GameManager } from './services/gameManager';
import { initializeVerification } from './database/db';
import { initEconomyTables } from './economy/db/EconomyDB';
// Init new panel DB tables on import
import './services/panelDB';
import { GamblingCooldown } from './economy/cooldown/GamblingCooldown';
import { EconomyConfig } from './economy/config/EconomyConfig';
import { initStatsTables } from './stats/StatsDB';
import { logError, initErrorTracking } from './modules/errorTracking/service';

// ── New v2 modules — side-effect imports register tables ─────────────────────
import './modules/tickets/repository';
import './modules/welcome/repository';
import './modules/backup/repository';
import './modules/security/securityEngine'; // registers security_config table
import './modules/moderation/tempBan'; // registers temp_bans table
import './modules/serverBackup/repository'; // registers server_backup_snapshots table
import './modules/serverBackup/messages'; // registers server_backup_messages table
import './modules/applyPanel/service'; // registers apply_panels table
import './modules/levelLeaderboard/service'; // registers xp_weekly_snapshots table
import './modules/customCommands/service'; // registers custom_commands table
import './modules/afk/service'; // registers afk_status table
import { loadLocales } from './i18n';
import { runMigrations } from './modules/backup/migrations';
import { runDeployGuard } from './modules/backup/deployGuard';

import { applyDueRoles } from './modules/welcome/service';
import { registerAntiNuke } from './modules/moderation/antiNuke';
import { cleanExpiredMutes } from './modules/moderation/stickyMute';

// ── FIX: Global error handlers — prevent unhandled promise rejections from
//    crashing the process. Logs the error and keeps the bot alive.
//
// unhandledRejection vs uncaughtException are handled differently on purpose:
// an unhandled promise rejection almost always means ONE specific async
// operation failed somewhere (a fetch, a DB call, a Discord API request) —
// the rest of the process's state is still fine, so killing the whole bot
// over it would take down every other guild/command for no reason. A truly
// uncaught synchronous exception, on the other hand, means something escaped
// every try/catch in the call stack — at that point the process's internal
// state can no longer be trusted, so exiting cleanly and letting Render's
// auto-restart bring up a fresh process is safer than limping on.
process.on('unhandledRejection', (reason) => {
  console.error('[Process] Unhandled Rejection:', reason);
  logError('process:unhandledRejection', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception — exiting for clean restart:', err);
  logError('process:uncaughtException', err);
  process.exit(1);
});

// ── Graceful shutdown — push bot.db to GitHub one last time before exiting.
//    Render sends SIGTERM on redeploy/restart and follows up with SIGKILL
//    after ~10s if the process hasn't exited — so the push is raced against
//    an 8s timeout to guarantee we still call process.exit() in time, rather
//    than risking a hung HTTP request eating the whole grace period.
//    SIGINT is handled the same way for local testing (Ctrl+C).
process.on('SIGTERM', () => { console.log('[Shutdown] SIGTERM — exiting.'); process.exit(0); });
process.on('SIGINT',  () => { console.log('[Shutdown] SIGINT — exiting.');  process.exit(0); });

// ── HTTP server for Render web service ───────────────────────────────────────
// Serves the docs/ folder (privacy policy, DPA, command guide) at the root,
// so DOCS_URL can simply be set to this service's Render URL — no separate
// hosting provider needed.

const DOCS_DIR = path.join(process.cwd(), 'docs');
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.md':   'text/markdown',
  '.txt':  'text/plain',
  '.ico':  'image/x-icon',
};

const server = http.createServer((req, res) => {
  // Health-check endpoint — Render pings / to detect if the service is alive.
  const url = req.url ?? '/';
  const cleanUrl = url.split('?')[0].replace(/\.\./g, ''); // no path traversal

  // Map / → /index.html
  const file = cleanUrl === '/' ? '/index.html' : cleanUrl;
  const filePath = path.join(DOCS_DIR, file);

  // Only serve files that actually exist inside docs/
  if (existsSync(filePath) && filePath.startsWith(DOCS_DIR)) {
    const ext = path.extname(filePath);
    const mime = MIME[ext] ?? 'application/octet-stream';
    try {
      const content = readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': mime });
      res.end(content);
      return;
    } catch { /* fall through to 404 */ }
  }

  // Any unrecognised path → simple status response (for UptimeRobot etc.)
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('MultiBotV2 is running.');
});
server.listen(process.env.PORT || 3000, () => {
  console.log(`[HTTP] Listening on port ${process.env.PORT || 3000} — docs available at /`);
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildModeration,  // Required for guildAuditLogEntryCreate (Anti-Nuke)
    GatewayIntentBits.GuildPresences,   // Required for presence?.status in StatsService online-counter
    GatewayIntentBits.GuildVoiceStates, // Required for voiceStateUpdate (voice join/leave/move mod-log)
  ],
  // Partials.User is required so uncached reaction authors (messageReactionAdd/Remove
  // on old/unfetched messages) arrive as fetchable partials instead of being dropped —
  // see events/messageReactionAdd.ts and modules/moderation/modLog.ts.
  partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.User],

  // ── RAM efficiency ─────────────────────────────────────────────────────────
  // discord.js caches almost everything forever by default. On Render's free
  // tier (512MB) that adds up fast across many guilds/channels. We can afford
  // to cut these aggressively because:
  //  - Message deletes/edits are logged via modLog.ts, which already handles
  //    `.partial` (uncached) messages gracefully — see that file's header
  //    comment. So we don't need a big message cache just for logging.
  //  - Nothing in this codebase reads `message.reactions.cache`,
  //    `guild.bans.cache`, `guild.stickers.cache`, or voice states from
  //    cache (verified by grep) — reaction-roles use buttons, not native
  //    emoji reactions, and moderation commands fetch bans/etc on demand.
  //  - GuildMemberManager and PresenceManager are deliberately left at
  //    default (unlimited): /report-staff and /team-activity's quota
  //    reminder both read `role.members` from the member cache, and the
  //    `/stats` online-counter reads `member.presence` — capping either
  //    would silently break those features.
  makeCache: Options.cacheWithLimits({
    ...Options.DefaultMakeCacheSettings,
    MessageManager: 25,        // per-channel cache; default is 200 — we don't need history, just recent context
    ReactionManager: 0,        // not read from cache anywhere in this codebase
    GuildBanManager: 0,        // ban commands fetch on demand
    GuildStickerManager: 0,
    GuildScheduledEventManager: 0,
    VoiceStateManager: 0,      // voiceStateUpdate (mod-log) reads the event's own old/newState directly, never guild.voiceStates.cache — safe to keep at 0
    ThreadManager: 25,         // tickets/panels don't use threads; keep a small cap just in case
  }),
  sweepers: {
    ...Options.DefaultSweeperSettings, // keeps the built-in archived-thread sweep
    messages: {
      interval: 600,  // sweep every 10 minutes
      lifetime: 900,  // evict cached messages older than 15 minutes
    },
  },
}) as BotClient;

// Wire up the error tracker with the client so critical alerts can be
// posted — safe to call before login(), since it only stores the reference;
// nothing reads from it until an actual alert needs sending.
initErrorTracking(client);

client.commands = new Collection();

(async () => {
  initializeVerification();
  initEconomyTables();
  // Sync session limit from EconomyConfig
  GamblingCooldown.SESSION_LIMIT = EconomyConfig.SETTINGS.sessionLimit;
  initStatsTables();

  // Locales: load translation bundles from src/locales/
  loadLocales();

  // ── DEPLOY GUARD: always-on config protection ─────────────────────────────
  // Must run BEFORE runMigrations() so configs are snapshotted before any
  // schema change. Cannot be disabled. Detects version changes automatically.
  try {
    const guard = runDeployGuard();
    if (guard.versionChanged) {
      console.log(`[DeployGuard] Protected ${guard.snapshotsTaken} guild(s) before upgrade.`);
      if (guard.snapshotsFailed > 0) {
        console.warn(`[DeployGuard] ${guard.snapshotsFailed} snapshot(s) failed — check logs.`);
      }
    }
    if (guard.columnsAdded.length > 0) {
      console.log(`[DeployGuard] Schema updated: +${guard.columnsAdded.length} column(s).`);
    }
  } catch (err) {
    console.error('[DeployGuard] WARN: guard encountered an error (non-fatal):', err);
  }

  // Schema migrations: forward-only, idempotent
  try {
    const r = runMigrations();
    if (r.applied.length > 0) {
      console.log(`[Migrations] ${r.from} → ${r.to} (${r.applied.length} applied)`);
    } else {
      console.log(`[Migrations] up to date at ${r.to}`);
    }
  } catch (err) {
    console.error('[Migrations] FATAL:', err);
    process.exit(1);
  }

  VerificationService.initialize();
  GameManager.initialize();

  await loadCommands(client);

  // The wizard hubs are generated from the loaded command definitions, so the
  // catalog must be built after loadCommands() and before the first
  // interaction can arrive.
  buildCatalog(client);

  await loadEvents(client);

  if (process.env.BOT_TOKEN && process.env.CLIENT_ID) {
    // Emergency reset: set WIPE_COMMANDS=true in the environment to delete
    // every global + guild command before re-registering. Use this when
    // Discord is still showing stale commands from an older deploy that
    // the normal bulk-overwrite didn't replace. Remove the variable again
    // after one successful boot — otherwise every restart wipes first,
    // which briefly leaves the server with no commands at all.
    if (process.env.WIPE_COMMANDS === 'true') {
      try {
        const { wipeAllCommands } = await import('./handlers/deploy');
        await wipeAllCommands(process.env.BOT_TOKEN, process.env.CLIENT_ID);
      } catch (err) {
        console.error('[Deploy] Command wipe failed:', err instanceof Error ? err.message : err);
      }
    }

    try {
      const summary = await deployCommands(process.env.BOT_TOKEN, process.env.CLIENT_ID);
      if (summary.brokenFiles.length > 0 || summary.rejectedCommands.length > 0) {
        console.error(`[Deploy] Boot-time deploy finished WITH ISSUES — ${summary.brokenFiles.length} broken file(s), ${summary.rejectedCommands.length} rejected command(s). Run /deploy for a full report.`);
      }
    } catch (err) {
      console.error('[Deploy] Command deploy failed — bot continues anyway:', err instanceof Error ? err.message : err);
    }
  }

  startGiveawayScheduler(client);
  startReminderScheduler(client);
  startAutocloseScheduler(client);
  startLotteryScheduler(client);
  startPollScheduler(client);
  startInactivityScheduler(client);
  startStaffActivityScheduler(client);
  startAutoBackupScheduler(client);
  startDbMaintenanceScheduler(client);
  startBirthdayScheduler(client);
  startTempBanScheduler(client);
  startVoiceXpScheduler(client);
  startActivityCalloutScheduler(client);
  startChatRevivalScheduler(client);
  startServerBackupAutoScheduler(client);
  startServerBackupPruneScheduler(client);
  startSeasonalResetScheduler(client);
  startPartnerTrackingScheduler(client);
  startLevelLeaderboardScheduler(client);
  startShopTempRoleScheduler(client);

  // Welcome delayed-role scheduler (every minute)
  setInterval(() => {
    applyDueRoles(client).catch(err => console.error('[Welcome] applyDueRoles failed:', err));
  }, 60_000);

  // Anti-Nuke — register audit log listener after login
  client.once('clientReady', () => {
    registerAntiNuke(client);
  });

  // Sticky Mute — cleanup expired entries every 5 minutes
  setInterval(() => {
    try { cleanExpiredMutes(); } catch { /* ignore */ }
  }, 5 * 60_000);

  await client.login(process.env.BOT_TOKEN);
})();
