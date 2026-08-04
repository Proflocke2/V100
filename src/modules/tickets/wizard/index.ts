/**
 * modules/tickets/wizard/index.ts
 *
 * Public surface of the whole /ticket setup wizard: startWizard() (called
 * from the command) and isWizardComponent()/handleWizardComponent() (called
 * from events/interactionCreate.ts for every button/select/modal it fires).
 *
 * Routing is purely by customId prefix: `tw:<sessionId>:<section>:<action>:<args...>`.
 * `nav` is the one section handled here directly (menu navigation, back,
 * close); every other section delegates to its own module.
 */

import {
  ButtonInteraction, ChannelSelectMenuInteraction, RoleSelectMenuInteraction, StringSelectMenuInteraction,
  ChatInputCommandInteraction, MessageFlags,
} from 'discord.js';
import { createSession, getSession, endSession, touchSession, parseCustomId } from './session';
import { renderTo, expiredView, noPermissionView, WizardComponentInteraction, WizardView } from './helpers';
import { renderMainMenu } from './mainMenu';
import { renderPanelList, renderPanelDetail, renderCategoryList, renderCategoryDetail, handlePanelSection, handleCategorySection, handleFormSection, renderFormList } from './panels';
import { renderMultiPanelList, renderMultiPanelDetail, handleMultiPanelSection } from './multipanels';
import { renderSettingsOverview, handleSettingsSection } from './settings';
import { renderTypeList, handleTicketTypeSection } from './tickettypes';
import { renderTagList, handleTagSection } from './tags';
import { renderStatsMenu, handleStatsSection } from './stats';
import { tw } from './i18n';
import { info } from '../../../utils/embeds';

export function isWizardComponent(customId: string): boolean {
  return customId.startsWith('tw:');
}

export async function startWizard(ix: ChatInputCommandInteraction): Promise<void> {
  const sessionId = createSession(ix.guildId!, ix.user.id);
  const view = renderMainMenu(sessionId);
  await ix.reply({ ...view, flags: MessageFlags.Ephemeral });
}

/** Resolves a `section:action:args` path (as used by "🔙 Back" and the main-menu select) to a fresh view, without needing a real user click on that specific screen's own trigger. */
function renderPath(sessionId: string, guildId: string, path: string): WizardView {
  if (!path || path === 'menu') return renderMainMenu(sessionId);

  const [section, action, ...args] = path.split(':');
  switch (`${section}:${action}`) {
    case 'panel:list': return renderPanelList(sessionId, guildId);
    case 'panel:detail': return renderPanelDetail(sessionId, Number(args[0]));
    case 'cat:list': return renderCategoryList(sessionId, Number(args[0]));
    case 'cat:detail': return renderCategoryDetail(sessionId, Number(args[0]));
    case 'form:panel': return renderFormList(sessionId, Number(args[0]));
    case 'multi:list': return renderMultiPanelList(sessionId, guildId);
    case 'multi:detail': return renderMultiPanelDetail(sessionId, Number(args[0]));
    case 'set:overview': return renderSettingsOverview(sessionId, guildId);
    case 'type:list': return renderTypeList(sessionId, guildId);
    case 'tag:list': return renderTagList(sessionId, guildId);
    case 'stats:menu': return renderStatsMenu(sessionId);
    default: return renderMainMenu(sessionId);
  }
}

export async function handleWizardComponent(
  interaction: ButtonInteraction | ChannelSelectMenuInteraction | RoleSelectMenuInteraction | StringSelectMenuInteraction,
): Promise<void> {
  const { sessionId, section, action, args } = parseCustomId(interaction.customId);
  const session = getSession(sessionId);

  if (!session) { await renderTo(interaction, expiredView(interaction.guildId ?? undefined)); return; }
  if (interaction.user.id !== session.userId) { await renderTo(interaction, noPermissionView(session.guildId)); return; }
  touchSession(sessionId);

  const wcInteraction = interaction as WizardComponentInteraction;

  // ── Navigation (main menu select, back, close) ────────────────────────────
  if (section === 'nav') {
    if (action === 'goto' && interaction.isStringSelectMenu()) {
      await renderTo(interaction, renderPath(sessionId, session.guildId, interaction.values[0]));
      return;
    }
    if (action === 'back' && interaction.isButton()) {
      await renderTo(interaction, renderPath(sessionId, session.guildId, args.join(':') || 'menu'));
      return;
    }
    if (action === 'close' && interaction.isButton()) {
      endSession(sessionId);
      await interaction.update({ embeds: [info(tw(sessionId, 'nav.closed_title'), tw(sessionId, 'nav.closed_desc'))], components: [] }).catch(() => {});
      return;
    }
    return;
  }

  if (section === 'panel')  { await handlePanelSection(wcInteraction, sessionId, action, args); return; }
  if (section === 'cat')    { await handleCategorySection(wcInteraction, sessionId, action, args); return; }
  if (section === 'form')   { await handleFormSection(wcInteraction, sessionId, action, args); return; }
  if (section === 'multi')  { await handleMultiPanelSection(wcInteraction, sessionId, action, args); return; }
  if (section === 'set')    { await handleSettingsSection(wcInteraction, sessionId, action); return; }
  if (section === 'type')   { await handleTicketTypeSection(wcInteraction, sessionId, action, args); return; }
  if (section === 'tag')    { await handleTagSection(wcInteraction, sessionId, action, args); return; }
  if (section === 'stats')  { await handleStatsSection(wcInteraction, sessionId, action, session.guildId); return; }
}
