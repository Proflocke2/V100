/**
 * modules/tickets/wizard/settings.ts
 *
 * Everything that used to live under /settings ticket — log channel,
 * archive channel, transcript format, cooldown, max open, DM on close,
 * name pattern, branding, autoclose, support hours, exit survey.
 *
 * One overview screen with all current values, plus buttons that each open
 * a focused edit step (channel select, modal, or toggle) for one setting
 * at a time — same underlying Repo.updateSettings() calls as the old command.
 */

import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ChannelSelectMenuBuilder, ChannelType, RoleSelectMenuBuilder,
  EmbedBuilder, MessageFlags,
} from 'discord.js';
import * as Repo from '../repository';
import { error, info } from '../../../utils/embeds';
import { buildCustomId, getSession } from './session';
import { navRow, promptModal, renderTo, WizardComponentInteraction, WizardView } from './helpers';
import { tw, twg } from './i18n';

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function renderSettingsOverview(sessionId: string, guildId: string): WizardView {
  const s = Repo.getSettings(guildId);

  const supportHoursValue = s.support_hours_enabled
    ? (s.support_hours_start && s.support_hours_end ? twg(guildId, 'settings.support_hours_on', { start: s.support_hours_start, end: s.support_hours_end }) : twg(guildId, 'settings.support_hours_on_notimes'))
    : `❌ ${twg(guildId, 'common.off')}`;
  const autocloseValue = s.autoclose_enabled ? twg(guildId, 'settings.autoclose_on', { hours: s.autoclose_hours }) : `❌ ${twg(guildId, 'common.off')}`;

  // Surfaced here (not just on the Staff Access sub-screen) because it's easy
  // to forget entirely — a category created without its own support role,
  // combined with no admin/fallback role configured, means literally nobody
  // but Server Administrators can see or manage that category's tickets.
  const noStaffRolesConfigured = !s.admin_role_id && !s.fallback_staff_role_id;

  const embed = new EmbedBuilder()
    .setTitle(twg(guildId, 'settings.title'))
    .setColor(noStaffRolesConfigured ? '#fee75c' : '#5865f2')
    .addFields(
      { name: twg(guildId, 'settings.log_channel'), value: s.log_channel_id ? `<#${s.log_channel_id}>` : '—', inline: true },
      { name: twg(guildId, 'settings.archive_channel'), value: s.archive_channel_id ? `<#${s.archive_channel_id}>` : '—', inline: true },
      { name: twg(guildId, 'settings.transcript'), value: s.transcript_format.toUpperCase(), inline: true },
      { name: twg(guildId, 'settings.cooldown'), value: s.cooldown_seconds === 0 ? twg(guildId, 'common.off') : `${s.cooldown_seconds}s`, inline: true },
      { name: twg(guildId, 'settings.max_open'), value: String(s.max_open), inline: true },
      { name: twg(guildId, 'settings.dm_on_close'), value: s.dm_on_close ? '✅' : '❌', inline: true },
      { name: twg(guildId, 'settings.branding_removed'), value: s.remove_branding ? '✅' : '❌', inline: true },
      { name: twg(guildId, 'settings.survey'), value: s.survey_enabled ? '✅' : '❌', inline: true },
      { name: twg(guildId, 'settings.name_pattern'), value: `\`${s.name_pattern}\``, inline: true },
      { name: twg(guildId, 'settings.autoclose'), value: autocloseValue },
      { name: twg(guildId, 'settings.support_hours'), value: supportHoursValue },
      {
        name: twg(guildId, 'settings.staff_access'),
        value: noStaffRolesConfigured
          ? `⚠️ ${twg(guildId, 'settings.staff_access_warning')}`
          : [
              s.admin_role_id ? twg(guildId, 'settings.staff_admin_set', { role: `<@&${s.admin_role_id}>` }) : null,
              s.fallback_staff_role_id ? twg(guildId, 'settings.staff_fallback_set', { role: `<@&${s.fallback_staff_role_id}>` }) : null,
            ].filter(Boolean).join('\n'),
      },
    );

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buildCustomId(sessionId, 'set', 'logchannel')).setLabel(twg(guildId, 'settings.btn_log')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(buildCustomId(sessionId, 'set', 'archivechannel')).setLabel(twg(guildId, 'settings.btn_archive')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(buildCustomId(sessionId, 'set', 'general')).setLabel(twg(guildId, 'settings.btn_general')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(buildCustomId(sessionId, 'set', 'toggles')).setLabel(twg(guildId, 'settings.btn_toggles')).setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buildCustomId(sessionId, 'set', 'autoclose')).setLabel(twg(guildId, 'settings.btn_autoclose')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(buildCustomId(sessionId, 'set', 'supporthours')).setLabel(twg(guildId, 'settings.btn_supporthours')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(buildCustomId(sessionId, 'set', 'staffaccess')).setLabel(twg(guildId, 'settings.btn_staffaccess')).setStyle(noStaffRolesConfigured ? ButtonStyle.Danger : ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row1, row2, navRow(sessionId, 'menu')] };
}

export async function handleSettingsSection(interaction: WizardComponentInteraction, sessionId: string, action: string): Promise<void> {
  const session = getSession(sessionId)!;
  const gid = session.guildId;

  if (action === 'logchannel' && interaction.isButton()) {
    const embed = new EmbedBuilder().setTitle(twg(gid, 'settings.log_channel')).setColor('#5865f2').setDescription(twg(gid, 'settings.pick_or_clear'));
    const select = new ChannelSelectMenuBuilder().setCustomId(buildCustomId(sessionId, 'set', 'setlogchannel')).setPlaceholder(twg(gid, 'common.pick_channel')).addChannelTypes(ChannelType.GuildText);
    const clear = new ButtonBuilder().setCustomId(buildCustomId(sessionId, 'set', 'setlogchannel', 'clear')).setLabel(twg(gid, 'common.clear')).setStyle(ButtonStyle.Secondary);
    return renderTo(interaction, { embeds: [embed], components: [new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(select), new ActionRowBuilder<ButtonBuilder>().addComponents(clear), navRow(sessionId, 'set:overview')] });
  }
  if (action === 'setlogchannel') {
    const channelId = interaction.isChannelSelectMenu() ? interaction.values[0] : null;
    Repo.updateSettings(gid, { log_channel_id: channelId });
    return renderTo(interaction, renderSettingsOverview(sessionId, gid));
  }

  if (action === 'archivechannel' && interaction.isButton()) {
    const embed = new EmbedBuilder().setTitle(twg(gid, 'settings.archive_channel')).setColor('#5865f2').setDescription(twg(gid, 'settings.pick_or_clear'));
    const select = new ChannelSelectMenuBuilder().setCustomId(buildCustomId(sessionId, 'set', 'setarchivechannel')).setPlaceholder(twg(gid, 'common.pick_channel')).addChannelTypes(ChannelType.GuildText);
    const clear = new ButtonBuilder().setCustomId(buildCustomId(sessionId, 'set', 'setarchivechannel', 'clear')).setLabel(twg(gid, 'common.clear')).setStyle(ButtonStyle.Secondary);
    return renderTo(interaction, { embeds: [embed], components: [new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(select), new ActionRowBuilder<ButtonBuilder>().addComponents(clear), navRow(sessionId, 'set:overview')] });
  }
  if (action === 'setarchivechannel') {
    const channelId = interaction.isChannelSelectMenu() ? interaction.values[0] : null;
    Repo.updateSettings(gid, { archive_channel_id: channelId });
    return renderTo(interaction, renderSettingsOverview(sessionId, gid));
  }

  if (action === 'general' && interaction.isButton()) {
    const s = Repo.getSettings(gid);
    const result = await promptModal(interaction, buildCustomId(sessionId, 'set', 'generalmodal'), twg(gid, 'settings.general_modal'), [
      { id: 'cooldown', label: twg(gid, 'settings.f_cooldown'), required: true, maxLength: 5, value: String(s.cooldown_seconds) },
      { id: 'max_open', label: twg(gid, 'settings.f_max_open'), required: true, maxLength: 3, value: String(s.max_open) },
      { id: 'name_pattern', label: twg(gid, 'settings.f_name_pattern'), required: true, maxLength: 60, value: s.name_pattern },
      { id: 'transcript_format', label: twg(gid, 'settings.f_transcript'), required: true, maxLength: 4, value: s.transcript_format },
    ]);
    if (!result) return;
    const { values, submit } = result;

    const cooldown = parseInt(values.cooldown, 10);
    const maxOpen  = parseInt(values.max_open, 10);
    if (isNaN(cooldown) || cooldown < 0 || cooldown > 3600) {
      await submit.reply({ embeds: [error(twg(gid, 'settings.err_cooldown'), twg(gid, 'settings.err_cooldown_desc'))], flags: MessageFlags.Ephemeral });
      return;
    }
    if (isNaN(maxOpen) || maxOpen < 1 || maxOpen > 100) {
      await submit.reply({ embeds: [error(twg(gid, 'settings.err_value'), twg(gid, 'settings.err_max_open_desc'))], flags: MessageFlags.Ephemeral });
      return;
    }
    if (!values.name_pattern.includes('{username}') && !values.name_pattern.includes('{id}')) {
      await submit.reply({ embeds: [error(twg(gid, 'settings.err_pattern'), twg(gid, 'settings.err_pattern_desc'))], flags: MessageFlags.Ephemeral });
      return;
    }
    if (!['txt', 'html'].includes(values.transcript_format)) {
      await submit.reply({ embeds: [error(twg(gid, 'settings.err_format'), twg(gid, 'settings.err_format_desc'))], flags: MessageFlags.Ephemeral });
      return;
    }

    Repo.updateSettings(gid, {
      cooldown_seconds: cooldown, max_open: maxOpen, name_pattern: values.name_pattern,
      transcript_format: values.transcript_format as Repo.TicketSettings['transcript_format'],
    });
    return renderTo(submit, renderSettingsOverview(sessionId, gid));
  }

  if (action === 'toggles' && interaction.isButton()) {
    const s = Repo.getSettings(gid);
    const embed = new EmbedBuilder().setTitle(twg(gid, 'settings.toggles_title')).setColor('#5865f2').setDescription(twg(gid, 'settings.toggles_desc'));
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(buildCustomId(sessionId, 'set', 'toggledm')).setLabel(twg(gid, 'settings.t_dm', { state: s.dm_on_close ? twg(gid, 'common.on') : twg(gid, 'common.off') })).setStyle(s.dm_on_close ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(buildCustomId(sessionId, 'set', 'togglebranding')).setLabel(twg(gid, 'settings.t_branding', { state: s.remove_branding ? twg(gid, 'common.on') : twg(gid, 'common.off') })).setStyle(s.remove_branding ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(buildCustomId(sessionId, 'set', 'togglesurvey')).setLabel(twg(gid, 'settings.t_survey', { state: s.survey_enabled ? twg(gid, 'common.on') : twg(gid, 'common.off') })).setStyle(s.survey_enabled ? ButtonStyle.Success : ButtonStyle.Secondary),
    );
    return renderTo(interaction, { embeds: [embed], components: [row, navRow(sessionId, 'set:overview')] });
  }
  if (action === 'toggledm' && interaction.isButton()) {
    const s = Repo.getSettings(gid);
    Repo.updateSettings(gid, { dm_on_close: !s.dm_on_close });
    return handleSettingsSection(interaction, sessionId, 'toggles');
  }
  if (action === 'togglebranding' && interaction.isButton()) {
    const s = Repo.getSettings(gid);
    Repo.updateSettings(gid, { remove_branding: !s.remove_branding });
    return handleSettingsSection(interaction, sessionId, 'toggles');
  }
  if (action === 'togglesurvey' && interaction.isButton()) {
    const s = Repo.getSettings(gid);
    Repo.updateSettings(gid, { survey_enabled: !s.survey_enabled });
    return handleSettingsSection(interaction, sessionId, 'toggles');
  }

  if (action === 'autoclose' && interaction.isButton()) {
    const s = Repo.getSettings(gid);
    const result = await promptModal(interaction, buildCustomId(sessionId, 'set', 'autoclosemodal'), twg(gid, 'settings.autoclose_modal'), [
      { id: 'enabled', label: twg(gid, 'settings.f_enabled'), required: true, maxLength: 4, value: s.autoclose_enabled ? 'yes' : 'no' },
      { id: 'hours', label: twg(gid, 'settings.f_hours'), required: true, maxLength: 3, value: String(s.autoclose_hours) },
    ]);
    if (!result) return;
    const { values, submit } = result;
    const enabled = ['ja','yes','oui','да','true','1'].includes(values.enabled.trim().toLowerCase());
    const hours = parseInt(values.hours, 10);
    if (isNaN(hours) || hours < 1 || hours > 720) {
      await submit.reply({ embeds: [error(twg(gid, 'settings.err_value'), twg(gid, 'settings.err_hours_desc'))], flags: MessageFlags.Ephemeral });
      return;
    }
    Repo.updateSettings(gid, { autoclose_enabled: enabled, autoclose_hours: hours });
    return renderTo(submit, renderSettingsOverview(sessionId, gid));
  }

  if (action === 'supporthours' && interaction.isButton()) {
    const s = Repo.getSettings(gid);
    const result = await promptModal(interaction, buildCustomId(sessionId, 'set', 'supporthoursmodal'), twg(gid, 'settings.support_modal'), [
      { id: 'enabled', label: twg(gid, 'settings.f_enabled'), required: true, maxLength: 4, value: s.support_hours_enabled ? 'yes' : 'no' },
      { id: 'start', label: twg(gid, 'settings.f_start'), maxLength: 5, value: s.support_hours_start ?? '' },
      { id: 'end', label: twg(gid, 'settings.f_end'), maxLength: 5, value: s.support_hours_end ?? '' },
    ]);
    if (!result) return;
    const { values, submit } = result;
    const enabled = ['ja','yes','oui','да','true','1'].includes(values.enabled.trim().toLowerCase());
    if (values.start && !TIME_REGEX.test(values.start)) {
      await submit.reply({ embeds: [error(twg(gid, 'settings.err_start'), twg(gid, 'settings.err_start_desc'))], flags: MessageFlags.Ephemeral });
      return;
    }
    if (values.end && !TIME_REGEX.test(values.end)) {
      await submit.reply({ embeds: [error(twg(gid, 'settings.err_end'), twg(gid, 'settings.err_end_desc'))], flags: MessageFlags.Ephemeral });
      return;
    }
    Repo.updateSettings(gid, { support_hours_enabled: enabled, support_hours_start: values.start || null, support_hours_end: values.end || null });
    return renderTo(submit, renderSettingsOverview(sessionId, gid));
  }

  if (action === 'staffaccess' && interaction.isButton()) {
    const s = Repo.getSettings(gid);
    const embed = new EmbedBuilder()
      .setTitle(twg(gid, 'settings.staffaccess_title'))
      .setColor('#5865f2')
      .setDescription(twg(gid, 'settings.staffaccess_desc'))
      .addFields(
        { name: twg(gid, 'settings.staffaccess_admin_field'), value: s.admin_role_id ? `<@&${s.admin_role_id}>` : '—', inline: true },
        { name: twg(gid, 'settings.staffaccess_fallback_field'), value: s.fallback_staff_role_id ? `<@&${s.fallback_staff_role_id}>` : '—', inline: true },
      );

    const adminSelect = new RoleSelectMenuBuilder().setCustomId(buildCustomId(sessionId, 'set', 'setadminrole')).setPlaceholder(twg(gid, 'settings.staffaccess_admin_placeholder'));
    const fallbackSelect = new RoleSelectMenuBuilder().setCustomId(buildCustomId(sessionId, 'set', 'setfallbackrole')).setPlaceholder(twg(gid, 'settings.staffaccess_fallback_placeholder'));
    const clearRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(buildCustomId(sessionId, 'set', 'setadminrole', 'clear')).setLabel(twg(gid, 'settings.staffaccess_clear_admin')).setStyle(ButtonStyle.Secondary).setDisabled(!s.admin_role_id),
      new ButtonBuilder().setCustomId(buildCustomId(sessionId, 'set', 'setfallbackrole', 'clear')).setLabel(twg(gid, 'settings.staffaccess_clear_fallback')).setStyle(ButtonStyle.Secondary).setDisabled(!s.fallback_staff_role_id),
    );

    return renderTo(interaction, {
      embeds: [embed],
      components: [
        new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(adminSelect),
        new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(fallbackSelect),
        clearRow,
        navRow(sessionId, 'set:overview'),
      ],
    });
  }
  if (action === 'setadminrole') {
    const roleId = interaction.isButton() ? null : (interaction.isRoleSelectMenu() ? interaction.values[0] : undefined);
    if (roleId === undefined) return;
    Repo.updateSettings(gid, { admin_role_id: roleId });
    return handleSettingsSection(interaction, sessionId, 'staffaccess');
  }
  if (action === 'setfallbackrole') {
    const roleId = interaction.isButton() ? null : (interaction.isRoleSelectMenu() ? interaction.values[0] : undefined);
    if (roleId === undefined) return;
    Repo.updateSettings(gid, { fallback_staff_role_id: roleId });
    return handleSettingsSection(interaction, sessionId, 'staffaccess');
  }

  if (action === 'overview') return renderTo(interaction, renderSettingsOverview(sessionId, gid));
}
