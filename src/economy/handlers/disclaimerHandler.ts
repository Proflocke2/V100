/**
 * DISCLAIMER HANDLER
 * Handles gambling_accept_ and gambling_decline_ buttons.
 *
 * Accept → check cooldown → run game → public result
 * Decline → update the ephemeral message → done
 */

import {
  ButtonInteraction,
  EmbedBuilder,
} from 'discord.js';
import { getGuild } from '../../database/db';
import { getLocalized, Language } from '../../utils/localization';
import { GamblingCooldown } from '../cooldown/GamblingCooldown';
import { getPending, removePending } from '../guards/PendingGames';
import { executeGame, GameSendContext } from '../guards/gameExecutor';
import { error } from '../../utils/embeds';

export function isDisclaimerButton(customId: string): boolean {
  return customId.startsWith('gambling_accept_') || customId.startsWith('gambling_decline_');
}

export async function handleDisclaimerButton(btn: ButtonInteraction): Promise<void> {
  const id      = btn.customId;
  const isAccept = id.startsWith('gambling_accept_');
  const rest    = id.replace(isAccept ? 'gambling_accept_' : 'gambling_decline_', '');
  const splitIdx = rest.indexOf('_');
  const userId  = rest.slice(0, splitIdx);
  const guildId = rest.slice(splitIdx + 1);

  if (btn.user.id !== userId) {
    const lang = ((getGuild(btn.guildId!).language) || 'en') as Language;
    return void btn.reply({
      embeds: [error(getLocalized('common.no_permission', lang))],
      ephemeral: true,
    });
  }

  if (!isAccept) return handleDecline(btn, userId, guildId);
  return handleAccept(btn, userId, guildId);
}

async function handleDecline(btn: ButtonInteraction, userId: string, guildId: string): Promise<void> {
  removePending(userId, guildId);
  const lang = ((getGuild(guildId).language) || 'en') as Language;
  await btn.update({
    embeds: [
      new EmbedBuilder()
        .setColor('#ed4245')
        .setTitle(getLocalized('economy.disclaimer.declined_title', lang))
        .setDescription(getLocalized('economy.disclaimer.declined_desc', lang)),
    ],
    components: [],
  });
}

async function handleAccept(btn: ButtonInteraction, userId: string, guildId: string): Promise<void> {
  const lang    = ((getGuild(guildId).language) || 'en') as Language;
  const pending = getPending(userId, guildId);

  if (!pending) {
    await btn.update({
      embeds: [
        new EmbedBuilder()
          .setColor('#ed4245')
          .setTitle(getLocalized('economy.disclaimer.expired', lang))
          .setDescription(getLocalized('economy.disclaimer.expired_desc', lang)),
      ],
      components: [],
    });
    return;
  }

  removePending(userId, guildId);

  // ── Check cooldown ──────────────────────────────────────────────────────
  const guild = getGuild(guildId);
  const cdMs  = typeof guild.gambling_cooldown_ms === 'number'
    ? guild.gambling_cooldown_ms
    : GamblingCooldown.GLOBAL_CD_MS;
  const block = GamblingCooldown.check(userId, guildId, cdMs);
  if (block) {
    const totalSecs = Math.ceil(block.remainingMs / 1_000);
    const mins      = Math.floor(totalSecs / 60);
    const secs      = totalSecs % 60;
    const time      = mins > 0 ? `${mins}m ${secs}s` : `${totalSecs}s`;
    const title = block.reason === 'cooldown'
      ? getLocalized('economy.cooldown.wait_title', lang)
      : getLocalized('economy.cooldown.session_title', lang);
    const desc  = block.reason === 'cooldown'
      ? getLocalized('economy.cooldown.wait_desc', lang, { time })
      : getLocalized('economy.cooldown.session_desc', lang, { time });
    await btn.update({ embeds: [error(title, desc)], components: [] });
    return;
  }

  // ── Update the disclaimer message (remove buttons) ────────────────────────
  await btn.update({
    embeds: [
      new EmbedBuilder()
        .setColor('#57f287')
        .setDescription(getLocalized('economy.disclaimer.accepted', lang)),
    ],
    components: [],
  });

  // ── Run game (via shared gameExecutor) ────────────────────────────
  const ctx: GameSendContext = {
    send:      (opts) => btn.editReply(opts).then(() => {}),
    followUp:  (opts) => btn.followUp(opts as any),
    channelId: btn.channelId!,
  };
  await executeGame(ctx, pending, lang);
}
