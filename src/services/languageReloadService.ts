/**
 * LANGUAGE RELOAD SERVICE
 * When the server language changes, this service updates
 * alle persistenten Bot-Nachrichten:
 *
 *  1. Stat channels (voice channel names)     ← StatsService.forceUpdate
 *  2. Ticket-Panels (Button-Labels, Fallback-Desc)
 *  3. Multipanels
 *
 * Ticket content (title, description) is user-defined → is NOT translated.
 * Button labels (Close, Claim, Transcript) and system defaults → ARE translated.
 */

import { Client, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel } from 'discord.js';
import { getGuild } from '../database/db';
import { getLocalized, Language } from '../utils/localization';
import { StatsService } from '../stats/StatsService';
import { getStatsConfig } from '../stats/StatsDB';
import db from '../database/db';

interface PanelRow {
  id: number;
  guild_id: string;
  name: string;
  title: string;
  description: string | null;
  color: string;
  emoji: string;
  button_text: string;
  category_id: string | null;
  support_roles: string;
  message_id: string | null;
  channel_id: string | null;
}

interface MultipanelRow {
  id: number;
  panel_id: string;
  guild_id: string;
  channel_id: string;
  message_id: string | null;
  title: string;
  description: string | null;
  color: string;
  option_ids: string;
}

// ────────────────────────────────────────────────────────────────────────────

export class LanguageReloadService {

  /**
   * Called from /language set.
   * Runs in the background (no await needed).
   */
  static async reloadAll(client: Client, guildId: string): Promise<void> {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    const config  = getGuild(guildId);
    const lang    = (config.language || 'en') as Language;

    // 1. Stat channels
    const hasStats = getStatsConfig(guildId).channels.length > 0;
    if (hasStats) {
      await StatsService.forceUpdate(guild).catch(() => {});
    }

    // 2. Ticket-Panels
    await this.reloadTicketPanels(client, guildId, lang);

    // 3. Multipanels
    await this.reloadMultipanels(client, guildId, lang);
  }

  // ── Ticket-Panels ──────────────────────────────────────────────────────────

  private static async reloadTicketPanels(
    client: Client,
    guildId: string,
    lang: Language,
  ): Promise<void> {
    const panels = db
      .prepare('SELECT * FROM panels WHERE guild_id = ? AND message_id IS NOT NULL AND channel_id IS NOT NULL')
      .all(guildId) as PanelRow[];

    for (const panel of panels) {
      try {
        const channel = client.channels.cache.get(panel.channel_id!) as TextChannel | undefined;
        if (!channel) continue;

        const message = await channel.messages.fetch(panel.message_id!).catch(() => null);
        if (!message) continue;

        // Embed — title and description are user-defined → keep as-is
        const embed = new EmbedBuilder()
          .setTitle(panel.title)
          .setColor(panel.color as any)
          .setDescription(panel.description ?? getLocalized('ticket.default_desc', lang));

        // Button — label is user-configured → keep as-is
        const btn = new ButtonBuilder()
          .setCustomId(`ticket_open_${panel.id}`)
          .setLabel(panel.button_text)
          .setEmoji(panel.emoji)
          .setStyle(ButtonStyle.Primary);

        await message.edit({
          embeds: [embed],
          components: [new ActionRowBuilder<ButtonBuilder>().addComponents(btn)],
        });
      } catch {
        // Individual error → skip, don't crash
      }
    }
  }

  // ── Multipanels ────────────────────────────────────────────────────────────

  private static async reloadMultipanels(
    client: Client,
    guildId: string,
    lang: Language,
  ): Promise<void> {
    const panels = db
      .prepare('SELECT * FROM multipanels WHERE guild_id = ? AND message_id IS NOT NULL')
      .all(guildId) as MultipanelRow[];

    for (const panel of panels) {
      try {
        const channel = client.channels.cache.get(panel.channel_id) as TextChannel | undefined;
        if (!channel) continue;

        const message = await channel.messages.fetch(panel.message_id!).catch(() => null);
        if (!message) continue;

        // Embed — content is user-defined → keep as-is, just resend to refresh
        const embed = new EmbedBuilder()
          .setTitle(panel.title)
          .setColor(panel.color as any);

        if (panel.description) embed.setDescription(panel.description);

        // Load options from DB and rebuild the select menu
        const optionIds: string[] = JSON.parse(panel.option_ids || '[]');
        const options = optionIds
          .map(id => db.prepare('SELECT * FROM multipanel_options WHERE option_id = ?').get(id) as any)
          .filter(Boolean);

        if (options.length === 0) continue;

        const { StringSelectMenuBuilder } = await import('discord.js');
        const select = new StringSelectMenuBuilder()
          .setCustomId(`multipanel_select_${panel.panel_id}`)
          .setPlaceholder(getLocalized('ticket.default_desc', lang))
          .addOptions(options.map((o: any) => ({
            label:       o.label,
            value:       o.option_id,
            description: o.description?.slice(0, 100),
            emoji:       o.emoji || undefined,
          })));

        await message.edit({
          embeds: [embed],
          components: [new ActionRowBuilder<any>().addComponents(select)],
        });
      } catch {
        // Individual error → skip
      }
    }
  }
}
