/**
 * PANEL HANDLER
 * Handles button clicks, dropdown selections, and modal submits for ticket panels.
 *
 * customId-Schema:
 *   panel:open:{categoryId}      → Button-Klick
 *   panel:select:{panelId}       → Dropdown-Auswahl (Wert = categoryId)
 *   panel:reason:{categoryId}    → Modal-Submit (Reason eingegeben)
 *   ticket:close:{ticketId}      → Close
 *   ticket:claim:{ticketId}      → Claim
 */

import {
  ButtonInteraction,
  StringSelectMenuInteraction,
  ModalSubmitInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ChannelType,
  PermissionFlagsBits,
  Guild,
  Client,
  TextChannel,
} from 'discord.js';
import { error, success } from '../utils/embeds';
import * as PanelDB from '../services/panelDB';
import db from '../database/db';

// ── ID-Erkennung ──────────────────────────────────────────────────────────────

export function isPanelButton(id: string): boolean {
  return id.startsWith('panel:open:');
}

export function isPanelSelect(id: string): boolean {
  return id.startsWith('panel:select:');
}

export function isPanelModal(id: string): boolean {
  return id.startsWith('panel:reason:');
}

// ── COOLDOWN ──────────────────────────────────────────────────────────────────

const COOLDOWN_MS    = 60_000;
const MAX_OPEN_TICKETS = 3;
const userCooldown   = new Map<string, number>();

function checkCooldown(userId: string, guildId: string): { ok: boolean; reason?: string } {
  const key = `${userId}_${guildId}`;
  const now = Date.now();

  const last = userCooldown.get(key) ?? 0;
  if (now - last < COOLDOWN_MS) {
    const secs = Math.ceil((COOLDOWN_MS - (now - last)) / 1000);
    return { ok: false, reason: `Please wait **${secs}s** before opening another ticket.` };
  }

  const open = (db.prepare(
    `SELECT COUNT(*) as c FROM tickets WHERE guild_id = ? AND user_id = ? AND status = 'open'`
  ).get(guildId, userId) as any)?.c ?? 0;

  if (open >= MAX_OPEN_TICKETS) {
    return { ok: false, reason: `You already have **${open}** open tickets. Close some first.` };
  }

  return { ok: true };
}

// ── ROUTING ───────────────────────────────────────────────────────────────────

export async function handlePanelButton(btn: ButtonInteraction): Promise<void> {
  const categoryId = parseInt(btn.customId.split(':')[2]);
  await openModal(btn, categoryId);
}

export async function handlePanelSelect(sel: StringSelectMenuInteraction): Promise<void> {
  const categoryId = parseInt(sel.values[0]);
  await openModal(sel, categoryId);
}

export async function handlePanelModal(modal: ModalSubmitInteraction): Promise<void> {
  const categoryId = parseInt(modal.customId.split(':')[2]);
  const reason     = modal.fields.getTextInputValue('reason');

  const cat = PanelDB.getCategory(categoryId);
  if (!cat) return void modal.reply({ embeds: [error('Category not found')], ephemeral: true });

  // Re-check cooldown after modal submit
  const cd = checkCooldown(modal.user.id, modal.guildId!);
  if (!cd.ok) {
    return void modal.reply({ embeds: [error('⏳ Slow down', cd.reason!)], ephemeral: true });
  }

  await modal.deferReply({ ephemeral: true });
  const result = await createTicket(modal.guild!, cat, modal.user.id, reason);

  if (result.ok) {
    userCooldown.set(`${modal.user.id}_${modal.guildId}`, Date.now());
    await modal.editReply({ embeds: [success('✅ Ticket created', `<#${result.channelId}>`)] });
  } else {
    await modal.editReply({ embeds: [error('Failed', result.error!)] });
  }
}

// ── Helper: open modal ─────────────────────────────────────────────────────

async function openModal(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  categoryId: number,
): Promise<void> {
  const cat = PanelDB.getCategory(categoryId);
  if (!cat) return void interaction.reply({ embeds: [error('Category not found')], ephemeral: true });

  const cd = checkCooldown(interaction.user.id, interaction.guildId!);
  if (!cd.ok) {
    return void interaction.reply({ embeds: [error('⏳ Slow down', cd.reason!)], ephemeral: true });
  }

  const modal = new ModalBuilder()
    .setCustomId(`panel:reason:${categoryId}`)
    .setTitle(`📝 ${cat.label}`)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Reason for opening this ticket')
          .setPlaceholder('Describe your issue (min. 10 characters)...')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMinLength(10)
          .setMaxLength(1000),
      ),
    );

  await interaction.showModal(modal);
}

// ── Create ticket channel ─────────────────────────────────────────────────────

async function createTicket(
  guild: Guild,
  cat: PanelDB.Category,
  userId: string,
  reason: string,
): Promise<{ ok: boolean; channelId?: string; error?: string }> {
  try {
    const num    = ((db.prepare('SELECT MAX(number) as m FROM tickets WHERE guild_id = ?')
      .get(guild.id) as any)?.m ?? 0) + 1;
    const padded = String(num).padStart(4, '0');

    /**
     * SMART PERMISSIONS — 4 layers:
     * 1. @everyone deny   → nobody can see the ticket
     * 2. User allow       → creator can see + write in theirs
     * 3. Support role     → support can see + manage
     * 4. Bot allow        → bot can manage the channel
     */
    const channel = await guild.channels.create({
      name:   `${cat.label.toLowerCase().replace(/\s+/g, '-')}-${padded}`,
      type:   ChannelType.GuildText,
      parent: cat.category_id,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
          id:    userId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks,
          ],
        },
        ...(cat.support_role_id ? [{
          id:    cat.support_role_id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageMessages,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks,
          ],
        }] : []),
        ...(guild.members.me ? [{
          id:    guild.members.me.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ManageMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        }] : []),
      ],
    });

    // Save ticket to DB
    db.prepare(`
      INSERT INTO tickets (guild_id, channel_id, user_id, number, status)
      VALUES (?, ?, ?, ?, 'open')
    `).run(guild.id, channel.id, userId, num);

    const ticket = db.prepare('SELECT * FROM tickets WHERE channel_id = ?').get(channel.id) as any;

    // Welcome-Embed
    const welcome = new EmbedBuilder()
      .setTitle(`${cat.emoji ?? '🎫'} ${cat.label} — #${padded}`)
      .setDescription(
        (cat.welcome_message ?? `Hi <@${userId}>, support will be with you shortly.`) +
        `\n\n**📝 Reason:**\n${reason}`,
      )
      .setColor('#5865f2')
      .setFooter({ text: `Opened by ${userId}` })
      .setTimestamp();

    if (cat.support_role_id) {
      welcome.addFields({ name: '👥 Support', value: `<@&${cat.support_role_id}>` });
    }

    // Control-Buttons
    const controls = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`ticket:close:${ticket.id}`).setLabel('🔒 Close').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`ticket:claim:${ticket.id}`).setLabel('✋ Claim').setStyle(ButtonStyle.Success),
    );

    await channel.send({
      content: cat.support_role_id ? `<@${userId}> <@&${cat.support_role_id}>` : `<@${userId}>`,
      embeds:  [welcome],
      components: [controls],
    });

    return { ok: true, channelId: channel.id };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

// ── Ticket-Buttons (close / claim) ────────────────────────────────────────────

export function isTicketControl(id: string): boolean {
  return id.startsWith('ticket:close:') || id.startsWith('ticket:claim:');
}

export async function handleTicketControl(btn: ButtonInteraction): Promise<void> {
  const [, action, ticketIdStr] = btn.customId.split(':');
  const ticketId = parseInt(ticketIdStr);

  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId) as any;
  if (!ticket) return void btn.reply({ embeds: [error('Ticket not found')], ephemeral: true });

  if (action === 'close') {
    if (ticket.status === 'closed') {
      return void btn.reply({ embeds: [error('Already closed')], ephemeral: true });
    }
    db.prepare(`UPDATE tickets SET status = 'closed', closed_at = unixepoch() WHERE id = ?`).run(ticketId);
    await btn.reply({ embeds: [success('🔒 Ticket closed', 'This channel will be deleted in 5 seconds.')] });
    setTimeout(() => btn.channel?.delete().catch(() => {}), 5_000);
    return;
  }

  if (action === 'claim') {
    db.prepare('UPDATE tickets SET claimed_by = ? WHERE id = ?').run(btn.user.id, ticketId);
    await btn.reply({ embeds: [success('✋ Claimed', `<@${btn.user.id}> is now handling this ticket.`)] });
  }
}
