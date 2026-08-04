/**
 * VERIFICATION SERVICE
 * handles all verification logic - cooldowns, captcha state, audit log
 */

import { Guild, GuildMember, EmbedBuilder, TextChannel, User } from 'discord.js';
import db, { initializeVerification } from '../database/db';

// ============================================================================
// TYPES
// ============================================================================

export interface IVerificationConfig {
  guildId: string;
  enabled: boolean;
  unverifiedRoleId: string | null;
  verifiedRoleId: string | null;
  verificationChannelId: string | null;
  logChannelId: string | null;
  message: string;
}

export interface ICaptchaSession {
  code: string;
  expiresAt: number;
  attempts: number;
}

// ============================================================================
// VERIFICATION SERVICE (Singleton)
// ============================================================================

export class VerificationService {
  // active captcha sessions stored in memory (TTL 2 min)
  private static sessions = new Map<string, ICaptchaSession>();

  // cooldown tracker - prevents button spam
  private static cooldowns = new Map<string, number>();

  // captcha TTL in ms (2 minutes)
  private static readonly CAPTCHA_TTL = 2 * 60 * 1000;

  // cooldown between verify button clicks (30 seconds)
  private static readonly COOLDOWN_MS = 30 * 1000;

  // max attempts per captcha
  private static readonly MAX_ATTEMPTS = 3;

  /**
   * Initialize the service - sets up cleanup interval
   * call this once on bot startup
   */
  static initialize(): void {
    // setup the database tables if they dont exist yet
    this.initializeTables();

    // cleanup expired sessions every 60 seconds
    setInterval(() => this.cleanupExpired(), 60 * 1000);
  }

  /**
   * Setup db tables - adds verify_log table and ensures verification_config exists
   */
  private static initializeTables(): void {
    try {
      // Use the centralized database initialization
      initializeVerification();
    } catch (err) {
      console.error('[Verify] Failed to initialize tables:', err);
    }
  }

  // ==========================================================================
  // CONFIG MANAGEMENT
  // ==========================================================================

  /**
   * Get verification config for a guild
   */
  static getConfig(guildId: string): IVerificationConfig | null {
    const row = db.prepare('SELECT * FROM verification_config WHERE guild_id = ?')
      .get(guildId) as any;

    if (!row) return null;

    return {
      guildId: row.guild_id,
      enabled: !!row.enabled,
      unverifiedRoleId: row.unverified_role_id,
      verifiedRoleId: row.verified_role_id,
      verificationChannelId: row.verification_channel_id,
      logChannelId: row.log_channel_id,
      message: row.message || 'Click below to verify',
    };
  }

  /**
   * Save or update guild config
   */
  static saveConfig(config: Partial<IVerificationConfig> & { guildId: string }): void {
    const existing = this.getConfig(config.guildId);

    if (existing) {
      // update existing
      db.prepare(`
        UPDATE verification_config 
        SET enabled = ?, unverified_role_id = ?, verified_role_id = ?, 
            verification_channel_id = ?, log_channel_id = ?, message = ?
        WHERE guild_id = ?
      `).run(
        config.enabled !== undefined ? (config.enabled ? 1 : 0) : (existing.enabled ? 1 : 0),
        config.unverifiedRoleId ?? existing.unverifiedRoleId,
        config.verifiedRoleId ?? existing.verifiedRoleId,
        config.verificationChannelId ?? existing.verificationChannelId,
        config.logChannelId ?? existing.logChannelId,
        config.message ?? existing.message,
        config.guildId
      );
    } else {
      // insert new
      db.prepare(`
        INSERT INTO verification_config (
          guild_id, enabled, unverified_role_id, verified_role_id, 
          verification_channel_id, log_channel_id, message
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        config.guildId,
        config.enabled ? 1 : 0,
        config.unverifiedRoleId ?? null,
        config.verifiedRoleId ?? null,
        config.verificationChannelId ?? null,
        config.logChannelId ?? null,
        config.message ?? 'Click below to verify'
      );
    }
  }

  // ==========================================================================
  // CAPTCHA SESSION MANAGEMENT
  // ==========================================================================

  /**
   * Create a new captcha session for a user
   */
  static createSession(userId: string, code: string): void {
    this.sessions.set(userId, {
      code,
      expiresAt: Date.now() + this.CAPTCHA_TTL,
      attempts: 0,
    });
  }

  /**
   * Get a user's active session
   */
  static getSession(userId: string): ICaptchaSession | null {
    const session = this.sessions.get(userId);
    if (!session) return null;

    // check if expired
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(userId);
      return null;
    }

    return session;
  }

  /**
   * Verify a user's captcha submission
   * returns the result with status info
   */
  static verifySubmission(userId: string, submitted: string): {
    success: boolean;
    expired?: boolean;
    tooManyAttempts?: boolean;
    attemptsLeft?: number;
  } {
    const session = this.getSession(userId);
    if (!session) {
      return { success: false, expired: true };
    }

    session.attempts++;

    // check max attempts
    if (session.attempts > this.MAX_ATTEMPTS) {
      this.sessions.delete(userId);
      return { success: false, tooManyAttempts: true };
    }

    // case insensitive comparison
    if (session.code.toUpperCase() === submitted.toUpperCase().trim()) {
      this.sessions.delete(userId);
      return { success: true };
    }

    return {
      success: false,
      attemptsLeft: this.MAX_ATTEMPTS - session.attempts,
    };
  }

  /**
   * Remove expired sessions (called periodically)
   */
  private static cleanupExpired(): void {
    const now = Date.now();
    let cleaned = 0;
    for (const [userId, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        this.sessions.delete(userId);
        cleaned++;
      }
    }

    // also cleanup old cooldowns
    for (const [userId, timestamp] of this.cooldowns.entries()) {
      if (now - timestamp > this.COOLDOWN_MS) {
        this.cooldowns.delete(userId);
      }
    }
  }

  // ==========================================================================
  // COOLDOWN MANAGEMENT
  // ==========================================================================

  /**
   * Check if user is on cooldown
   * returns remaining cooldown in seconds, or 0 if not on cooldown
   */
  static getCooldownRemaining(userId: string): number {
    const lastClick = this.cooldowns.get(userId);
    if (!lastClick) return 0;

    const elapsed = Date.now() - lastClick;
    if (elapsed >= this.COOLDOWN_MS) {
      this.cooldowns.delete(userId);
      return 0;
    }

    return Math.ceil((this.COOLDOWN_MS - elapsed) / 1000);
  }

  /**
   * Set cooldown for a user
   */
  static setCooldown(userId: string): void {
    this.cooldowns.set(userId, Date.now());
  }

  // ==========================================================================
  // ROLE MANAGEMENT
  // ==========================================================================

  /**
   * Apply verified role and remove unverified role from member
   */
  static async applyVerification(member: GuildMember, config: IVerificationConfig): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      // remove unverified role if set
      if (config.unverifiedRoleId && member.roles.cache.has(config.unverifiedRoleId)) {
        await member.roles.remove(config.unverifiedRoleId, 'Verified via captcha');
      }

      // add verified role
      if (config.verifiedRoleId) {
        await member.roles.add(config.verifiedRoleId, 'Verified via captcha');
      } else {
        return { success: false, error: 'No verified role configured' };
      }

      // Hook: welcome module's "after verify" role
      try {
        const { applyAfterVerifyRole } = await import('../modules/welcome/service');
        await applyAfterVerifyRole(member);
      } catch (e) {
        console.error('[Verify] applyAfterVerifyRole failed:', e);
      }

      return { success: true };
    } catch (err) {
      console.error('[Verify] Role assignment failed:', err);
      return { success: false, error: 'Failed to assign roles - check bot permissions' };
    }
  }

  // ==========================================================================
  // AUDIT LOGGING
  // ==========================================================================

  /**
   * Log a verification action to database and optionally to discord
   */
  static async logAction(
    guild: Guild,
    user: User,
    action: 'started' | 'success' | 'failed' | 'expired' | 'cooldown' | 'config_changed',
    details?: string
  ): Promise<void> {
    // save to db
    try {
      db.prepare(`
        INSERT INTO verify_log (guild_id, user_id, action, details)
        VALUES (?, ?, ?, ?)
      `).run(guild.id, user.id, action, details || null);
    } catch (err) {
      console.error('[Verify] Log save failed:', err);
    }

    // send to log channel if configured
    const config = this.getConfig(guild.id);
    if (!config?.logChannelId) return;

    try {
      const channel = await guild.channels.fetch(config.logChannelId);
      if (!channel?.isTextBased()) return;

      const colors = {
        started: '#5865f2',
        success: '#57f287',
        failed: '#ed4245',
        expired: '#faa61a',
        cooldown: '#faa61a',
        config_changed: '#5865f2',
      };

      const titles = {
        started: '🔐 Verification Started',
        success: '✅ Verification Successful',
        failed: '❌ Verification Failed',
        expired: '⏱️ Verification Expired',
        cooldown: '⏰ Cooldown Hit',
        config_changed: '⚙️ Config Changed',
      };

      const embed = new EmbedBuilder()
        .setTitle(titles[action])
        .setColor(colors[action] as any)
        .addFields(
          { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
          { name: 'Time', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
        )
        .setThumbnail(user.displayAvatarURL());

      if (details) {
        embed.addFields({ name: 'Details', value: details });
      }

      await (channel as TextChannel).send({ embeds: [embed] });
    } catch (err) {
      console.error('[Verify] Log channel send failed:', err);
    }
  }

  // ==========================================================================
  // STATS
  // ==========================================================================

  /**
   * Get verification stats for a guild
   */
  static getStats(guildId: string): {
    total: number;
    success: number;
    failed: number;
    last24h: number;
  } {
    const total = (db.prepare('SELECT COUNT(*) as c FROM verify_log WHERE guild_id = ?')
      .get(guildId) as any).c;
    const success = (db.prepare('SELECT COUNT(*) as c FROM verify_log WHERE guild_id = ? AND action = ?')
      .get(guildId, 'success') as any).c;
    const failed = (db.prepare('SELECT COUNT(*) as c FROM verify_log WHERE guild_id = ? AND action = ?')
      .get(guildId, 'failed') as any).c;
    const dayAgo = Math.floor(Date.now() / 1000) - 86400;
    const last24h = (db.prepare('SELECT COUNT(*) as c FROM verify_log WHERE guild_id = ? AND timestamp >= ?')
      .get(guildId, dayAgo) as any).c;

    return { total, success, failed, last24h };
  }
}

export default VerificationService;
