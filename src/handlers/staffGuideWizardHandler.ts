/**
 * STAFF GUIDE WIZARD — button/modal driven management for /staff-guide manage.
 *
 * Reuses the existing staffGuide/service.ts CRUD + permission logic
 * (addPage/editPage/removePage/setEditorRoles/canEdit) — this file is only
 * the click-through UI layer on top of it.
 *
 * customId prefix: "sgwiz:" — buttons, selects, modals all handled here.
 */

import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  StringSelectMenuBuilder, RoleSelectMenuBuilder,
  ButtonInteraction, StringSelectMenuInteraction, RoleSelectMenuInteraction, ModalSubmitInteraction,
  GuildMember, MessageFlags,
} from 'discord.js';
import {
  listPages, countPages, addPage, editPage, removePage, getPage,
  getEditorRoles, setEditorRoles, canEdit,
} from '../modules/staffGuide/service';
import { success, error } from '../utils/embeds';

function homePayload(guildId: string) {
  const pages = listPages(guildId);
  const editors = getEditorRoles(guildId);
  const editorText = editors.length ? editors.map(r => `<@&${r}>`).join(', ') : '*(not configured — ManageGuild only)*';

  const embed = new EmbedBuilder()
    .setColor('#ff6b35')
    .setTitle('📋 Staff Guide — Manage')
    .setDescription(
      pages.length
        ? pages.map(p => `**${p.page_number}.** ${p.title} — <t:${p.updated_at}:R>`).join('\n')
        : '*No pages yet — click ➕ Add Page to write the first one.*',
    )
    .addFields({ name: 'Editor roles', value: editorText })
    .setFooter({ text: `${pages.length} page(s) · Members view with /staff-guide view` });

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`sgwiz:add:${guildId}`).setLabel('➕ Add Page').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`sgwiz:edit:${guildId}`).setLabel('✏️ Edit Page').setStyle(ButtonStyle.Primary).setDisabled(!pages.length),
    new ButtonBuilder().setCustomId(`sgwiz:remove:${guildId}`).setLabel('🗑️ Remove Page').setStyle(ButtonStyle.Danger).setDisabled(!pages.length),
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`sgwiz:roles:${guildId}`).setLabel('👥 Editor Roles').setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row1, row2] };
}

export async function buildStaffGuideManageHome(guildId: string) {
  return homePayload(guildId);
}

function pageSelectMenu(guildId: string, action: 'edit' | 'remove') {
  const pages = listPages(guildId).slice(0, 25); // Discord select menu limit
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`sgwiz:select${action}:${guildId}`)
    .setPlaceholder(action === 'edit' ? 'Choose a page to edit' : 'Choose a page to remove')
    .addOptions(pages.map(p => ({ label: `${p.page_number}. ${p.title}`.slice(0, 100), value: String(p.page_number) })));
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

function addPageModal(guildId: string) {
  return new ModalBuilder()
    .setCustomId(`sgwiz:modaladd:${guildId}`)
    .setTitle('Add Staff Guide Page')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId('title').setLabel('Page title').setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId('content').setLabel('Page content (markdown supported)').setStyle(TextInputStyle.Paragraph).setMaxLength(4000).setRequired(true),
      ),
    );
}

function editPageModal(guildId: string, pageNumber: number, currentTitle: string, currentContent: string) {
  const titleInput = new TextInputBuilder().setCustomId('title').setLabel('Title').setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(true).setValue(currentTitle);
  const contentInput = new TextInputBuilder().setCustomId('content').setLabel('Content (markdown supported)').setStyle(TextInputStyle.Paragraph).setMaxLength(4000).setRequired(true).setValue(currentContent.slice(0, 4000));
  return new ModalBuilder()
    .setCustomId(`sgwiz:modaledit:${guildId}:${pageNumber}`)
    .setTitle(`Edit Page ${pageNumber}`)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(contentInput),
    );
}

function checkEditAccess(member: GuildMember, guildId: string): string | null {
  if (canEdit(member, guildId)) return null;
  const roles = getEditorRoles(guildId);
  const roleText = roles.length ? roles.map(r => `<@&${r}>`).join(', ') : 'none configured';
  return `Editing the staff guide requires ManageGuild or one of the configured editor roles: ${roleText}.`;
}

export async function handleStaffGuideWizardButton(btn: ButtonInteraction): Promise<void> {
  const [, action, guildId] = btn.customId.split(':');
  if (!guildId || btn.guildId !== guildId) return;
  const member = btn.member as GuildMember;

  const denyReason = checkEditAccess(member, guildId);
  if (denyReason) {
    await btn.reply({ embeds: [error('No permission', denyReason)], flags: MessageFlags.Ephemeral });
    return;
  }

  if (action === 'home') return void btn.update(await buildStaffGuideManageHome(guildId));

  if (action === 'add') {
    await btn.showModal(addPageModal(guildId));
    return;
  }

  if (action === 'edit') {
    if (!countPages(guildId)) { await btn.reply({ content: '❌ No pages yet.', flags: MessageFlags.Ephemeral }); return; }
    await btn.reply({ components: [pageSelectMenu(guildId, 'edit')], flags: MessageFlags.Ephemeral });
    return;
  }

  if (action === 'remove') {
    if (!countPages(guildId)) { await btn.reply({ content: '❌ No pages yet.', flags: MessageFlags.Ephemeral }); return; }
    await btn.reply({ components: [pageSelectMenu(guildId, 'remove')], flags: MessageFlags.Ephemeral });
    return;
  }

  if (action === 'roles') {
    const roleSelect = new RoleSelectMenuBuilder()
      .setCustomId(`sgwiz:selectroles:${guildId}`)
      .setPlaceholder('Choose up to 5 editor roles')
      .setMinValues(0)
      .setMaxValues(5);
    await btn.reply({
      content: 'Select the roles allowed to edit the staff guide (ManageGuild can always edit):',
      components: [new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(roleSelect)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
}

export async function handleStaffGuideWizardSelect(sel: StringSelectMenuInteraction): Promise<void> {
  const [, action, guildId] = sel.customId.split(':');
  if (!guildId || sel.guildId !== guildId) return;
  const member = sel.member as GuildMember;

  const denyReason = checkEditAccess(member, guildId);
  if (denyReason) { await sel.reply({ embeds: [error('No permission', denyReason)], flags: MessageFlags.Ephemeral }); return; }

  const pageNumber = parseInt(sel.values[0], 10);

  if (action === 'selectedit') {
    const page = getPage(guildId, pageNumber);
    if (!page) { await sel.reply({ content: '❌ Page not found.', flags: MessageFlags.Ephemeral }); return; }
    await sel.showModal(editPageModal(guildId, pageNumber, page.title, page.content));
    return;
  }

  if (action === 'selectremove') {
    const page = getPage(guildId, pageNumber);
    if (!page) { await sel.update({ content: '❌ Page not found.', components: [] }); return; }
    removePage(guildId, pageNumber);
    await sel.update({
      content: `✅ **${page.title}** (was page ${pageNumber}) removed. ${countPages(guildId)} page(s) remaining.`,
      components: [],
    });
    return;
  }
}

export async function handleStaffGuideWizardRoleSelect(sel: RoleSelectMenuInteraction): Promise<void> {
  const [, , guildId] = sel.customId.split(':');
  if (!guildId || sel.guildId !== guildId) return;
  const member = sel.member as GuildMember;

  const denyReason = checkEditAccess(member, guildId);
  if (denyReason) { await sel.reply({ embeds: [error('No permission', denyReason)], flags: MessageFlags.Ephemeral }); return; }

  setEditorRoles(guildId, sel.values);
  const mentions = sel.values.length ? sel.values.map(r => `<@&${r}>`).join(', ') : '*(none — ManageGuild only)*';
  await sel.update({ content: `✅ Editor roles updated: ${mentions}`, components: [] });
}

export async function handleStaffGuideWizardModal(modal: ModalSubmitInteraction): Promise<void> {
  const parts = modal.customId.split(':'); // sgwiz:modaladd:<guildId> | sgwiz:modaledit:<guildId>:<page>
  const action = parts[1];
  const guildId = parts[2];
  if (!guildId || modal.guildId !== guildId) return;
  const member = modal.member as GuildMember;

  const denyReason = checkEditAccess(member, guildId);
  if (denyReason) { await modal.reply({ embeds: [error('No permission', denyReason)], flags: MessageFlags.Ephemeral }); return; }

  const title = modal.fields.getTextInputValue('title');
  const content = modal.fields.getTextInputValue('content');

  if (action === 'modaladd') {
    const pageNum = addPage(guildId, title, content, modal.user.id);
    await modal.reply({ embeds: [success('Page added', `**${title}** added as page **${pageNum}**.`)], flags: MessageFlags.Ephemeral });
    return;
  }

  if (action === 'modaledit') {
    const pageNumber = parseInt(parts[3], 10);
    const ok = editPage(guildId, pageNumber, title, content);
    await modal.reply({
      embeds: [ok
        ? success('Page updated', `Page **${pageNumber}** has been updated.`)
        : error('Page not found', `No page ${pageNumber}.`)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
}

export function isStaffGuideWizardButton(customId: string): boolean {
  return customId.startsWith('sgwiz:') && !customId.startsWith('sgwiz:select') && !customId.includes('modal');
}
export function isStaffGuideWizardSelect(customId: string): boolean {
  return customId.startsWith('sgwiz:selectedit:') || customId.startsWith('sgwiz:selectremove:');
}
export function isStaffGuideWizardRoleSelect(customId: string): boolean {
  return customId.startsWith('sgwiz:selectroles:');
}
export function isStaffGuideWizardModal(customId: string): boolean {
  return customId.startsWith('sgwiz:modaladd:') || customId.startsWith('sgwiz:modaledit:');
}
