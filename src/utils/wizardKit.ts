/**
 * utils/wizardKit.ts
 *
 * Shared infrastructure for the bot's various admin-config wizards
 * (welcome, anti-nuke, reaction-roles, ...) — same pattern as
 * modules/tickets/wizard/{session,helpers}.ts, generalized so each new
 * wizard doesn't reimplement session storage and the modal-prompt dance.
 *
 * Each wizard gets its own short `prefix` (e.g. 'ww' for welcome-wizard) so
 * customIds never collide between wizards even though they share this
 * infrastructure: `<prefix>:<sessionId>:<section>:<action>:<...args>`.
 */

import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ButtonInteraction, StringSelectMenuInteraction,
  ModalBuilder, TextInputBuilder, TextInputStyle, ModalSubmitInteraction,
  EmbedBuilder, MessageFlags,
} from 'discord.js';
import { error } from './embeds';

export interface WizardSession {
  guildId: string;
  userId: string;
  lastTouched: number;
  data: Record<string, unknown>;
}

export interface WizardView {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<any>[];
}

const SESSION_TTL_MS = 15 * 60 * 1000;

// One Map per prefix so different wizards' sessions never collide even if
// two happened to generate the same random id.
const sessionStores = new Map<string, Map<string, WizardSession>>();

function storeFor(prefix: string): Map<string, WizardSession> {
  let store = sessionStores.get(prefix);
  if (!store) { store = new Map(); sessionStores.set(prefix, store); }
  return store;
}

function newSessionId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function sweep(store: Map<string, WizardSession>): void {
  const now = Date.now();
  for (const [id, s] of store) {
    if (now - s.lastTouched > SESSION_TTL_MS) store.delete(id);
  }
}

export function createSession(prefix: string, guildId: string, userId: string): string {
  const store = storeFor(prefix);
  sweep(store);
  const id = newSessionId();
  store.set(id, { guildId, userId, lastTouched: Date.now(), data: {} });
  return id;
}

export function getSession(prefix: string, sessionId: string): WizardSession | undefined {
  return storeFor(prefix).get(sessionId);
}

export function touchSession(prefix: string, sessionId: string): void {
  const s = storeFor(prefix).get(sessionId);
  if (s) s.lastTouched = Date.now();
}

export function endSession(prefix: string, sessionId: string): void {
  storeFor(prefix).delete(sessionId);
}

/** Parses `<prefix>:<sessionId>:<section>:<action>:<...args>`. */
export function parseWizardId(customId: string): { sessionId: string; section: string; action: string; args: string[] } {
  const [, sessionId, section, action, ...args] = customId.split(':');
  return { sessionId, section: section ?? '', action: action ?? '', args };
}

export function buildWizardId(prefix: string, sessionId: string, section: string, action: string, ...args: (string | number)[]): string {
  return [prefix, sessionId, section, action, ...args].join(':');
}

export function navRow(prefix: string, sessionId: string, backTo: string, closeLabel = '❌ Close'): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buildWizardId(prefix, sessionId, 'nav', 'back', backTo)).setLabel('🔙 Back').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(buildWizardId(prefix, sessionId, 'nav', 'close')).setLabel(closeLabel).setStyle(ButtonStyle.Danger),
  );
}

export interface ModalFieldSpec {
  id: string;
  label: string;
  style?: TextInputStyle;
  required?: boolean;
  maxLength?: number;
  minLength?: number;
  placeholder?: string;
  value?: string;
}

/**
 * Opens a modal from any component interaction and awaits its submission.
 * Returns the submitted values keyed by field id, plus the
 * ModalSubmitInteraction (call `.update()` on it to edit the ORIGINAL
 * wizard message). Returns null on timeout/dismissal.
 */
export async function promptModal(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  modalId: string,
  title: string,
  fields: ModalFieldSpec[],
): Promise<{ values: Record<string, string>; submit: ModalSubmitInteraction } | null> {
  const modal = new ModalBuilder().setCustomId(modalId).setTitle(title.slice(0, 45));

  for (const f of fields.slice(0, 5)) {
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(f.id)
          .setLabel(f.label.slice(0, 45))
          .setStyle(f.style ?? TextInputStyle.Short)
          .setRequired(f.required ?? false)
          .setMaxLength(f.maxLength ?? 2000)
          .setMinLength(f.minLength ?? 0)
          .setPlaceholder((f.placeholder ?? '').slice(0, 100))
          .setValue((f.value ?? '').slice(0, f.maxLength ?? 2000)),
      ),
    );
  }

  await interaction.showModal(modal);

  try {
    const submit = await interaction.awaitModalSubmit({
      filter: i => i.customId === modalId && i.user.id === interaction.user.id,
      time: 5 * 60 * 1000,
    });
    const values: Record<string, string> = {};
    for (const f of fields) values[f.id] = submit.fields.getTextInputValue(f.id);
    return { values, submit };
  } catch {
    return null; // timeout
  }
}

export type WizardComponentInteraction =
  | ButtonInteraction | StringSelectMenuInteraction
  | import('discord.js').ChannelSelectMenuInteraction | import('discord.js').RoleSelectMenuInteraction
  | import('discord.js').UserSelectMenuInteraction;

/** Edits the message via whichever update-capable interaction we have. */
export async function renderTo(interaction: WizardComponentInteraction | ModalSubmitInteraction, view: WizardView): Promise<void> {
  if ('isFromMessage' in interaction && !interaction.isFromMessage()) {
    await interaction.reply({ ...view, flags: MessageFlags.Ephemeral }).catch(() => {});
    return;
  }
  await (interaction as any).update(view).catch(() => {});
}

export function expiredView(): WizardView {
  return { embeds: [error('Session expired', 'This wizard has expired (15 min. of inactivity). Start again.')], components: [] };
}

export function noPermissionView(): WizardView {
  return { embeds: [error('Not your session', 'Only the person who started this wizard can use it.')], components: [] };
}
