/**
 * guildMemberAdd event.
 */

import { GuildMember } from 'discord.js';
import { BotClient } from '../utils/types';
import { StatsService } from '../stats/StatsService';
import { onMemberJoin } from '../modules/welcome/service';
import { handleMemberJoinAntiRaid } from '../modules/moderation/antiRaid';
import { logMemberJoin } from '../modules/moderation/modLog';
import { handleStickyMuteOnJoin } from '../modules/moderation/stickyMute';
import { handleSecurityMemberJoin } from '../modules/security/securityEngine';

export default {
  async execute(member: GuildMember, _client: BotClient) {
    StatsService.triggerUpdate(member.guild);

    // ── Security Engine — FIRST: fastest possible interception ───────────────
    // Runs fully in parallel with the rest; any kick/ban/timeout fires immediately.
    handleSecurityMemberJoin(member).catch(err =>
      console.error('[SecurityEngine] handleSecurityMemberJoin failed:', err),
    );

    // ── Sticky Mute — FIRST: reapply before welcome flow ─────────────────────
    try {
      await handleStickyMuteOnJoin(member);
    } catch (err) {
      console.error('[StickyMute] handleStickyMuteOnJoin failed:', err);
    }

    // ── Anti-Raid (legacy — still active alongside engine) ────────────────────
    try {
      await handleMemberJoinAntiRaid(member);
    } catch (err) {
      console.error('[AntiRaid] handleMemberJoinAntiRaid failed:', err);
    }

    // ── Mod Log ───────────────────────────────────────────────────────────────
    try {
      await logMemberJoin(member);
    } catch (err) {
      console.error('[ModLog] logMemberJoin failed:', err);
    }

    // ── Welcome ───────────────────────────────────────────────────────────────
    try {
      await onMemberJoin(member);
    } catch (err) {
      console.error('[Welcome] onMemberJoin failed:', err);
    }
  },
};
