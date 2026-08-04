/**
 * /webhook — Discohook-like webhook message builder, entirely wizard-driven.
 *
 * A single command, no subcommands — running it opens a central menu that
 * covers everything the old save/remove/list/send/json/edit/delete
 * subcommands did: managing saved webhook URLs, sending a message (via the
 * existing button/modal embed builder), sending raw JSON, and editing or
 * deleting a previously-sent webhook message. Every underlying function
 * (saveWebhook, sendWebhook, editWebhookMessage, deleteWebhookMessage, the
 * embed builder session) is unchanged — this only adds a menu layer in front.
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { requirePermission } from '../../utils/guards';
import { getGuild } from '../../database/db';
import { getLocalized, Language } from '../../utils/localization';
import { listWebhooks } from '../../services/webhookDB';

export default {
  data: new SlashCommandBuilder()
    .setName('webhook')
    .setDescription('Manage and send webhook messages (Discohook-style wizard)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageWebhooks),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!await requirePermission(interaction, PermissionFlagsBits.ManageWebhooks)) return;
    const guild = getGuild(interaction.guildId!);
    const lang  = (guild.language || 'en') as Language;
    return showMainMenu(interaction, interaction.user.id, interaction.guildId!, lang);
  },
};

// ────────────────────────────────────────────────────────────────────────────
// MAIN MENU
// ────────────────────────────────────────────────────────────────────────────

export async function showMainMenu(
  interaction: ChatInputCommandInteraction | any,
  userId: string,
  guildId: string,
  lang: Language,
  isUpdate = false,
): Promise<void> {
  const p = `wh_${userId}_${guildId}`;

  const embed = new EmbedBuilder()
    .setColor('#5865f2')
    .setTitle(getLocalized('webhook.main_title', lang))
    .setDescription(getLocalized('webhook.main_desc', lang));

  const select = new StringSelectMenuBuilder()
    .setCustomId(`${p}_mainmenu`)
    .setPlaceholder(getLocalized('webhook.main_title', lang))
    .addOptions(
      { label: getLocalized('webhook.menu_manage', lang), value: 'manage', emoji: '💾' },
      { label: getLocalized('webhook.menu_send', lang),   value: 'send',   emoji: '📨' },
      { label: getLocalized('webhook.menu_json', lang),   value: 'json',   emoji: '🧩' },
      { label: getLocalized('webhook.menu_edit', lang),   value: 'edit',   emoji: '✏️' },
      { label: getLocalized('webhook.menu_delete', lang), value: 'delete', emoji: '🗑️' },
    );

  const payload = { embeds: [embed], components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)], ephemeral: true };

  if (isUpdate && interaction.update) await interaction.update(payload);
  else await interaction.reply(payload);
}

// ────────────────────────────────────────────────────────────────────────────
// MANAGE SAVED WEBHOOKS
// ────────────────────────────────────────────────────────────────────────────

export async function showManageScreen(interaction: any, userId: string, guildId: string, lang: Language): Promise<void> {
  const p = `wh_${userId}_${guildId}`;
  const hooks = listWebhooks(guildId);

  const embed = new EmbedBuilder()
    .setColor('#5865f2')
    .setTitle(getLocalized('webhook.manage_title', lang))
    .setDescription(hooks.length > 0 ? getLocalized('webhook.manage_desc', lang) : getLocalized('webhook.manage_empty', lang));

  const components: ActionRowBuilder<any>[] = [];
  if (hooks.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(`${p}_manage_remove`)
      .setPlaceholder(getLocalized('webhook.manage_pick_placeholder', lang))
      .addOptions(hooks.slice(0, 25).map(h => ({ label: h.name.slice(0, 100), value: h.name })));
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
  }
  components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`${p}_manage_add`).setLabel(getLocalized('webhook.btn_add', lang)).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`${p}_back`).setLabel(getLocalized('webhook.btn_back', lang)).setStyle(ButtonStyle.Secondary),
  ));

  const payload = { embeds: [embed], components, ephemeral: true };
  if (interaction.update) await interaction.update(payload);
  else await interaction.reply(payload);
}

export function showAddWebhookModal(interaction: any, userId: string, guildId: string, lang: Language): Promise<void> {
  const modal = new ModalBuilder()
    .setCustomId(`wh_addhook_add_${userId}_${guildId}`)
    .setTitle(getLocalized('webhook.add_modal_title', lang));

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('name').setLabel(getLocalized('webhook.add_name_label', lang)).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(50),
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('url').setLabel(getLocalized('webhook.add_url_label', lang)).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(200),
    ),
  );

  return interaction.showModal(modal);
}

// ────────────────────────────────────────────────────────────────────────────
// WEBHOOK PICKER — used before send/json/edit/delete
// ────────────────────────────────────────────────────────────────────────────

export async function showPickerScreen(interaction: any, userId: string, guildId: string, lang: Language, purpose: 'send' | 'json' | 'edit' | 'delete'): Promise<void> {
  const p = `wh_${userId}_${guildId}`;
  const hooks = listWebhooks(guildId);

  const embed = new EmbedBuilder()
    .setColor('#5865f2')
    .setTitle(getLocalized('webhook.pick_title', lang))
    .setDescription(hooks.length > 0 ? getLocalized('webhook.pick_desc', lang) : getLocalized('webhook.pick_none_saved', lang));

  const components: ActionRowBuilder<any>[] = [];
  if (hooks.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(`${p}_pick_${purpose}`)
      .setPlaceholder(getLocalized('webhook.pick_placeholder', lang))
      .addOptions(hooks.slice(0, 25).map(h => ({ label: h.name.slice(0, 100), value: h.name })));
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
  }
  components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`${p}_pickurl_${purpose}`).setLabel(getLocalized('webhook.pick_custom_url', lang)).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`${p}_back`).setLabel(getLocalized('webhook.btn_back', lang)).setStyle(ButtonStyle.Secondary),
  ));

  const payload = { embeds: [embed], components, ephemeral: true };
  if (interaction.update) await interaction.update(payload);
  else await interaction.reply(payload);
}

export function showCustomUrlModal(interaction: any, userId: string, guildId: string, purpose: string, lang: Language): Promise<void> {
  const modal = new ModalBuilder()
    .setCustomId(`wh_pickurl_${purpose}_${userId}_${guildId}`)
    .setTitle(getLocalized('webhook.custom_url_modal_title', lang));

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('url').setLabel(getLocalized('webhook.custom_url_label', lang)).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(200),
    ),
  );

  return interaction.showModal(modal);
}

export function showMessageLinkModal(interaction: any, userId: string, guildId: string, purpose: 'edit' | 'delete', lang: Language): Promise<void> {
  const modal = new ModalBuilder()
    .setCustomId(`wh_msglink_${purpose}_${userId}_${guildId}`)
    .setTitle(getLocalized('webhook.msglink_modal_title', lang));

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('link').setLabel(getLocalized('webhook.msglink_label', lang)).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(200),
    ),
  );

  return interaction.showModal(modal);
}

// ────────────────────────────────────────────────────────────────────────────
// BUILDER MENU — main menu with buttons
// ────────────────────────────────────────────────────────────────────────────

export async function showBuilderMenu(
  interaction: ChatInputCommandInteraction | any,
  userId: string,
  guildId: string,
  lang: Language,
  isUpdate = false,
): Promise<void> {
  const p = `wh_${userId}_${guildId}`;

  const embed = new EmbedBuilder()
    .setColor('#5865f2')
    .setTitle(getLocalized('webhook.builder_title', lang))
    .setDescription(getLocalized('webhook.builder_desc', lang))
    .setFooter({ text: getLocalized('webhook.builder_footer', lang) });

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`${p}_content`).setLabel(getLocalized('webhook.btn_content', lang)).setEmoji('📝').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`${p}_basic`).setLabel(getLocalized('webhook.btn_basic', lang)).setEmoji('✏️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`${p}_author`).setLabel(getLocalized('webhook.btn_author', lang)).setEmoji('👤').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`${p}_images`).setLabel(getLocalized('webhook.btn_images', lang)).setEmoji('🖼️').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`${p}_footer`).setLabel(getLocalized('webhook.btn_footer', lang)).setEmoji('📄').setStyle(ButtonStyle.Primary),
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`${p}_field`).setLabel(getLocalized('webhook.btn_field', lang)).setEmoji('📋').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`${p}_sender`).setLabel(getLocalized('webhook.btn_sender', lang)).setEmoji('🤖').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`${p}_json_edit`).setLabel('JSON').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`${p}_preview`).setLabel(getLocalized('webhook.btn_preview', lang)).setEmoji('👁️').setStyle(ButtonStyle.Secondary),
  );
  const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`${p}_send_now`).setLabel(getLocalized('webhook.btn_send', lang)).setEmoji('🚀').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`${p}_cancel`).setLabel(getLocalized('webhook.btn_cancel', lang)).setEmoji('✖️').setStyle(ButtonStyle.Danger),
  );

  const payload = { embeds: [embed], components: [row1, row2, row3], ephemeral: true };

  if (isUpdate && interaction.update) {
    await interaction.update(payload);
  } else {
    await interaction.reply(payload);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// JSON MODAL
// ────────────────────────────────────────────────────────────────────────────

export async function showJsonModal(
  interaction: any,
  userId: string,
  guildId: string,
  lang: Language,
  mode: 'send' | 'edit',
): Promise<void> {
  const modal = new ModalBuilder()
    .setCustomId(`wh_json_${mode}_${userId}_${guildId}`)
    .setTitle(mode === 'edit' ? getLocalized('webhook.json_modal_edit', lang) : getLocalized('webhook.json_modal_send', lang));

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('json_payload')
        .setLabel(getLocalized('webhook.json_label', lang))
        .setPlaceholder('{ "content": "Hello!", "embeds": [{ "title": "..." }] }')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true),
    ),
  );

  await interaction.showModal(modal);
}
