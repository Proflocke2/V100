/**
 * TICKETS — interaction handler.
 *
 * customId scheme:
 *   tk:open:{categoryId}                  – button (single / row mode)
 *   tk:select:{panelId}                   – StringSelectMenu on a panel
 *   tk:multi:{multiId}                    – StringSelectMenu on a multi-panel (value = panelId)
 *   tk:multi-btn:{multiId}:{panelId}      – Button on a multi-panel (button mode, no dropdown)
 *   tk:multi-cat:{panelId}               – StringSelectMenu for cats inside multi-panel flow
 *   tk:form:{categoryId}                  – modal submit (pre-ticket form answers)
 *   tk:ctrl:close:{ticketId}              – close button  → shows close-reason modal
 *   tk:ctrl:claim:{ticketId}              – claim button
 *   tk:ctrl:unclaim:{ticketId}            – unclaim button
 *   tk:ctrl:adduser:{ticketId}            – add-user button → shows user-ID modal
 *   tk:ctrl:transcript:{ticketId}         – transcript button
 *   tk:close-reason:{ticketId}            – modal submit (close reason)
 *   tk:adduser-modal:{ticketId}           – modal submit (user mention/ID to add)
 *   tk:survey:{ticketId}:{rating}         – exit survey rating button (1–5)
 *   tk:survey-feedback:{ticketId}:{rating} – modal submit for optional feedback
 */

import {
  ButtonInteraction, StringSelectMenuInteraction, ModalSubmitInteraction,
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  AnySelectMenuInteraction as _AnySelectMenu, MessageFlags, TextChannel, EmbedBuilder,
  GuildMember,
} from 'discord.js';
import * as Repo from './repository';
import * as Service from './service';
import { ActivityEvent } from './types';
import { tGuild } from '../../i18n';
import { error, success } from '../../utils/embeds';

// ── Routing predicates ────────────────────────────────────────────────────────

export function isTicketCustomId(id: string): boolean {
  return id.startsWith('tk:');
}

// ── Staff role check ──────────────────────────────────────────────────────────
//
// Configure via the ticket setup wizard: /ticket setup → ⚙️ Settings → 👮 Staff
// Access. Both roles are optional and stack with the per-category support
// role — but if a category is created with no support role AND neither of
// these is set, only Administrators can see that category's tickets. The
// settings overview screen surfaces a warning when that's the case.

/**
 * Returns true if the member has staff or admin permissions to operate ticket buttons.
 * Checks (in order):
 *   1. Guild ADMINISTRATOR permission → always allowed
 *   2. admin_role_id from ticket_settings (if configured)
 *   3. The ticket category's support_role_id (looked up from DB)
 *   4. fallback_staff_role_id from ticket_settings (if configured)
 */
function isStaff(member: GuildMember, ticketId?: number): boolean {
  // 1. Server administrators always have access
  if (member.permissions.has('Administrator')) return true;

  const settings = Repo.getSettings(member.guild.id);

  // 2. Configured admin role
  if (settings.admin_role_id && member.roles.cache.has(settings.admin_role_id)) return true;

  // 3. Category-specific support role
  if (ticketId !== undefined) {
    const ticket = Repo.getTicket(ticketId);
    if (ticket?.category_id) {
      const cat = Repo.getCategory(ticket.category_id);
      if (cat?.support_role_id && member.roles.cache.has(cat.support_role_id)) return true;
    }
  }

  // 4. Fallback staff role
  if (settings.fallback_staff_role_id && member.roles.cache.has(settings.fallback_staff_role_id)) return true;

  return false;
}

// ── Route entry-points ────────────────────────────────────────────────────────

export async function routeButton(btn: ButtonInteraction): Promise<void> {
  const parts  = btn.customId.split(':');
  const action = parts[1];

  if (action === 'open')     return openCategoryFlow(btn, parseInt(parts[2]));
  if (action === 'multi-btn') return openMultiSubPanel(btn, parseInt(parts[3]));
  if (action === 'ctrl')     return ctrlButton(btn, parts[2] as CtrlAction, parseInt(parts[3]));
  if (action === 'survey')   return surveyRating(btn, parseInt(parts[2]), parseInt(parts[3]));
}

export async function routeSelect(sel: StringSelectMenuInteraction): Promise<void> {
  const parts  = sel.customId.split(':');
  const action = parts[1];

  if (action === 'select')    return openCategoryFlow(sel, parseInt(sel.values[0]));
  if (action === 'multi')     return openMultiSubPanel(sel, parseInt(sel.values[0]));
  if (action === 'multi-cat') return openCategoryFlow(sel, parseInt(sel.values[0]));
}

export async function routeModal(modal: ModalSubmitInteraction): Promise<void> {
  const parts  = modal.customId.split(':');
  const action = parts[1];

  if (action === 'form')            return submitForm(modal, parseInt(parts[2]));
  if (action === 'close-reason')    return submitCloseReason(modal, parseInt(parts[2]));
  if (action === 'claim-reason')    return submitClaimReason(modal, parseInt(parts[2]));
  if (action === 'unclaim-reason')  return submitUnclaimReason(modal, parseInt(parts[2]));
  if (action === 'adduser-modal')   return submitAddUser(modal, parseInt(parts[2]));
  if (action === 'survey-feedback') return submitSurveyFeedback(modal, parseInt(parts[2]), parseInt(parts[3]));
}

// ── Types ─────────────────────────────────────────────────────────────────────

type CtrlAction = 'close' | 'claim' | 'unclaim' | 'adduser' | 'transcript';

// ── Step 1: Cooldown check → show pre-ticket modal ────────────────────────────

async function openCategoryFlow(
  ix: ButtonInteraction | StringSelectMenuInteraction,
  categoryId: number,
): Promise<void> {
  const cat = Repo.getCategory(categoryId);
  if (!cat || cat.guild_id !== ix.guildId) {
    await ix.reply({
      embeds: [error(tGuild(ix.guildId!, 'tickets.panel.category_not_found'))],
      flags:  MessageFlags.Ephemeral,
    }).catch(() => {});
    return;
  }

  const cd = Service.checkCooldown(ix.guildId!, ix.user.id);
  if (!cd.ok) {
    let msg: string;
    if (cd.outsideHours) {
      msg = tGuild(ix.guildId!, 'tickets.create.outside_hours', { next: cd.nextOpen ?? '?' });
    } else if (cd.remaining !== undefined) {
      msg = tGuild(ix.guildId!, 'tickets.create.cooldown', { seconds: cd.remaining });
    } else {
      msg = tGuild(ix.guildId!, 'tickets.create.too_many_open', { count: cd.openCount ?? 0 });
    }
    await ix.reply({ embeds: [error(msg)], flags: MessageFlags.Ephemeral }).catch(() => {});
    return;
  }

  const questions = Repo.resolveFormQuestions(cat.panel_id, categoryId);
  const modal = new ModalBuilder()
    .setCustomId(`tk:form:${categoryId}`)
    .setTitle(
      tGuild(ix.guildId!, 'tickets.create.modal_title', { category: cat.label }).slice(0, 45),
    );

  if (questions.length === 0) {
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('q0')
          .setLabel(tGuild(ix.guildId!, 'tickets.create.default_question_label').slice(0, 45))
          .setPlaceholder(
            tGuild(ix.guildId!, 'tickets.create.default_question_placeholder').slice(0, 100),
          )
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMinLength(10)
          .setMaxLength(1000),
      ),
    );
  } else {
    for (const q of questions.slice(0, 5)) {
      const input = new TextInputBuilder()
        .setCustomId(`q${q.position}`)
        .setLabel(q.label.slice(0, 45))
        .setStyle(q.style === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short)
        .setRequired(Boolean(q.required))
        .setMinLength(q.min_length)
        .setMaxLength(q.max_length);
      if (q.placeholder) input.setPlaceholder(q.placeholder.slice(0, 100));
      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
    }
  }

  await ix.showModal(modal);
}

// ── Step 2: Modal submitted → create ticket channel ───────────────────────────

async function submitForm(modal: ModalSubmitInteraction, categoryId: number): Promise<void> {
  const cat = Repo.getCategory(categoryId);
  if (!cat || cat.guild_id !== modal.guildId) {
    await modal.reply({
      embeds: [error(tGuild(modal.guildId!, 'tickets.panel.category_not_found'))],
      flags:  MessageFlags.Ephemeral,
    });
    return;
  }

  // Re-check cooldown after modal submit (user could delay)
  const cd = Service.checkCooldown(modal.guildId!, modal.user.id);
  if (!cd.ok) {
    let msg: string;
    if (cd.outsideHours) {
      msg = tGuild(modal.guildId!, 'tickets.create.outside_hours', { next: cd.nextOpen ?? '?' });
    } else if (cd.remaining !== undefined) {
      msg = tGuild(modal.guildId!, 'tickets.create.cooldown', { seconds: cd.remaining });
    } else {
      msg = tGuild(modal.guildId!, 'tickets.create.too_many_open', { count: cd.openCount ?? 0 });
    }
    await modal.reply({ embeds: [error(msg)], flags: MessageFlags.Ephemeral });
    return;
  }

  const questions = Repo.resolveFormQuestions(cat.panel_id, categoryId);
  const answers: Array<{ label: string; value: string }> = [];

  if (questions.length === 0) {
    answers.push({
      label: tGuild(modal.guildId!, 'tickets.create.default_question_label'),
      value: modal.fields.getTextInputValue('q0'),
    });
  } else {
    for (const q of questions.slice(0, 5)) {
      answers.push({
        label: q.label,
        value: modal.fields.getTextInputValue(`q${q.position}`),
      });
    }
  }

  await modal.deferReply({ flags: MessageFlags.Ephemeral });
  const result = await Service.openTicket(
    modal.guild!, cat, modal.user.id, modal.user.username, answers,
  );

  if (result.ok) {
    await modal.editReply({
      embeds: [success(
        tGuild(modal.guildId!, 'tickets.create.created'),
        tGuild(modal.guildId!, 'tickets.create.created_link', { channel: `<#${result.channelId}>` }),
      )],
    });
  } else {
    await modal.editReply({
      embeds: [error(tGuild(modal.guildId!, 'tickets.create.create_failed'), result.reason)],
    });
  }
}

// ── Multi-panel: pick sub-panel → show its categories ─────────────────────────

async function openMultiSubPanel(sel: StringSelectMenuInteraction | ButtonInteraction, panelId: number): Promise<void> {
  const panel = Repo.getPanel(panelId);
  if (!panel || panel.guild_id !== sel.guildId) {
    await sel.reply({
      embeds: [error(tGuild(sel.guildId!, 'tickets.panel.not_found'))],
      flags:  MessageFlags.Ephemeral,
    });
    return;
  }

  const cats = Repo.listCategories(panelId);
  if (cats.length === 0) {
    await sel.reply({
      embeds: [error(tGuild(sel.guildId!, 'tickets.panel.no_categories'))],
      flags:  MessageFlags.Ephemeral,
    });
    return;
  }

  // Single category inside multi-panel: skip the second dropdown
  if (cats.length === 1) {
    const cat = cats[0];
    const { ButtonBuilder, ButtonStyle, ActionRowBuilder: AR } = await import('discord.js');
    const btn = new ButtonBuilder()
      .setCustomId(`tk:open:${cat.id}`)
      .setLabel((cat.button_text ?? cat.label).slice(0, 80))
      .setStyle(ButtonStyle.Primary);
    if (cat.emoji) btn.setEmoji(cat.emoji);

    await sel.reply({
      embeds: [new EmbedBuilder()
        .setTitle(panel.title)
        .setDescription(panel.description ?? 'Click below to open a ticket.')
        .setColor(0x5865f2)],
      components: [new AR<typeof btn>().addComponents(btn)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`tk:multi-cat:${panelId}`)
    .setPlaceholder(tGuild(sel.guildId!, 'tickets.panel.select_placeholder'))
    .addOptions(
      cats.slice(0, 25).map(c => {
        const o = new StringSelectMenuOptionBuilder().setLabel(c.label).setValue(String(c.id));
        if (c.emoji) o.setEmoji(c.emoji);
        return o;
      }),
    );

  await sel.reply({
    embeds: [new EmbedBuilder()
      .setTitle(panel.title)
      .setDescription(panel.description ?? null)
      .setColor(0x5865f2)],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
    flags:      MessageFlags.Ephemeral,
  });
}

// ── Control buttons ───────────────────────────────────────────────────────────

async function ctrlButton(btn: ButtonInteraction, action: CtrlAction, ticketId: number): Promise<void> {
  const ticket = Repo.getTicket(ticketId);
  if (!ticket) {
    await btn.reply({
      embeds: [error(tGuild(btn.guildId!, 'tickets.actions.not_a_ticket'))],
      flags:  MessageFlags.Ephemeral,
    });
    return;
  }

  // ── STAFF GATE ─────────────────────────────────────────────────────────────
  // Claim, Unclaim, and Close buttons are staff-only.
  // Transcript is also restricted to staff (avoids data leaks).
  // AddUser is staff-only too.
  // Only the survey buttons (action === 'survey') are open to all users.
  const staffOnlyActions: CtrlAction[] = ['close', 'claim', 'unclaim', 'adduser', 'transcript'];
  if (staffOnlyActions.includes(action)) {
    const member = btn.member as GuildMember;
    if (!isStaff(member, ticketId)) {
      await btn.reply({
        embeds: [new EmbedBuilder()
          .setTitle('🚫 Access Denied')
          .setDescription('This button is reserved for **Staff members** only.\nIf you need to close your ticket, please ask a staff member.')
          .setColor('#ed4245')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }

  // ── CLOSE → show close-reason modal ────────────────────────────────────────
  if (action === 'close') {
    if (ticket.status === 'closed') {
      await btn.reply({
        embeds: [error(tGuild(btn.guildId!, 'tickets.actions.already_closed'))],
        flags:  MessageFlags.Ephemeral,
      });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`tk:close-reason:${ticketId}`)
      .setTitle('Close Ticket')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('reason')
            .setLabel('Reason for closing')
            .setPlaceholder('e.g. Issue resolved, No response, Solved via DM…')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMinLength(3)
            .setMaxLength(500),
        ),
      );

    await btn.showModal(modal);
    return;
  }

  // ── CLAIM → show claim-reason modal ────────────────────────────────────────
  if (action === 'claim') {
    const modal = new ModalBuilder()
      .setCustomId(`tk:claim-reason:${ticketId}`)
      .setTitle('Claim Ticket')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('reason')
            .setLabel('Note (optional)')
            .setPlaceholder('e.g. I will handle this, Assigned to me…')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(200),
        ),
      );

    await btn.showModal(modal);
    return;
  }

  // ── UNCLAIM → show unclaim-reason modal ────────────────────────────────────
  if (action === 'unclaim') {
    const modal = new ModalBuilder()
      .setCustomId(`tk:unclaim-reason:${ticketId}`)
      .setTitle('Unclaim Ticket')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('reason')
            .setLabel('Reason for unclaiming')
            .setPlaceholder('e.g. Handing off to another staff member…')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(200),
        ),
      );

    await btn.showModal(modal);
    return;
  }

  // ── ADD USER → show modal for user ID/mention ───────────────────────────────
  if (action === 'adduser') {
    const modal = new ModalBuilder()
      .setCustomId(`tk:adduser-modal:${ticketId}`)
      .setTitle('Add User to Ticket')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('user_id')
            .setLabel('User ID or @mention')
            .setPlaceholder('e.g. 123456789012345678  or  @username')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(2)
            .setMaxLength(100),
        ),
      );

    await btn.showModal(modal);
    return;
  }

  // ── TRANSCRIPT ──────────────────────────────────────────────────────────────
  if (action === 'transcript') {
    await btn.deferReply({ flags: MessageFlags.Ephemeral });

    const att = await Service.generateTranscriptAttachment(btn.guild!, ticket);
    if (!att) {
      await btn.editReply({ embeds: [error(tGuild(btn.guildId!, 'tickets.actions.not_a_ticket'))] });
      return;
    }

    const settings = Repo.getSettings(btn.guildId!);
    if (settings.log_channel_id) {
      const log = btn.guild!.channels.cache.get(settings.log_channel_id) as TextChannel | undefined;
      if (log) await log.send({ files: [att] }).catch(() => {});
      await btn.editReply({
        embeds: [success(tGuild(btn.guildId!, 'tickets.actions.transcript_sent'))],
      });
    } else {
      await btn.editReply({
        embeds: [success(tGuild(btn.guildId!, 'tickets.actions.transcript_no_log'))],
        files:  [att],
      });
    }
    return;
  }
}

// ── Modal: close reason submitted ─────────────────────────────────────────────

async function submitCloseReason(modal: ModalSubmitInteraction, ticketId: number): Promise<void> {
  const ticket = Repo.getTicket(ticketId);
  if (!ticket || ticket.status === 'closed') {
    await modal.reply({
      embeds: [error(tGuild(modal.guildId!, 'tickets.actions.already_closed'))],
      flags:  MessageFlags.Ephemeral,
    });
    return;
  }

  const reason = modal.fields.getTextInputValue('reason').trim() || undefined;

  await modal.reply({
    embeds: [success(
      tGuild(modal.guildId!, 'tickets.actions.closed'),
      tGuild(modal.guildId!, 'tickets.actions.closing_in', { seconds: 10 }),
    )],
  });

  await Service.closeTicket(modal.guild!, ticket, modal.user.id, reason);
  setTimeout(() => modal.channel?.delete().catch(() => {}), 15_000);
}

// ── Modal: claim reason submitted ─────────────────────────────────────────────

async function submitClaimReason(modal: ModalSubmitInteraction, ticketId: number): Promise<void> {
  const ticket = Repo.getTicket(ticketId);
  if (!ticket) {
    await modal.reply({ embeds: [error(tGuild(modal.guildId!, 'tickets.actions.not_a_ticket'))], flags: MessageFlags.Ephemeral });
    return;
  }

  const result = await Service.claimTicket(modal.guild!, ticket, modal.user);
  if (!result.ok) {
    const msg = result.alreadyClaimed
      ? tGuild(modal.guildId!, 'tickets.actions.already_claimed', { user: `<@${result.alreadyClaimed}>` })
      : tGuild(modal.guildId!, 'tickets.actions.already_closed');
    await modal.reply({ embeds: [error(msg)], flags: MessageFlags.Ephemeral });
    return;
  }

  const note = modal.fields.getTextInputValue('reason').trim();
  const desc = note ? `**Note:** ${note}` : undefined;

  await modal.reply({
    embeds: [success(
      tGuild(modal.guildId!, 'tickets.actions.claimed', { user: `<@${modal.user.id}>` }),
      desc,
    )],
  });
}

// ── Modal: unclaim reason submitted ───────────────────────────────────────────

async function submitUnclaimReason(modal: ModalSubmitInteraction, ticketId: number): Promise<void> {
  const ticket = Repo.getTicket(ticketId);
  if (!ticket) {
    await modal.reply({ embeds: [error(tGuild(modal.guildId!, 'tickets.actions.not_a_ticket'))], flags: MessageFlags.Ephemeral });
    return;
  }

  const result = await Service.unclaimTicket(modal.guild!, ticket, modal.user);
  if (!result.ok) {
    await modal.reply({ embeds: [error('This ticket is not claimed.')], flags: MessageFlags.Ephemeral });
    return;
  }

  const note = modal.fields.getTextInputValue('reason').trim();
  const desc = note ? `**Reason:** ${note}` : undefined;

  await modal.reply({
    embeds: [success(`🔓 Ticket unclaimed by <@${modal.user.id}>.`, desc)],
  });
}

// ── Modal: add user submitted ─────────────────────────────────────────────────

async function submitAddUser(modal: ModalSubmitInteraction, ticketId: number): Promise<void> {
  const ticket = Repo.getTicket(ticketId);
  if (!ticket) {
    await modal.reply({
      embeds: [error(tGuild(modal.guildId!, 'tickets.actions.not_a_ticket'))],
      flags:  MessageFlags.Ephemeral,
    });
    return;
  }

  const raw    = modal.fields.getTextInputValue('user_id').trim();
  const userId = raw.replace(/[<@!>]/g, '');

  const member = await modal.guild!.members.fetch(userId).catch(() => null);
  if (!member) {
    await modal.reply({
      embeds: [error('User not found. Make sure you entered a valid User ID or @mention.')],
      flags:  MessageFlags.Ephemeral,
    });
    return;
  }

  const channel = modal.channel as TextChannel;
  await Service.addUserToTicket(channel, member.id);
  Repo.logActivity({ guild_id: modal.guildId!, ticket_id: ticket.id, user_id: modal.user.id, event: ActivityEvent.UserAdded });

  await modal.reply({
    embeds: [success(
      tGuild(modal.guildId!, 'tickets.actions.user_added', { user: member.toString() }),
    )],
  });
}

// ── Survey: rating button clicked ─────────────────────────────────────────────

async function surveyRating(btn: ButtonInteraction, ticketId: number, rating: number): Promise<void> {
  if (rating < 1 || rating > 5) return;

  const ticket = Repo.getTicket(ticketId);
  if (!ticket) {
    await btn.reply({ embeds: [error('Ticket not found.')], flags: MessageFlags.Ephemeral });
    return;
  }

  // Only the original opener can rate
  if (btn.user.id !== ticket.user_id) {
    await btn.reply({ embeds: [error('Only the ticket opener can submit a rating.')], flags: MessageFlags.Ephemeral });
    return;
  }

  // Show optional feedback modal
  const modal = new ModalBuilder()
    .setCustomId(`tk:survey-feedback:${ticketId}:${rating}`)
    .setTitle(`Rate: ${'⭐'.repeat(rating)}${'☆'.repeat(5 - rating)}`)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('feedback')
          .setLabel('Optional feedback (leave blank to skip)')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(500),
      ),
    );

  await btn.showModal(modal);
}

// ── Survey: feedback modal submitted ─────────────────────────────────────────

async function submitSurveyFeedback(modal: ModalSubmitInteraction, ticketId: number, rating: number): Promise<void> {
  const feedback = modal.fields.getTextInputValue('feedback').replace(/^\n+|\n+$/g, '') || null;

  Repo.insertSurvey({
    ticket_id: ticketId,
    guild_id:  modal.guildId!,
    user_id:   modal.user.id,
    rating,
    feedback,
  });

  const stars = '⭐'.repeat(rating) + '☆'.repeat(5 - rating);
  const embed = new EmbedBuilder()
    .setTitle('✅ Review Submitted')
    .setDescription(`Thank you for your feedback! You rated: **${stars}** (${rating}/5)${feedback ? `\n\n> ${feedback}` : ''}`)
    .setColor('#57f287')
    .setTimestamp();

  await modal.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

  // Log to guild log channel if set
  const settings = Repo.getSettings(modal.guildId!);
  if (settings.log_channel_id) {
    const log = modal.guild!.channels.cache.get(settings.log_channel_id) as TextChannel | undefined;
    if (log) {
      const logEmbed = new EmbedBuilder()
        .setTitle('⭐ Survey Response')
        .setColor(rating >= 4 ? '#57f287' : rating >= 3 ? '#fee75c' : '#ed4245')
        .addFields(
          { name: 'Ticket',    value: `#${String(Repo.getTicket(ticketId)?.number ?? '?').padStart(4, '0')}`, inline: true },
          { name: 'Rating',    value: `${stars} (${rating}/5)`, inline: true },
          { name: 'From',      value: `<@${modal.user.id}>`,    inline: true },
          ...(feedback ? [{ name: 'Feedback', value: feedback }] : []),
        )
        .setTimestamp();
      await log.send({ embeds: [logEmbed] }).catch(() => {});
    }
  }
}
