/**
 * GAMBLING GUARD
 *
 * sendGamblingDisclaimer: shows the disclaimer (if enabled) or starts
 * the game immediately (if the disclaimer is disabled).
 *
 * Disclaimer ON  → Accept/Decline-Buttons → disclaimerHandler.ts
 * Disclaimer OFF → Spiel direkt starten via gameExecutor.ts
 */

import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { getGuild } from '../../database/db';
import { getLocalized, Language } from '../../utils/localization';
import { storePending, removePending, PendingGame } from './PendingGames';
import { executeGame, GameSendContext } from './gameExecutor';

export async function sendGamblingDisclaimer(
  interaction: ChatInputCommandInteraction,
  pendingGame: PendingGame,
): Promise<void> {
  const guild      = getGuild(interaction.guildId!);
  const lang       = (guild.language || 'en') as Language;
  const showDiscl  = guild.gambling_disclaimer !== 0; // default: true

  storePending(pendingGame);

  // ── Disclaimer DEAKTIVIERT → Spiel sofort starten ──────────────────────
  if (!showDiscl) {
    // First reply: ephemeral "Starting..." (so cooldown errors stay ephemeral)
    await interaction.deferReply({ ephemeral: false });

    const ctx: GameSendContext = {
      send:      (opts) => interaction.editReply(opts).then(() => {}),
      followUp:  (opts) => interaction.followUp(opts as any),
      channelId: interaction.channelId!,
    };

    removePending(pendingGame.userId, pendingGame.guildId);
    await executeGame(ctx, pendingGame, lang);
    return;
  }

  // ── Disclaimer ENABLED → show buttons ──────────────────────────────────
  const embed = new EmbedBuilder()
    .setColor(0xF0A500)
    .setTitle(getLocalized('economy.disclaimer.title', lang))
    .setDescription(getLocalized('economy.disclaimer.description', lang))
    .setFooter({ text: getLocalized('economy.disclaimer.footer', lang) })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`gambling_accept_${interaction.user.id}_${interaction.guildId}`)
      .setLabel(getLocalized('economy.disclaimer.accept_btn', lang))
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`gambling_decline_${interaction.user.id}_${interaction.guildId}`)
      .setLabel(getLocalized('economy.disclaimer.decline_btn', lang))
      .setStyle(ButtonStyle.Danger),
  );

  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}
