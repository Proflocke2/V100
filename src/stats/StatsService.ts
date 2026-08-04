/**
 * STATS SERVICE
 * ──────────────────────────────────────────────────────────────────────────
 * Core logic for real-time server statistics.
 *
 * RATE-LIMIT STRATEGY:
 *   Discord allows max ~2 channel renames per channel per 10 minutes.
 *   Implementation: one debounce timer per guild (UPDATE_INTERVAL = 10 min).
 *   If an event arrives within the interval, it gets "queued up" and
 *   processed only at the end of the interval (batch update).
 *
 * IMPORTANT: GatewayIntentBits.GuildPresences is required for the online count
 *          (must be enabled in the Discord Developer Portal).
 * ──────────────────────────────────────────────────────────────────────────
 */

import { Guild, VoiceChannel, ChannelType } from 'discord.js';
import { getStatsConfig, getAllStatsGuildIds } from './StatsDB';
import { GuildStats, StatChannel, StatChannelType, DEFAULT_TEMPLATE_SENTINEL, LEGACY_DEFAULT_TEMPLATES } from './StatsTypes';
import { getGuild } from '../database/db';
import { getLocalized, Language } from '../utils/localization';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Minimum wait time between two updates of ONE channel (ms). Discord limit: 2/10 min. */
const UPDATE_INTERVAL_MS = 10 * 60 * 1_000;   // 10 minutes

/** Initial delay after bot start, so the cache gets populated */
const STARTUP_DELAY_MS = 15_000;

// ============================================================================
// STATS SERVICE
// ============================================================================

export class StatsService {

  /**
   * Map<guildId, { timer: NodeJS.Timeout | null, pending: boolean }>
   * Speichert den Debounce-State pro Guild.
   */
  private static debounce = new Map<string, {
    timer: ReturnType<typeof setTimeout> | null;
    pending: boolean;
    lastUpdate: number;
  }>();

  // ── Initialisierung ──────────────────────────────────────────────────────

  /**
   * Beim Bot-Start: Alle konfigurierten Guilds sofort aktualisieren.
   * @param getGuild Callback um eine Guild-Instanz zu erhalten
   */
  static async initializeAll(
    getGuild: (id: string) => Guild | undefined
  ): Promise<void> {
    // Delay so discord.js cache is fully populated
    await new Promise(r => setTimeout(r, STARTUP_DELAY_MS));

    const guildIds = getAllStatsGuildIds();
    console.log(`[Stats] Initializing ${guildIds.length} guild(s)...`);

    for (const guildId of guildIds) {
      const guild = getGuild(guildId);
      if (!guild) continue;
      await this.updateAll(guild);
      // Kleines Delay um Rate-Limits zu vermeiden
      await new Promise(r => setTimeout(r, 2_000));
    }

    console.log('[Stats] Initialization complete');
  }

  // ── Public trigger method ───────────────────────────────────────────

  /**
   * Called from events (guildMemberAdd / guildMemberRemove).
   * Debounced: only runs the update after UPDATE_INTERVAL_MS.
   */
  static triggerUpdate(guild: Guild): void {
    const guildId = guild.id;

    if (!this.debounce.has(guildId)) {
      this.debounce.set(guildId, { timer: null, pending: false, lastUpdate: 0 });
    }

    const state = this.debounce.get(guildId)!;
    state.pending = true;

    // Already a timer active? → do nothing, it's already running
    if (state.timer !== null) return;

    const now         = Date.now();
    const timeSinceLast = now - state.lastUpdate;
    const delay       = Math.max(0, UPDATE_INTERVAL_MS - timeSinceLast);

    state.timer = setTimeout(async () => {
      state.timer  = null;
      state.pending = false;
      state.lastUpdate = Date.now();

      try {
        await this.updateAll(guild);
      } catch (err) {
        console.error(`[Stats] Update failed for ${guildId}:`, err);
      }
    }, delay);

    if (delay > 0) {
      console.log(`[Stats] Update for ${guild.name} scheduled in ${Math.round(delay / 1000)}s`);
    }
  }

  /**
   * Forces an immediate update (e.g. after /stats refresh).
   * Clears the running debounce timer for this guild.
   */
  static async forceUpdate(guild: Guild): Promise<void> {
    const state = this.debounce.get(guild.id);
    if (state?.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    await this.updateAll(guild);
    if (state) {
      state.lastUpdate = Date.now();
      state.pending = false;
    }
  }

  // ── Internes Update ───────────────────────────────────────────────────────

  /** Reads config & stats and renames all channels */
  private static async updateAll(guild: Guild): Promise<void> {
    const config = getStatsConfig(guild.id);
    if (config.channels.length === 0) return;

    // Refresh member cache (make sure everyone is loaded)
    await guild.members.fetch().catch(() => {});

    const stats = this.computeStats(guild);

    const updates = config.channels.map(ch =>
      this.updateChannel(guild, ch, stats)
    );

    // Update in parallel (all channels at once)
    const results = await Promise.allSettled(updates);
    const failed  = results.filter(r => r.status === 'rejected').length;

    if (failed > 0) {
      console.warn(`[Stats] ${failed}/${results.length} channel updates failed in ${guild.name}`);
    } else {
      console.log(`[Stats] ${results.length} channels updated in ${guild.name}`);
    }
  }

  /** Stats-Werte aus dem Cache berechnen */
  static computeStats(guild: Guild): GuildStats {
    const members = guild.members.cache;

    const total  = members.size;
    const bots   = members.filter(m => m.user.bot).size;
    const humans = total - bots;

    // Online: status ≠ offline and ≠ invisible (requires GUILD_PRESENCES intent).
    // If the intent is missing or presence data isn't cached yet,
    // the counter falls back to -1 so stat channels show "N/A"
    // instead of a permanent 0 (which would look like a bug).
    const presencesAvailable = members.some(m => m.presence !== null);
    const online = presencesAvailable
      ? members.filter(m =>
          !m.user.bot && m.presence?.status !== 'offline' && m.presence?.status !== undefined
        ).size
      : -1;

    const boosts     = guild.premiumSubscriptionCount ?? 0;
    const boostLevel = guild.premiumTier;

    // Role counter
    const roles: Record<string, number> = {};
    guild.roles.cache.forEach(role => {
      roles[role.id] = role.members.size;
    });

    return { total, humans, bots, online, boosts, boostLevel, roles };
  }

  /** Rename a single stat channel */
  private static async updateChannel(
    guild: Guild,
    ch: StatChannel,
    stats: GuildStats,
  ): Promise<void> {
    const channel = guild.channels.cache.get(ch.channelId);
    if (!channel || channel.type !== ChannelType.GuildVoice) return;

    const value = this.getValue(ch, stats, guild);
    const name  = this.renderTemplate(ch.template, value, ch, guild);

    // Don't rename if the name stays the same (saves API calls)
    if (channel.name === name) return;

    await (channel as VoiceChannel).setName(name, 'Stats-Update').catch(err => {
      console.error(`[Stats] setName failed (${channel.id}):`, err?.message ?? err);
    });
  }

  // ── Hilfsmethoden ────────────────────────────────────────────────────────

  private static getValue(ch: StatChannel, stats: GuildStats, guild: Guild): number {
    switch (ch.type as StatChannelType) {
      case 'total':       return stats.total;
      case 'humans':      return stats.humans;
      case 'bots':        return stats.bots;
      case 'online':      return stats.online;
      case 'boosts':      return stats.boosts;
      case 'boost_level': return stats.boostLevel;
      case 'role':        return ch.roleId ? (stats.roles[ch.roleId] ?? 0) : 0;
      default:            return 0;
    }
  }

  private static renderTemplate(
    template: string,
    value: number,
    ch: StatChannel,
    guild: Guild,
  ): string {
    // Get the guild's language from the DB
    const guildConfig = getGuild(guild.id);
    const lang = (guildConfig.language || 'en') as Language;

    // __default__ or old hardcoded templates → localized template
    const isDefault = template === DEFAULT_TEMPLATE_SENTINEL
      || LEGACY_DEFAULT_TEMPLATES.includes(template);

    const tpl = isDefault
      ? getLocalized(`stats.template.${ch.type}`, lang)
      : template;

    let result = value === -1
      ? tpl.replace('{value}', 'N/A')   // GuildPresences intent missing
      : tpl.replace('{value}', value.toLocaleString());

    if (ch.roleId) {
      const roleName = guild.roles.cache.get(ch.roleId)?.name ?? 'Role';
      result = result.replace('{role}', roleName);
    }

    return result.slice(0, 100);
  }

  /** Zeigt ob eine Guild ausstehende Updates hat */
  static hasPendingUpdate(guildId: string): boolean {
    return this.debounce.get(guildId)?.pending ?? false;
  }

  /** Seconds until the next scheduled update */
  static secondsUntilNextUpdate(guildId: string): number | null {
    const state = this.debounce.get(guildId);
    if (!state?.timer || state.lastUpdate === 0) return null;
    const remaining = (state.lastUpdate + UPDATE_INTERVAL_MS) - Date.now();
    return Math.max(0, Math.round(remaining / 1000));
  }
}
