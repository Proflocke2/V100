/**
 * modalText — helper function for free-text input via Discord modals.
 *
 * Slash-command string options strip real line breaks entirely.
 * Discord modal TextInputs (TextInputStyle.Paragraph) keep real \n.
 *
 * Usage:
 *   const text = await promptText(ix, { title: 'Message', label: 'Welcome Message', placeholder: '{user} welcome!', current: existingMsg });
 *   if (text === null) return; // cancelled / timeout
 */

import {
  ChatInputCommandInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ModalSubmitInteraction,
} from 'discord.js';

export interface PromptTextOptions {
  /** Modal-Titel (max 45 Zeichen) */
  title: string;
  /** Input-Label (max 45 Zeichen) */
  label: string;
  /** Platzhalter-Text (max 100 Zeichen) */
  placeholder?: string;
  /** Pre-filled value (current content when editing) */
  current?: string | null;
  /** Minimum Zeichenanzahl (default: 0) */
  minLength?: number;
  /** Maximum Zeichenanzahl (default: 2000) */
  maxLength?: number;
  /** Pflichtfeld? (default: false) */
  required?: boolean;
  /** Timeout in ms (default: 5 Minuten) */
  timeout?: number;
}

/**
 * Opens a modal with a paragraph text field and waits for a response.
 * Returns the entered text, or null on timeout.
 *
 * IMPORTANT: ix must not have been replied to yet (no deferReply before this).
 * Otherwise: use promptTextFromButton when the interaction has already been replied to.
 */
export async function promptText(
  ix: ChatInputCommandInteraction,
  opts: PromptTextOptions,
): Promise<{ text: string; modal: ModalSubmitInteraction } | null> {
  const customId = `modaltext:${ix.id}`;

  const modal = new ModalBuilder()
    .setCustomId(customId)
    .setTitle(opts.title.slice(0, 45))
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('text')
          .setLabel(opts.label.slice(0, 45))
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder((opts.placeholder ?? '').slice(0, 100))
          .setRequired(opts.required ?? false)
          .setMinLength(opts.minLength ?? 0)
          .setMaxLength(opts.maxLength ?? 2000)
          .setValue(opts.current?.slice(0, opts.maxLength ?? 2000) ?? ''),
      ),
    );

  await ix.showModal(modal);

  try {
    const submit = await ix.awaitModalSubmit({
      filter: (i) => i.customId === customId && i.user.id === ix.user.id,
      time:   opts.timeout ?? 5 * 60 * 1000,
    });
    const text = submit.fields.getTextInputValue('text');
    return { text, modal: submit };
  } catch {
    return null; // Timeout
  }
}
