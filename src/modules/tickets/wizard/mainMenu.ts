/**
 * modules/tickets/wizard/mainMenu.ts
 *
 * The top-level menu every "🔙 Back" eventually leads back to.
 * Buttons instead of a select menu — same look and feel as the welcome
 * wizard. Each button routes through the existing nav:goto paths, so the
 * rest of the wizard (renderPath in index.ts) didn't have to change.
 */

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { buildCustomId } from './session';
import { WizardView } from './helpers';
import { tw } from './i18n';

export function renderMainMenu(sessionId: string): WizardView {
  const embed = new EmbedBuilder()
    .setTitle(tw(sessionId, 'menu.title'))
    .setColor('#5865f2')
    .setDescription(tw(sessionId, 'menu.desc'));

  const goto = (path: string) => buildCustomId(sessionId, 'nav', 'back', path);

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(goto('panel:list')).setLabel(tw(sessionId, 'menu.panels')).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(goto('multi:list')).setLabel(tw(sessionId, 'menu.multi')).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(goto('set:overview')).setLabel(tw(sessionId, 'menu.settings')).setStyle(ButtonStyle.Primary),
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(goto('type:list')).setLabel(tw(sessionId, 'menu.templates')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(goto('tag:list')).setLabel(tw(sessionId, 'menu.tags')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(goto('stats:menu')).setLabel(tw(sessionId, 'menu.stats')).setStyle(ButtonStyle.Secondary),
  );
  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buildCustomId(sessionId, 'nav', 'close')).setLabel(tw(sessionId, 'nav.close')).setStyle(ButtonStyle.Danger),
  );

  return { embeds: [embed], components: [row1, row2, row3] };
}
