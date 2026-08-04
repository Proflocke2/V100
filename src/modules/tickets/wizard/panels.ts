/**
 * modules/tickets/wizard/panels.ts
 *
 * Panel + Category + Form-question management — all nested under "🎫 Panels"
 * in the main menu, since categories and form questions only ever make
 * sense in the context of a specific panel. All user-facing text is
 * localized via tw()/twg() (twizard namespace, en/de/fr/ru).
 */

import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ChannelSelectMenuBuilder, ChannelType,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder, MessageFlags, TextChannel, TextInputStyle,
} from 'discord.js';
import * as Repo from '../repository';
import { buildPanelEmbed, buildPanelComponents } from '../builder';
import { refreshPanelMessage } from '../service';
import { success, error, info } from '../../../utils/embeds';
import { buildCustomId, getSession, touchSession } from './session';
import { navRow, promptModal, renderTo, WizardComponentInteraction, WizardView } from './helpers';
import { tw, twg } from './i18n';

const VALID_HEX = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
const MAX_CATEGORIES = 25;

// ── Panel list ─────────────────────────────────────────────────────────────────

export function renderPanelList(sessionId: string, guildId: string): WizardView {
  const panels = Repo.listPanels(guildId);

  const embed = new EmbedBuilder()
    .setTitle(twg(guildId, 'panels.list_title'))
    .setColor('#5865f2')
    .setDescription(panels.length === 0 ? twg(guildId, 'panels.none_yet') : twg(guildId, 'panels.list_desc'));

  const components: ActionRowBuilder<any>[] = [];

  if (panels.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(buildCustomId(sessionId, 'panel', 'pick'))
      .setPlaceholder(twg(guildId, 'panels.pick_placeholder'))
      .addOptions(panels.slice(0, 25).map(p => ({
        label: p.title.slice(0, 100),
        value: String(p.id),
        description: `[${p.id}] ${p.mode} • ${Repo.listCategories(p.id).length} ${twg(guildId, 'panels.opt_categories')} • ${p.message_id ? twg(guildId, 'panels.opt_sent') : twg(guildId, 'panels.opt_not_sent')}`.slice(0, 100),
      })));
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
  }

  components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buildCustomId(sessionId, 'panel', 'create')).setLabel(twg(guildId, 'panels.create_btn')).setStyle(ButtonStyle.Success),
  ));
  components.push(navRow(sessionId, 'menu'));

  return { embeds: [embed], components };
}

// ── Panel detail ───────────────────────────────────────────────────────────────

export function renderPanelDetail(sessionId: string, panelId: number): WizardView {
  const gid = getSession(sessionId)?.guildId ?? '0';
  const panel = Repo.getPanel(panelId);
  if (!panel) return { embeds: [error(twg(gid, 'common.not_found_title'), twg(gid, 'panels.not_found'))], components: [navRow(sessionId, 'panel:list')] };

  const cats = Repo.listCategories(panelId);
  const formCount = Repo.listFormQuestions(panelId).length;

  const embed = new EmbedBuilder()
    .setTitle(twg(gid, 'panels.detail_title', { title: panel.title }))
    .setColor((panel.color as any) || '#5865f2')
    .addFields(
      { name: twg(gid, 'panels.f_id'),   value: `\`${panel.id}\``, inline: true },
      { name: twg(gid, 'panels.f_mode'), value: panel.mode,         inline: true },
      { name: twg(gid, 'panels.f_sent'), value: panel.message_id ? `<#${panel.channel_id}>` : twg(gid, 'common.not_yet'), inline: true },
      { name: twg(gid, 'panels.f_desc'), value: panel.description || twg(gid, 'common.none') },
      { name: twg(gid, 'panels.f_categories', { count: cats.length, max: MAX_CATEGORIES }), value: cats.length > 0
        ? cats.map(c => `${c.emoji ?? '🎫'} **${c.label}** \`[${c.id}]\` → <#${c.category_id}>${c.support_role_id ? ` • <@&${c.support_role_id}>` : ''}`).join('\n')
        : twg(gid, 'panels.cats_none') },
      { name: twg(gid, 'panels.f_form'), value: String(formCount), inline: true },
    );

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buildCustomId(sessionId, 'panel', 'edittext', panelId)).setLabel(twg(gid, 'panels.btn_text')).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(buildCustomId(sessionId, 'panel', 'editstyle', panelId)).setLabel(twg(gid, 'panels.btn_style')).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(buildCustomId(sessionId, 'panel', 'send', panelId)).setLabel(twg(gid, 'panels.btn_send')).setStyle(ButtonStyle.Success).setDisabled(cats.length === 0),
    new ButtonBuilder().setCustomId(buildCustomId(sessionId, 'panel', 'delete', panelId)).setLabel(twg(gid, 'panels.btn_delete')).setStyle(ButtonStyle.Danger),
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buildCustomId(sessionId, 'cat', 'add', panelId)).setLabel(twg(gid, 'panels.btn_add_cat')).setStyle(ButtonStyle.Secondary).setDisabled(cats.length >= MAX_CATEGORIES),
    new ButtonBuilder().setCustomId(buildCustomId(sessionId, 'cat', 'list', panelId)).setLabel(twg(gid, 'panels.btn_cats', { count: cats.length })).setStyle(ButtonStyle.Secondary).setDisabled(cats.length === 0),
    new ButtonBuilder().setCustomId(buildCustomId(sessionId, 'form', 'panel', panelId)).setLabel(twg(gid, 'panels.btn_form', { count: formCount })).setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row1, row2, navRow(sessionId, 'panel:list')] };
}

// ── Category list / detail ──────────────────────────────────────────────────────

export function renderCategoryList(sessionId: string, panelId: number): WizardView {
  const gid = getSession(sessionId)?.guildId ?? '0';
  const panel = Repo.getPanel(panelId);
  const cats = panel ? Repo.listCategories(panelId) : [];

  const embed = new EmbedBuilder()
    .setTitle(twg(gid, 'cats.list_title', { title: panel?.title ?? '?' }))
    .setColor('#5865f2')
    .setDescription(cats.length === 0 ? twg(gid, 'cats.none') : twg(gid, 'cats.list_desc'));

  const components: ActionRowBuilder<any>[] = [];
  if (cats.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(buildCustomId(sessionId, 'cat', 'pick', panelId))
      .setPlaceholder(twg(gid, 'cats.pick_placeholder'))
      .addOptions(cats.slice(0, 25).map(c => ({
        label: `${c.label}`.slice(0, 100),
        value: String(c.id),
        description: `[${c.id}] → #${c.category_id}`.slice(0, 100),
        emoji: c.emoji ?? undefined,
      })));
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
  }
  components.push(navRow(sessionId, `panel:detail:${panelId}`));

  return { embeds: [embed], components };
}

export function renderCategoryDetail(sessionId: string, catId: number): WizardView {
  const gid = getSession(sessionId)?.guildId ?? '0';
  const cat = Repo.getCategory(catId);
  if (!cat) return { embeds: [error(twg(gid, 'common.not_found_title'), twg(gid, 'cats.not_found'))], components: [navRow(sessionId, 'menu')] };

  const embed = new EmbedBuilder()
    .setTitle(twg(gid, 'cats.detail_title', { label: cat.label }))
    .setColor('#5865f2')
    .addFields(
      { name: twg(gid, 'cats.f_id'),          value: `\`${cat.id}\``, inline: true },
      { name: twg(gid, 'cats.f_button'),      value: cat.button_text || twg(gid, 'cats.f_button_default'), inline: true },
      { name: twg(gid, 'cats.f_color'),       value: cat.color, inline: true },
      { name: twg(gid, 'cats.f_discord_cat'), value: `<#${cat.category_id}>`, inline: true },
      { name: twg(gid, 'cats.f_role'),        value: cat.support_role_id ? `<@&${cat.support_role_id}>` : twg(gid, 'cats.f_role_none'), inline: true },
      { name: twg(gid, 'cats.f_welcome'),     value: cat.welcome_message || twg(gid, 'common.none') },
    );

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buildCustomId(sessionId, 'cat', 'edittext', catId)).setLabel(twg(gid, 'cats.btn_text')).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(buildCustomId(sessionId, 'cat', 'editcolor', catId)).setLabel(twg(gid, 'cats.btn_color')).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(buildCustomId(sessionId, 'cat', 'editwelcome', catId)).setLabel(twg(gid, 'cats.btn_welcome')).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(buildCustomId(sessionId, 'cat', 'remove', catId)).setLabel(twg(gid, 'cats.btn_remove')).setStyle(ButtonStyle.Danger),
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buildCustomId(sessionId, 'cat', 'editchannel', catId)).setLabel(twg(gid, 'cats.btn_channel')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(buildCustomId(sessionId, 'cat', 'editrole', catId)).setLabel(twg(gid, 'cats.btn_role')).setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row1, row2, navRow(sessionId, `cat:list:${cat.panel_id}`)] };
}

// ── Add-category flow (label modal → channel select → role select) ─────────────

function renderAddCategoryChannelStep(sessionId: string, panelId: number): WizardView {
  const embed = new EmbedBuilder().setTitle(tw(sessionId, 'cats.add2_title')).setColor('#5865f2')
    .setDescription(tw(sessionId, 'cats.add2_desc'));
  const select = new ChannelSelectMenuBuilder().setCustomId(buildCustomId(sessionId, 'cat', 'addchannel', panelId)).setPlaceholder(tw(sessionId, 'cats.add2_pick')).addChannelTypes(ChannelType.GuildCategory);
  return { embeds: [embed], components: [new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(select), navRow(sessionId, `panel:detail:${panelId}`)] };
}

function renderAddCategoryRoleStep(sessionId: string, panelId: number): WizardView {
  const embed = new EmbedBuilder().setTitle(tw(sessionId, 'cats.add3_title')).setColor('#5865f2')
    .setDescription(tw(sessionId, 'cats.add3_desc'));
  const select = new RoleSelectMenuBuilder().setCustomId(buildCustomId(sessionId, 'cat', 'addrole', panelId)).setPlaceholder(tw(sessionId, 'cats.add3_pick'));
  const skip = new ButtonBuilder().setCustomId(buildCustomId(sessionId, 'cat', 'addrole', panelId, 'skip')).setLabel(tw(sessionId, 'common.skip')).setStyle(ButtonStyle.Secondary);
  return { embeds: [embed], components: [new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(select), new ActionRowBuilder<ButtonBuilder>().addComponents(skip), navRow(sessionId, `panel:detail:${panelId}`)] };
}

// ── Dispatcher ───────────────────────────────────────────────────────────────

export async function handlePanelSection(interaction: WizardComponentInteraction, sessionId: string, action: string, args: string[]): Promise<void> {
  const session = getSession(sessionId)!;
  const gid = session.guildId;

  if (action === 'pick' && interaction.isStringSelectMenu()) {
    const id = Number(interaction.values[0]);
    return renderTo(interaction, renderPanelDetail(sessionId, id));
  }

  if (action === 'create' && interaction.isButton()) {
    const result = await promptModal(interaction, buildCustomId(sessionId, 'panel', 'createmodal'), tw(sessionId, 'panels.create_modal'), [
      { id: 'title', label: tw(sessionId, 'panels.m_title'), required: true, maxLength: 256, value: 'Support' },
      { id: 'description', label: tw(sessionId, 'panels.m_desc'), style: TextInputStyle.Paragraph, maxLength: 1000 },
      { id: 'color', label: tw(sessionId, 'panels.m_color'), maxLength: 7, value: '#5865f2' },
    ]);
    if (!result) return;
    const { values, submit } = result;
    if (values.color && !VALID_HEX.test(values.color)) {
      await submit.reply({ embeds: [error(twg(gid, 'common.invalid_color_title'), twg(gid, 'common.invalid_color_desc'))], flags: MessageFlags.Ephemeral });
      return;
    }
    const panel = Repo.createPanel({
      guild_id: gid, title: values.title || 'Support', description: values.description.trim() || null,
      color: values.color || '#5865f2', mode: 'auto' as Repo.Panel['mode'],
    });
    touchSession(sessionId);
    return renderTo(submit, renderPanelDetail(sessionId, panel.id));
  }

  const panelIdArg = args[0] ? Number(args[0]) : undefined;

  if (action === 'edittext' && interaction.isButton() && panelIdArg) {
    const panel = Repo.getPanel(panelIdArg);
    if (!panel) return;
    const result = await promptModal(interaction, buildCustomId(sessionId, 'panel', 'edittextmodal', panelIdArg), tw(sessionId, 'panels.edittext_modal'), [
      { id: 'title', label: tw(sessionId, 'panels.m_title'), required: true, maxLength: 256, value: panel.title },
      { id: 'description', label: tw(sessionId, 'panels.f_desc'), style: TextInputStyle.Paragraph, maxLength: 1000, value: panel.description ?? '' },
      { id: 'content', label: tw(sessionId, 'panels.m_content'), style: TextInputStyle.Paragraph, maxLength: 1000, value: panel.content ?? '' },
    ]);
    if (!result) return;
    const { values, submit } = result;
    Repo.updatePanel(panelIdArg, { title: values.title, description: values.description.trim() || null, content: values.content.trim() || null });
    const updated = Repo.getPanel(panelIdArg)!;
    if (updated.message_id && updated.channel_id) await refreshPanelMessage(interaction.guild!, updated).catch(() => {});
    return renderTo(submit, renderPanelDetail(sessionId, panelIdArg));
  }

  if (action === 'editstyle' && interaction.isButton() && panelIdArg) {
    const panel = Repo.getPanel(panelIdArg);
    if (!panel) return;
    const result = await promptModal(interaction, buildCustomId(sessionId, 'panel', 'editstylemodal', panelIdArg), tw(sessionId, 'panels.editstyle_modal'), [
      { id: 'color', label: tw(sessionId, 'panels.m_color_hex'), required: true, maxLength: 7, value: panel.color },
      { id: 'mode', label: tw(sessionId, 'panels.m_mode'), required: true, maxLength: 10, value: panel.mode },
      { id: 'footer', label: tw(sessionId, 'panels.m_footer'), maxLength: 256, value: panel.footer ?? '' },
    ]);
    if (!result) return;
    const { values, submit } = result;
    if (!VALID_HEX.test(values.color)) {
      await submit.reply({ embeds: [error(twg(gid, 'common.invalid_color_title'), twg(gid, 'common.invalid_color_desc'))], flags: MessageFlags.Ephemeral });
      return;
    }
    if (!['auto', 'button', 'dropdown'].includes(values.mode)) {
      await submit.reply({ embeds: [error(twg(gid, 'common.invalid_mode_title'), twg(gid, 'common.invalid_mode_desc'))], flags: MessageFlags.Ephemeral });
      return;
    }
    Repo.updatePanel(panelIdArg, { color: values.color, mode: values.mode as Repo.Panel['mode'], footer: values.footer.trim() || null });
    const updated = Repo.getPanel(panelIdArg)!;
    if (updated.message_id && updated.channel_id) await refreshPanelMessage(interaction.guild!, updated).catch(() => {});
    return renderTo(submit, renderPanelDetail(sessionId, panelIdArg));
  }

  if (action === 'send' && interaction.isButton() && panelIdArg) {
    const embed = new EmbedBuilder().setTitle(tw(sessionId, 'panels.send_title')).setColor('#5865f2').setDescription(tw(sessionId, 'panels.send_desc'));
    const select = new ChannelSelectMenuBuilder().setCustomId(buildCustomId(sessionId, 'panel', 'sendto', panelIdArg)).setPlaceholder(tw(sessionId, 'panels.send_pick')).addChannelTypes(ChannelType.GuildText);
    return renderTo(interaction, { embeds: [embed], components: [new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(select), navRow(sessionId, `panel:detail:${panelIdArg}`)] });
  }
  if (action === 'sendto' && interaction.isChannelSelectMenu() && panelIdArg) {
    const panel = Repo.getPanel(panelIdArg);
    if (!panel) return;
    const cats = Repo.listCategories(panel.id);
    if (cats.length === 0) {
      return renderTo(interaction, { embeds: [error(twg(gid, 'panels.send_no_cats_title'), twg(gid, 'panels.send_no_cats_desc'))], components: [navRow(sessionId, `panel:detail:${panelIdArg}`)] });
    }
    try {
      const channel = await interaction.guild!.channels.fetch(interaction.values[0]) as TextChannel;
      const msg = await channel.send({ content: panel.content ?? undefined, embeds: [buildPanelEmbed(panel)], components: buildPanelComponents(panel, cats) as any });
      Repo.updatePanelMessage(panel.id, channel.id, msg.id);
      return renderTo(interaction, { embeds: [success(twg(gid, 'panels.sent_title'), twg(gid, 'panels.sent_desc', { channel: `<#${channel.id}>` }))], components: [navRow(sessionId, `panel:detail:${panelIdArg}`)] });
    } catch (err) {
      console.error('[TicketWizard] send panel failed:', err);
      return renderTo(interaction, { embeds: [error(twg(gid, 'panels.send_fail_title'), twg(gid, 'panels.send_fail_desc'))], components: [navRow(sessionId, `panel:detail:${panelIdArg}`)] });
    }
  }

  if (action === 'delete' && interaction.isButton() && panelIdArg) {
    Repo.deletePanel(panelIdArg);
    return renderTo(interaction, { embeds: [success(twg(gid, 'panels.deleted_title'), twg(gid, 'panels.deleted_desc'))], components: [navRow(sessionId, 'panel:list')] });
  }
}

export async function handleCategorySection(interaction: WizardComponentInteraction, sessionId: string, action: string, args: string[]): Promise<void> {
  const session = getSession(sessionId)!;
  const gid = session.guildId;
  const panelIdArg = args[0] ? Number(args[0]) : undefined;

  if (action === 'list' && panelIdArg !== undefined) return renderTo(interaction, renderCategoryList(sessionId, panelIdArg));

  if (action === 'pick' && interaction.isStringSelectMenu()) {
    const catId = Number(interaction.values[0]);
    return renderTo(interaction, renderCategoryDetail(sessionId, catId));
  }

  if (action === 'add' && interaction.isButton() && panelIdArg !== undefined) {
    const result = await promptModal(interaction, buildCustomId(sessionId, 'cat', 'addmodal', panelIdArg), tw(sessionId, 'cats.add1_modal'), [
      { id: 'label', label: tw(sessionId, 'cats.m_name'), required: true, maxLength: 100, value: 'Support' },
      { id: 'button_text', label: tw(sessionId, 'cats.m_button'), maxLength: 80 },
      { id: 'emoji', label: tw(sessionId, 'cats.m_emoji'), maxLength: 20 },
    ]);
    if (!result) return;
    const { values, submit } = result;
    const s = getSession(sessionId)!;
    s.data.pendingCategory = { panelId: panelIdArg, label: values.label || 'Support', buttonText: values.button_text.trim() || null, emoji: values.emoji.trim() || null };
    touchSession(sessionId);
    return renderTo(submit, renderAddCategoryChannelStep(sessionId, panelIdArg));
  }

  if (action === 'addchannel' && interaction.isChannelSelectMenu() && panelIdArg !== undefined) {
    const s = getSession(sessionId)!;
    const pending = s.data.pendingCategory as any;
    if (!pending) return;
    pending.categoryId = interaction.values[0];
    touchSession(sessionId);
    return renderTo(interaction, renderAddCategoryRoleStep(sessionId, panelIdArg));
  }

  if (action === 'addrole' && panelIdArg !== undefined) {
    const s = getSession(sessionId)!;
    const pending = s.data.pendingCategory as any;
    if (!pending) return;
    const roleId = args[1] === 'skip' ? null : (interaction.isRoleSelectMenu() ? interaction.values[0] : null);

    const existing = Repo.listCategories(panelIdArg);
    if (existing.length >= MAX_CATEGORIES) {
      delete s.data.pendingCategory;
      return renderTo(interaction, { embeds: [error(twg(gid, 'cats.limit_title'), twg(gid, 'cats.limit_desc', { max: MAX_CATEGORIES }))], components: [navRow(sessionId, `panel:detail:${panelIdArg}`)] });
    }

    const cat = Repo.addCategory({
      panel_id: panelIdArg, guild_id: session.guildId, label: pending.label,
      button_text: pending.buttonText, emoji: pending.emoji, color: 'primary' as Repo.Category['color'],
      category_id: pending.categoryId, support_role_id: roleId, welcome_message: null,
    });
    delete s.data.pendingCategory;

    const panel = Repo.getPanel(panelIdArg);
    if (panel) await refreshPanelMessage(interaction.guild!, panel).catch(() => {});

    return renderTo(interaction, renderCategoryDetail(sessionId, cat.id));
  }

  const catIdArg = action !== 'list' && action !== 'add' && action !== 'addchannel' && action !== 'addrole' ? (args[0] ? Number(args[0]) : undefined) : undefined;

  if (action === 'edittext' && interaction.isButton() && catIdArg) {
    const cat = Repo.getCategory(catIdArg);
    if (!cat) return;
    const result = await promptModal(interaction, buildCustomId(sessionId, 'cat', 'edittextmodal', catIdArg), tw(sessionId, 'cats.edittext_modal'), [
      { id: 'label', label: tw(sessionId, 'cats.m_name'), required: true, maxLength: 100, value: cat.label },
      { id: 'button_text', label: tw(sessionId, 'cats.m_button'), maxLength: 80, value: cat.button_text ?? '' },
      { id: 'emoji', label: tw(sessionId, 'cats.m_emoji'), maxLength: 20, value: cat.emoji ?? '' },
    ]);
    if (!result) return;
    const { values, submit } = result;
    Repo.updateCategory(catIdArg, { label: values.label, button_text: values.button_text.trim() || null, emoji: values.emoji.trim() || null });
    const panel = Repo.getPanel(cat.panel_id);
    if (panel) await refreshPanelMessage(interaction.guild!, panel).catch(() => {});
    return renderTo(submit, renderCategoryDetail(sessionId, catIdArg));
  }

  if (action === 'editcolor' && interaction.isButton() && catIdArg) {
    const cat = Repo.getCategory(catIdArg);
    if (!cat) return;
    const result = await promptModal(interaction, buildCustomId(sessionId, 'cat', 'editcolormodal', catIdArg), tw(sessionId, 'cats.editcolor_modal'), [
      { id: 'color', label: tw(sessionId, 'cats.m_color'), required: true, maxLength: 10, value: cat.color },
    ]);
    if (!result) return;
    const { values, submit } = result;
    if (!['primary', 'secondary', 'success', 'danger'].includes(values.color)) {
      await submit.reply({ embeds: [error(twg(gid, 'cats.invalid_color_title'), twg(gid, 'cats.invalid_color_desc'))], flags: MessageFlags.Ephemeral });
      return;
    }
    Repo.updateCategory(catIdArg, { color: values.color as Repo.Category['color'] });
    const panel = Repo.getPanel(cat.panel_id);
    if (panel) await refreshPanelMessage(interaction.guild!, panel).catch(() => {});
    return renderTo(submit, renderCategoryDetail(sessionId, catIdArg));
  }

  if (action === 'editwelcome' && interaction.isButton() && catIdArg) {
    const cat = Repo.getCategory(catIdArg);
    if (!cat) return;
    const result = await promptModal(interaction, buildCustomId(sessionId, 'cat', 'editwelcomemodal', catIdArg), tw(sessionId, 'cats.editwelcome_modal'), [
      { id: 'welcome', label: tw(sessionId, 'cats.m_welcome'), style: TextInputStyle.Paragraph, maxLength: 1500, value: cat.welcome_message ?? '' },
    ]);
    if (!result) return;
    const { values, submit } = result;
    Repo.updateCategory(catIdArg, { welcome_message: values.welcome.trim() || null });
    return renderTo(submit, renderCategoryDetail(sessionId, catIdArg));
  }

  if (action === 'editchannel' && interaction.isButton() && catIdArg) {
    const embed = new EmbedBuilder().setTitle(tw(sessionId, 'cats.editchannel_title')).setColor('#5865f2').setDescription(tw(sessionId, 'cats.editchannel_desc'));
    const select = new ChannelSelectMenuBuilder().setCustomId(buildCustomId(sessionId, 'cat', 'setchannel', catIdArg)).setPlaceholder(tw(sessionId, 'cats.editchannel_pick')).addChannelTypes(ChannelType.GuildCategory);
    return renderTo(interaction, { embeds: [embed], components: [new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(select), navRow(sessionId, `cat:detail:${catIdArg}`)] });
  }
  if (action === 'setchannel' && interaction.isChannelSelectMenu() && catIdArg) {
    Repo.updateCategory(catIdArg, { category_id: interaction.values[0] });
    return renderTo(interaction, renderCategoryDetail(sessionId, catIdArg));
  }

  if (action === 'editrole' && interaction.isButton() && catIdArg) {
    const embed = new EmbedBuilder().setTitle(tw(sessionId, 'cats.editrole_title')).setColor('#5865f2').setDescription(tw(sessionId, 'cats.editrole_desc'));
    const select = new RoleSelectMenuBuilder().setCustomId(buildCustomId(sessionId, 'cat', 'setrole', catIdArg)).setPlaceholder(tw(sessionId, 'cats.editrole_pick'));
    const clear = new ButtonBuilder().setCustomId(buildCustomId(sessionId, 'cat', 'setrole', catIdArg, 'clear')).setLabel(tw(sessionId, 'common.clear_role')).setStyle(ButtonStyle.Secondary);
    return renderTo(interaction, { embeds: [embed], components: [new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(select), new ActionRowBuilder<ButtonBuilder>().addComponents(clear), navRow(sessionId, `cat:detail:${catIdArg}`)] });
  }
  if (action === 'setrole' && catIdArg) {
    const roleId = args[1] === 'clear' ? null : (interaction.isRoleSelectMenu() ? interaction.values[0] : undefined);
    if (roleId === undefined) return;
    Repo.updateCategory(catIdArg, { support_role_id: roleId });
    return renderTo(interaction, renderCategoryDetail(sessionId, catIdArg));
  }

  if (action === 'remove' && interaction.isButton() && catIdArg) {
    const cat = Repo.getCategory(catIdArg);
    if (!cat) return;
    Repo.deleteCategory(catIdArg);
    const panel = Repo.getPanel(cat.panel_id);
    if (panel) await refreshPanelMessage(interaction.guild!, panel).catch(() => {});
    return renderTo(interaction, { embeds: [success(twg(gid, 'cats.removed_title'), twg(gid, 'cats.removed_desc', { label: cat.label }))], components: [navRow(sessionId, `panel:detail:${cat.panel_id}`)] });
  }
}

// ── Form questions ─────────────────────────────────────────────────────────────

export function renderFormList(sessionId: string, panelId: number): WizardView {
  const gid = getSession(sessionId)?.guildId ?? '0';
  const panel = Repo.getPanel(panelId);
  const questions = Repo.listFormQuestions(panelId);

  const embed = new EmbedBuilder()
    .setTitle(twg(gid, 'forms.list_title', { title: panel?.title ?? '?' }))
    .setColor('#5865f2')
    .setDescription(twg(gid, 'forms.list_desc'))
    .addFields(questions.length > 0
      ? questions.map((q, i) => ({ name: `${i + 1}. ${q.label}`, value: `${q.style} • ${q.required ? twg(gid, 'forms.q_required') : twg(gid, 'forms.q_optional')}` }))
      : [{ name: twg(gid, 'forms.none_title'), value: twg(gid, 'forms.none_desc') }]);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buildCustomId(sessionId, 'form', 'add', panelId)).setLabel(twg(gid, 'forms.btn_add')).setStyle(ButtonStyle.Success).setDisabled(questions.length >= 5),
    new ButtonBuilder().setCustomId(buildCustomId(sessionId, 'form', 'clear', panelId)).setLabel(twg(gid, 'forms.btn_clear')).setStyle(ButtonStyle.Danger).setDisabled(questions.length === 0),
  );

  return { embeds: [embed], components: [row, navRow(sessionId, `panel:detail:${panelId}`)] };
}

export async function handleFormSection(interaction: WizardComponentInteraction, sessionId: string, action: string, args: string[]): Promise<void> {
  const panelId = args[0] ? Number(args[0]) : undefined;
  if (panelId === undefined) return;

  if (action === 'panel') return renderTo(interaction, renderFormList(sessionId, panelId));

  if (action === 'add' && interaction.isButton()) {
    const existing = Repo.listFormQuestions(panelId);
    if (existing.length >= 5) return;
    const result = await promptModal(interaction, buildCustomId(sessionId, 'form', 'addmodal', panelId), tw(sessionId, 'forms.add_modal'), [
      { id: 'label', label: tw(sessionId, 'forms.m_question'), required: true, maxLength: 45 },
      { id: 'placeholder', label: tw(sessionId, 'forms.m_placeholder'), maxLength: 100 },
    ]);
    if (!result) return;
    const { values, submit } = result;
    Repo.addFormQuestion({
      panel_id: panelId, label: values.label, placeholder: values.placeholder.trim() || null,
      style: 'short' as Repo.FormQuestion['style'], required: true, min_length: 0, max_length: 1000,
    });
    return renderTo(submit, renderFormList(sessionId, panelId));
  }

  if (action === 'clear' && interaction.isButton()) {
    Repo.clearFormQuestions(panelId);
    return renderTo(interaction, renderFormList(sessionId, panelId));
  }
}
