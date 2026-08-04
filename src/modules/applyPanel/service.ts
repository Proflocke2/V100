/**
 * MULTI-APPLY-PANEL — combines multiple existing application forms into one
 * message with a dropdown. When a user picks a form, the bot posts the
 * individual apply-button for that form — the existing applyHandler.ts
 * DM-flow then takes over unchanged.
 *
 * Same wizard-lite pattern as the welcome/wizard.ts: button-driven, session-
 * keyed, ephemeral-reply-based. No full wizard session infrastructure needed
 * because the flow is short (create → pick channel → pick apps → post).
 *
 * Tables: apply_panels (the combined message config + list of form IDs).
 * The actual forms still live in the applications table.
 */

import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType,
  EmbedBuilder, StringSelectMenuBuilder, TextChannel,
  ChatInputCommandInteraction, ButtonInteraction, StringSelectMenuInteraction,
  AttachmentBuilder,
} from 'discord.js';
import db from '../../database/db';
import { success, error, info } from '../../utils/embeds';

db.exec(`
  CREATE TABLE IF NOT EXISTS apply_panels (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id    TEXT NOT NULL,
    name        TEXT NOT NULL,
    title       TEXT NOT NULL DEFAULT 'Apply',
    description TEXT,
    color       TEXT DEFAULT '#5865f2',
    form_ids    TEXT NOT NULL DEFAULT '[]',  -- JSON array of application IDs
    channel_id  TEXT,
    message_id  TEXT,
    created_at  INTEGER DEFAULT (unixepoch())
  );
`);

export interface ApplyPanel {
  id: number; guild_id: string; name: string; title: string;
  description: string | null; color: string; form_ids: string;
  channel_id: string | null; message_id: string | null; created_at: number;
}

function listPanels(guildId: string): ApplyPanel[] {
  return db.prepare('SELECT * FROM apply_panels WHERE guild_id = ? ORDER BY id ASC').all(guildId) as ApplyPanel[];
}
function getPanel(id: number, guildId: string): ApplyPanel | null {
  return (db.prepare('SELECT * FROM apply_panels WHERE id = ? AND guild_id = ?').get(id, guildId) as ApplyPanel | undefined) ?? null;
}
function createPanel(guildId: string, name: string): ApplyPanel {
  const res = db.prepare("INSERT INTO apply_panels (guild_id, name, title) VALUES (?, ?, 'Apply')").run(guildId, name);
  return db.prepare('SELECT * FROM apply_panels WHERE id = ?').get(res.lastInsertRowid) as ApplyPanel;
}
function updatePanel(id: number, data: Partial<ApplyPanel>): void {
  const keys = Object.keys(data).filter(k => k !== 'id' && k !== 'guild_id');
  if (!keys.length) return;
  const sets = keys.map(k => `${k} = ?`).join(', ');
  const vals = keys.map(k => (data as any)[k]);
  db.prepare(`UPDATE apply_panels SET ${sets} WHERE id = ?`).run(...vals, id);
}
function deletePanel(id: number, guildId: string): void {
  db.prepare('DELETE FROM apply_panels WHERE id = ? AND guild_id = ?').run(id, guildId);
}

function getAvailableForms(guildId: string) {
  return db.prepare('SELECT id, name, description FROM applications WHERE guild_id = ? AND active = 1 ORDER BY id ASC').all(guildId) as { id: number; name: string; description: string | null }[];
}

// ── Build the live panel message ──────────────────────────────────────────────

export async function postApplyPanel(panel: ApplyPanel, channel: TextChannel): Promise<string> {
  const formIds: number[] = JSON.parse(panel.form_ids);
  if (!formIds.length) throw new Error('Panel has no forms selected.');

  const forms = formIds.map(id => db.prepare('SELECT * FROM applications WHERE id = ?').get(id) as any).filter(Boolean);
  if (!forms.length) throw new Error('No valid forms found for this panel.');

  const embed = new EmbedBuilder()
    .setTitle(panel.title)
    .setColor(panel.color as `#${string}`)
    .setDescription(
      (panel.description ? panel.description + '\n\n' : '') +
      forms.map((f: any) => `**${f.name}** ${f.description ? `— ${f.description}` : ''}`).join('\n')
    );

  let msg: any;
  if (forms.length === 1) {
    // Single form: direct button
    const btn = new ButtonBuilder()
      .setCustomId(`apply_${forms[0].id}`)
      .setLabel(forms[0].button_label || 'Apply Now')
      .setStyle(ButtonStyle.Primary);
    msg = await channel.send({ embeds: [embed], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(btn)] });
  } else {
    // Multiple forms: dropdown
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`apmp:pick:${panel.id}`)
      .setPlaceholder('Choose a form to apply for…')
      .addOptions(forms.map((f: any) => ({ label: f.name.slice(0, 100), value: String(f.id), description: f.description?.slice(0, 100) ?? undefined })));
    msg = await channel.send({ embeds: [embed], components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)] });
  }
  return msg.id;
}

// ── Dropdown handler: user picks a form from the multi-panel ─────────────────

export async function handleApplyPanelSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const panelId = parseInt(interaction.customId.split(':')[2], 10);
  const formId  = parseInt(interaction.values[0], 10);

  const form = db.prepare('SELECT * FROM applications WHERE id = ? AND active = 1').get(formId) as any;
  if (!form) {
    await interaction.reply({ content: '❌ That form is no longer active.', ephemeral: true });
    return;
  }

  // Post an ephemeral reply with the individual apply button so applyHandler picks it up
  const btn = new ButtonBuilder()
    .setCustomId(`apply_${formId}`)
    .setLabel(form.button_label || 'Apply Now')
    .setStyle(ButtonStyle.Primary);
  await interaction.reply({
    embeds: [new EmbedBuilder().setColor('#5865f2').setTitle(`📝 ${form.name}`).setDescription(form.description || 'Click below to start your application in DMs.')],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(btn)],
    ephemeral: true,
  });
}

export function isApplyPanelSelect(customId: string): boolean {
  return customId.startsWith('apmp:pick:');
}

// ── /apply-panel command execute handlers ────────────────────────────────────

export async function executeApplyPanel(ix: ChatInputCommandInteraction): Promise<void> {
  const sub = ix.options.getSubcommand();
  const gid = ix.guildId!;

  if (sub === 'list') {
    const panels = listPanels(gid);
    if (!panels.length) return void ix.reply({ embeds: [info('No apply panels', 'Create one with `/application panel create`.')], ephemeral: true });
    const e = new EmbedBuilder().setColor('#5865f2').setTitle('📋 Apply Panels')
      .setDescription(panels.map(p => {
        const ids: number[] = JSON.parse(p.form_ids);
        return `**#${p.id} ${p.name}** — ${ids.length} form(s)${p.channel_id ? ` • <#${p.channel_id}>` : ' • not posted'}`;
      }).join('\n'));
    return void ix.reply({ embeds: [e], ephemeral: true });
  }

  if (sub === 'create') {
    const name = ix.options.getString('name', true);
    const forms = getAvailableForms(gid);
    if (!forms.length) return void ix.reply({ embeds: [error('No forms', 'Create at least one application form with `/application create` first.')], ephemeral: true });
    const panel = createPanel(gid, name);
    await ix.reply({ embeds: [success('Panel created', `**${name}** (#${panel.id})\nNow edit it with \`/application panel edit id:${panel.id}\` to pick forms, set title, and post it.`)], ephemeral: true });
    return;
  }

  const id = ix.options.getInteger('id', true);
  const panel = getPanel(id, gid);
  if (!panel) return void ix.reply({ embeds: [error('Not found', `No apply panel #${id}.`)], ephemeral: true });

  if (sub === 'edit') {
    const forms = getAvailableForms(gid);
    if (!forms.length) return void ix.reply({ embeds: [error('No forms available')], ephemeral: true });

    const title   = ix.options.getString('title');
    const desc    = ix.options.getString('description');
    const color   = ix.options.getString('color');
    const updates: Partial<ApplyPanel> = {};
    if (title) updates.title       = title;
    if (desc !== null) updates.description = desc;
    if (color && /^#[0-9a-fA-F]{6}$/.test(color)) updates.color = color;
    updatePanel(id, updates);

    // Show form-picker dropdown
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`apmp:editforms:${id}`)
      .setPlaceholder('Pick which forms to include (select all you want)')
      .setMinValues(1)
      .setMaxValues(Math.min(forms.length, 25))
      .addOptions(forms.map(f => ({
        label: f.name.slice(0, 100),
        value: String(f.id),
        description: f.description?.slice(0, 100) ?? undefined,
        default: (JSON.parse(panel.form_ids) as number[]).includes(f.id),
      })));

    return void ix.reply({
      embeds: [new EmbedBuilder().setColor('#5865f2').setTitle('✏️ Edit Apply Panel').setDescription('Select which forms this panel should show:')],
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
      ephemeral: true,
    });
  }

  if (sub === 'post') {
    const formIds: number[] = JSON.parse(panel.form_ids);
    if (!formIds.length) return void ix.reply({ embeds: [error('No forms selected', `Edit the panel first with \`/application panel edit id:${id}\`.`)], ephemeral: true });
    const channelOption = ix.options.getChannel('channel');
    const targetChannel = (channelOption ? ix.guild?.channels.cache.get(channelOption.id) : (panel.channel_id ? ix.guild?.channels.cache.get(panel.channel_id) : null)) as TextChannel | null;
    if (!targetChannel) return void ix.reply({ embeds: [error('No channel', 'Provide a channel or edit the panel first.')], ephemeral: true });

    await ix.deferReply({ ephemeral: true });
    try {
      const msgId = await postApplyPanel(panel, targetChannel);
      updatePanel(id, { channel_id: targetChannel.id, message_id: msgId });
      await ix.editReply({ embeds: [success('Panel posted', `Apply panel posted in <#${targetChannel.id}>.`)] });
    } catch (err) {
      await ix.editReply({ embeds: [error('Failed', String(err))] });
    }
    return;
  }

  if (sub === 'delete') {
    deletePanel(id, gid);
    return void ix.reply({ embeds: [success('Deleted', `Apply panel #${id} removed.`)], ephemeral: true });
  }
}

/** Called from interactionCreate.ts when a user picks forms in the edit dropdown */
export async function handleApplyPanelEditSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const panelId = parseInt(interaction.customId.split(':')[2], 10);
  const gid = interaction.guildId!;
  const panel = getPanel(panelId, gid);
  if (!panel) { await interaction.reply({ content: '❌ Panel not found.', ephemeral: true }); return; }

  const formIds = interaction.values.map(Number);
  updatePanel(panelId, { form_ids: JSON.stringify(formIds) });
  await interaction.update({
    embeds: [success('Forms saved', `Panel #${panelId} now shows ${formIds.length} form(s). Use \`/application panel post id:${panelId}\` to publish it.`)],
    components: [],
  });
}

export function isApplyPanelEditSelect(customId: string): boolean {
  return customId.startsWith('apmp:editforms:');
}
