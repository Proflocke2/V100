/**
 * modules/tickets/wizard/helpers.ts
 *
 * Small building blocks shared by every wizard section: the modal-prompt
 * pattern (open a modal from a button/select interaction, await its
 * submission, hand back an interaction you can .update() with), and the
 * standard "🔙 Back" / "❌ Cancel" row every screen ends with.
 */

import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ButtonInteraction,
  ChannelSelectMenuInteraction, RoleSelectMenuInteraction, StringSelectMenuInteraction,
  ModalBuilder, TextInputBuilder, TextInputStyle, ModalSubmitInteraction,
  EmbedBuilder, MessageFlags,
} from 'discord.js';
import { buildCustomId } from './session';
import { tw, twg } from './i18n';
import { error } from '../../../utils/embeds';

export type WizardComponentInteraction =
  | ButtonInteraction | ChannelSelectMenuInteraction | RoleSelectMenuInteraction | StringSelectMenuInteraction;

export interface WizardView {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<any>[];
}

/** Standard back/cancel row every screen (except the main menu itself) ends with. */
export function navRow(sessionId: string, backTo: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buildCustomId(sessionId, 'nav', 'back', backTo)).setLabel(tw(sessionId, 'nav.back')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(buildCustomId(sessionId, 'nav', 'close')).setLabel(tw(sessionId, 'nav.close')).setStyle(ButtonStyle.Danger),
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
 * Opens a modal (up to 5 text fields) from any component interaction and
 * awaits its submission. Returns the submitted values keyed by field id,
 * plus the ModalSubmitInteraction itself (call `.update()` on it to edit
 * the ORIGINAL wizard message — Discord keeps that link for modals opened
 * from a message component). Returns null on timeout/dismissal.
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

/** Edits the message via whichever update-capable interaction we have — component interactions directly, or a ModalSubmitInteraction opened FROM a component (isFromMessage()). */
export async function renderTo(interaction: WizardComponentInteraction | ModalSubmitInteraction, view: WizardView): Promise<void> {
  if ('isFromMessage' in interaction && !interaction.isFromMessage()) {
    await interaction.reply({ ...view, flags: MessageFlags.Ephemeral }).catch(() => {});
    return;
  }
  await (interaction as any).update(view).catch(() => {});
}

export function expiredView(guildId?: string): WizardView {
  const g = guildId ?? '0';
  return { embeds: [error(twg(g, 'nav.expired_title'), twg(g, 'nav.expired_desc'))], components: [] };
}

export function noPermissionView(guildId?: string): WizardView {
  const g = guildId ?? '0';
  return { embeds: [error(twg(g, 'nav.notyours_title'), twg(g, 'nav.notyours_desc'))], components: [] };
}
