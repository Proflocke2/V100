/**
 * TICKET SETUP WIZARD HANDLER
 * customId prefix: "tswiz:" — buttons, selects, modals all handled here.
 * Format: tswiz:<section>:<action>:<guildId>
 */

import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ButtonInteraction, ModalSubmitInteraction, StringSelectMenuBuilder,
  StringSelectMenuInteraction,
} from 'discord.js';
import { getSettings, updateSettings } from '../modules/tickets/repository';

// ── Helpers ───────────────────────────────────────────────────────────────────

const ON = '🟢 On'; const OFF = '🔴 Off';
const flag = (v: number | boolean | undefined | null) => v ? ON : OFF;

function btn(label: string, id: string, style = ButtonStyle.Primary, disabled = false): ButtonBuilder {
  return new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);
}
function row(...btns: ButtonBuilder[]): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(...btns);
}

// ── Home ──────────────────────────────────────────────────────────────────────

export async function buildTicketSetupHome(guildId: string) {
  const s = getSettings(guildId);
  const embed = new EmbedBuilder()
    .setTitle('🎫 Ticket System Setup')
    .setColor('#5865f2')
    .setDescription('Click a section to configure. Everything saves immediately.')
    .addFields(
      { name: '📋 Channels',    value: `Log: ${s.log_channel_id ? `<#${s.log_channel_id}>` : '—'} · Archive: ${s.archive_channel_id ? `<#${s.archive_channel_id}>` : '—'} · Format: ${s.transcript_format ?? 'html'}`, inline: false },
      { name: '🔢 Limits',      value: `Max open: **${s.max_open}** · Cooldown: **${s.cooldown_seconds}s** · Pattern: \`${s.name_pattern}\``, inline: false },
      { name: '⏱️ Auto-Close', value: `${flag(s.autoclose_enabled)} · After **${s.autoclose_hours}h** of inactivity`, inline: false },
      { name: '👥 Staff Roles', value: `Admin: ${s.admin_role_id ? `<@&${s.admin_role_id}>` : '—'} · Fallback: ${s.fallback_staff_role_id ? `<@&${s.fallback_staff_role_id}>` : '—'}`, inline: false },
      { name: '✨ Features',    value: `DM on close: ${flag(s.dm_on_close)} · Survey: ${flag(s.survey_enabled)} · Support hours: ${flag(s.support_hours_enabled)}`, inline: false },
    )
    .setFooter({ text: 'For panels & categories: use /ticket setup (full wizard)' });

  const components = [
    row(
      btn('📋 Channels',    `tswiz:channels:open:${guildId}`),
      btn('🔢 Limits',      `tswiz:limits:open:${guildId}`),
      btn('⏱️ Auto-Close', `tswiz:autoclose:open:${guildId}`),
    ),
    row(
      btn('👥 Staff Roles', `tswiz:roles:open:${guildId}`),
      btn('✨ Features',    `tswiz:features:open:${guildId}`),
    ),
  ];
  return { embeds: [embed], components };
}

// ── Sections ──────────────────────────────────────────────────────────────────

async function buildChannelsScreen(guildId: string) {
  const s = getSettings(guildId);
  const embed = new EmbedBuilder().setTitle('📋 Ticket Channels').setColor('#5865f2').addFields(
    { name: 'Log Channel',     value: s.log_channel_id      ? `<#${s.log_channel_id}>`     : '—', inline: true },
    { name: 'Archive Channel', value: s.archive_channel_id  ? `<#${s.archive_channel_id}>` : '—', inline: true },
    { name: 'Transcript Format', value: s.transcript_format ?? 'html', inline: true },
  );
  const fmtMenu = new StringSelectMenuBuilder()
    .setCustomId(`tswiz:channels:format:${guildId}`)
    .setPlaceholder(`Transcript format (currently "${s.transcript_format ?? 'html'}")`)
    .addOptions(
      { label: 'HTML — styled, readable in browser', value: 'html', default: s.transcript_format === 'html' || !s.transcript_format },
      { label: 'Text — plain .txt file', value: 'txt', default: s.transcript_format === 'txt' },
    );
  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(fmtMenu),
      row(
        btn('📋 Set Log Channel',     `tswiz:channels:logch:${guildId}`),
        btn('📦 Set Archive Channel', `tswiz:channels:archch:${guildId}`),
        btn('◀ Back',                 `tswiz:home:open:${guildId}`, ButtonStyle.Danger),
      ),
    ],
  };
}

async function buildLimitsScreen(guildId: string) {
  const s = getSettings(guildId);
  const embed = new EmbedBuilder().setTitle('🔢 Ticket Limits').setColor('#5865f2').addFields(
    { name: 'Max Open Tickets', value: String(s.max_open ?? 3),            inline: true },
    { name: 'Cooldown',         value: `${s.cooldown_seconds ?? 0}s`,       inline: true },
    { name: 'Naming Pattern',   value: `\`${s.name_pattern ?? 'ticket-{username}-{id}'}\``, inline: false },
  ).setFooter({ text: 'Pattern tokens: {username} {id} {category} {number}' });
  return {
    embeds: [embed],
    components: [row(
      btn('⚙️ Edit Limits',   `tswiz:limits:edit:${guildId}`),
      btn('◀ Back',           `tswiz:home:open:${guildId}`, ButtonStyle.Danger),
    )],
  };
}

async function buildAutocloseScreen(guildId: string) {
  const s = getSettings(guildId);
  const embed = new EmbedBuilder().setTitle('⏱️ Auto-Close').setColor('#5865f2').addFields(
    { name: 'Status',          value: flag(s.autoclose_enabled), inline: true },
    { name: 'Closes after',    value: `${s.autoclose_hours ?? 24}h of inactivity`, inline: true },
  );
  return {
    embeds: [embed],
    components: [row(
      btn(s.autoclose_enabled ? '🔴 Disable Auto-Close' : '🟢 Enable Auto-Close', `tswiz:autoclose:toggle:${guildId}`, s.autoclose_enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      btn('⚙️ Set Hours', `tswiz:autoclose:hours:${guildId}`),
      btn('◀ Back',       `tswiz:home:open:${guildId}`, ButtonStyle.Danger),
    )],
  };
}

async function buildRolesScreen(guildId: string) {
  const s = getSettings(guildId);
  const embed = new EmbedBuilder().setTitle('👥 Staff Roles').setColor('#5865f2')
    .setDescription('Set which roles have admin access to the ticket system and which role receives tickets when no panel-specific role is configured.')
    .addFields(
      { name: 'Admin Role',    value: s.admin_role_id           ? `<@&${s.admin_role_id}>`           : '—', inline: true },
      { name: 'Fallback Role', value: s.fallback_staff_role_id  ? `<@&${s.fallback_staff_role_id}>`  : '—', inline: true },
    );
  return {
    embeds: [embed],
    components: [row(
      btn('👑 Set Admin Role',    `tswiz:roles:admin:${guildId}`),
      btn('🔰 Set Fallback Role', `tswiz:roles:fallback:${guildId}`),
      btn('◀ Back',              `tswiz:home:open:${guildId}`, ButtonStyle.Danger),
    )],
  };
}

async function buildFeaturesScreen(guildId: string) {
  const s = getSettings(guildId);
  const embed = new EmbedBuilder().setTitle('✨ Ticket Features').setColor('#5865f2').addFields(
    { name: 'DM on Close',     value: flag(s.dm_on_close),         inline: true },
    { name: 'Survey',          value: flag(s.survey_enabled),       inline: true },
    { name: 'Support Hours',   value: flag(s.support_hours_enabled), inline: true },
    { name: 'Hours',           value: s.support_hours_enabled ? `${s.support_hours_start ?? '09:00'} – ${s.support_hours_end ?? '17:00'} UTC` : '—', inline: true },
  );
  return {
    embeds: [embed],
    components: [row(
      btn(s.dm_on_close       ? '🔴 Disable DM on Close'    : '🟢 Enable DM on Close',    `tswiz:features:dm:${guildId}`,     ButtonStyle.Secondary),
      btn(s.survey_enabled    ? '🔴 Disable Survey'         : '🟢 Enable Survey',         `tswiz:features:survey:${guildId}`, ButtonStyle.Secondary),
      btn(s.support_hours_enabled ? '🔴 Disable Support Hours' : '🟢 Enable Support Hours', `tswiz:features:hours:${guildId}`, ButtonStyle.Secondary),
    ), row(
      btn('🕐 Set Support Hours', `tswiz:features:sethours:${guildId}`),
      btn('◀ Back',               `tswiz:home:open:${guildId}`, ButtonStyle.Danger),
    )],
  };
}

// ── Routing ───────────────────────────────────────────────────────────────────

export function isTicketSetupWizardButton(id: string)  { return id.startsWith('tswiz:'); }
export function isTicketSetupWizardSelect(id: string)  { return id.startsWith('tswiz:'); }
export function isTicketSetupWizardModal(id: string)   { return id.startsWith('tswizm:'); }

export async function handleTicketSetupWizardButton(btn: ButtonInteraction): Promise<void> {
  const [, section, action, guildId] = btn.customId.split(':');
  if (!guildId || btn.guildId !== guildId) return;

  if (section === 'home') return void btn.update(await buildTicketSetupHome(guildId));

  if (section === 'channels') {
    if (action === 'open') return void btn.update(await buildChannelsScreen(guildId));
    const modal = new ModalBuilder()
      .setCustomId(`tswizm:channels:${action}:${guildId}`)
      .setTitle(action === 'logch' ? 'Log Channel ID' : 'Archive Channel ID');
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('channel_id').setLabel('Channel ID').setStyle(TextInputStyle.Short).setRequired(true),
    ));
    return void btn.showModal(modal);
  }

  if (section === 'limits') {
    if (action === 'open') return void btn.update(await buildLimitsScreen(guildId));
    const s = getSettings(guildId);
    const modal = new ModalBuilder().setCustomId(`tswizm:limits:edit:${guildId}`).setTitle('Ticket Limits');
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('max_open').setLabel('Max open tickets per user').setStyle(TextInputStyle.Short).setValue(String(s.max_open ?? 3)).setRequired(false)),
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('cooldown').setLabel('Cooldown between tickets (seconds)').setStyle(TextInputStyle.Short).setValue(String(s.cooldown_seconds ?? 0)).setRequired(false)),
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('pattern').setLabel('Name pattern ({username} {id} {category})').setStyle(TextInputStyle.Short).setValue(s.name_pattern ?? 'ticket-{username}-{id}').setRequired(false)),
    );
    return void btn.showModal(modal);
  }

  if (section === 'autoclose') {
    if (action === 'open') return void btn.update(await buildAutocloseScreen(guildId));
    const s = getSettings(guildId);
    if (action === 'toggle') { updateSettings(guildId, { autoclose_enabled: s.autoclose_enabled ? 0 : 1 } as any); return void btn.update(await buildAutocloseScreen(guildId)); }
    const modal = new ModalBuilder().setCustomId(`tswizm:autoclose:hours:${guildId}`).setTitle('Auto-Close Duration');
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('hours').setLabel('Hours of inactivity before close').setStyle(TextInputStyle.Short).setValue(String(s.autoclose_hours ?? 24)).setRequired(true),
    ));
    return void btn.showModal(modal);
  }

  if (section === 'roles') {
    if (action === 'open') return void btn.update(await buildRolesScreen(guildId));
    const modal = new ModalBuilder()
      .setCustomId(`tswizm:roles:${action}:${guildId}`)
      .setTitle(action === 'admin' ? 'Admin Role ID' : 'Fallback Staff Role ID');
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('role_id').setLabel('Role ID (right-click role → Copy ID)').setStyle(TextInputStyle.Short).setRequired(true),
    ));
    return void btn.showModal(modal);
  }

  if (section === 'features') {
    if (action === 'open') return void btn.update(await buildFeaturesScreen(guildId));
    const s = getSettings(guildId);
    if (action === 'dm')     { updateSettings(guildId, { dm_on_close: s.dm_on_close ? 0 : 1 } as any); return void btn.update(await buildFeaturesScreen(guildId)); }
    if (action === 'survey') { updateSettings(guildId, { survey_enabled: s.survey_enabled ? 0 : 1 } as any); return void btn.update(await buildFeaturesScreen(guildId)); }
    if (action === 'hours')  { updateSettings(guildId, { support_hours_enabled: s.support_hours_enabled ? 0 : 1 } as any); return void btn.update(await buildFeaturesScreen(guildId)); }
    if (action === 'sethours') {
      const modal = new ModalBuilder().setCustomId(`tswizm:features:sethours:${guildId}`).setTitle('Support Hours (UTC)');
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('start').setLabel('Start time (HH:MM, e.g. 09:00)').setStyle(TextInputStyle.Short).setValue(s.support_hours_start ?? '09:00').setRequired(true)),
        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('end').setLabel('End time (HH:MM, e.g. 17:00)').setStyle(TextInputStyle.Short).setValue(s.support_hours_end ?? '17:00').setRequired(true)),
      );
      return void btn.showModal(modal);
    }
  }
}

export async function handleTicketSetupWizardSelect(sel: StringSelectMenuInteraction): Promise<void> {
  const [, section, action, guildId] = sel.customId.split(':');
  if (!guildId || sel.guildId !== guildId) return;

  if (section === 'channels' && action === 'format') {
    updateSettings(guildId, { transcript_format: sel.values[0] as any });
    return void sel.update(await buildChannelsScreen(guildId));
  }
}

export async function handleTicketSetupWizardModal(modal: ModalSubmitInteraction): Promise<void> {
  const [, section, action, guildId] = modal.customId.split(':');
  const get = (id: string) => { try { return modal.fields.getTextInputValue(id).trim(); } catch { return ''; } };

  if (section === 'channels') {
    const chId = get('channel_id');
    if (chId) {
      if (action === 'logch')  updateSettings(guildId, { log_channel_id: chId });
      if (action === 'archch') updateSettings(guildId, { archive_channel_id: chId });
    }
    await modal.reply({ content: '✅ Saved!', ephemeral: true }); return;
  }

  if (section === 'limits') {
    const patch: any = {};
    const mo = parseInt(get('max_open'), 10); if (!isNaN(mo) && mo > 0) patch.max_open = mo;
    const cd = parseInt(get('cooldown'), 10); if (!isNaN(cd) && cd >= 0) patch.cooldown_seconds = cd;
    const pt = get('pattern'); if (pt) patch.name_pattern = pt;
    if (Object.keys(patch).length) updateSettings(guildId, patch);
    await modal.reply({ content: '✅ Saved!', ephemeral: true }); return;
  }

  if (section === 'autoclose' && action === 'hours') {
    const h = parseInt(get('hours'), 10);
    if (!isNaN(h) && h > 0) updateSettings(guildId, { autoclose_hours: h });
    await modal.reply({ content: '✅ Saved!', ephemeral: true }); return;
  }

  if (section === 'roles') {
    const roleId = get('role_id');
    if (roleId) {
      if (action === 'admin')    updateSettings(guildId, { admin_role_id: roleId });
      if (action === 'fallback') updateSettings(guildId, { fallback_staff_role_id: roleId });
    }
    await modal.reply({ content: '✅ Saved!', ephemeral: true }); return;
  }

  if (section === 'features' && action === 'sethours') {
    const start = get('start'); const end = get('end');
    if (start) updateSettings(guildId, { support_hours_start: start });
    if (end)   updateSettings(guildId, { support_hours_end: end });
    await modal.reply({ content: '✅ Saved!', ephemeral: true }); return;
  }

  await modal.reply({ content: '✅ Saved!', ephemeral: true });
}
