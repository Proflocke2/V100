/**
 * modules/reportStaff/handler.ts
 *
 * The interactive flow: select menu (pick a staff member) → modal (type a
 * reason) → report posted to the private log channel + saved to the DB.
 *
 * Wired into events/interactionCreate.ts via isReportStaffSelect() /
 * isReportStaffModal() — see the two `if` lines added there.
 */

import {
  ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuInteraction,
  ModalBuilder, TextInputBuilder, TextInputStyle, ModalSubmitInteraction,
  EmbedBuilder, TextChannel,
} from 'discord.js';
import { error, success } from '../../utils/embeds';
import * as Repo from './repository';

const SELECT_ID = 'report_staff_select';
const MODAL_PREFIX = 'report_staff_modal_';
const MAX_OPTIONS = 25; // Discord's hard limit per select menu

export function isReportStaffSelect(customId: string): boolean {
  return customId === SELECT_ID;
}
export function isReportStaffModal(customId: string): boolean {
  return customId.startsWith(MODAL_PREFIX);
}

/**
 * Builds the "pick a staff member" select menu for /report-staff file.
 * Returns null with a reason string if it can't be built (role not set,
 * role empty, or too many members and none excludable).
 */
export async function buildStaffSelectRow(
  guild: import('discord.js').Guild,
  excludeUserId: string,
): Promise<{ row: ActionRowBuilder<StringSelectMenuBuilder> } | { errorReason: string }> {
  const cfg = Repo.getConfig(guild.id);
  if (!Repo.isConfigured(cfg)) {
    return { errorReason:
      "This server hasn't set up staff reporting yet. Ask an admin to run `/report-staff config` first." };
  }

  const role = await guild.roles.fetch(cfg.staffRole!).catch(() => null);
  if (!role) {
    return { errorReason: 'The configured staff role no longer exists. Ask an admin to run `/report-staff config` again.' };
  }

  // Members with the staff role, minus the reporter themselves (can't report yourself), minus bots.
  const members = [...role.members.values()].filter(m => m.id !== excludeUserId && !m.user.bot);
  if (members.length === 0) {
    return { errorReason: 'There are no staff members available to report right now.' };
  }

  const options = members.slice(0, MAX_OPTIONS).map(m => ({
    label: m.user.username.slice(0, 100),
    value: m.id,
    description: m.nickname ? `Nickname: ${m.nickname}`.slice(0, 100) : undefined,
  }));

  const menu = new StringSelectMenuBuilder()
    .setCustomId(SELECT_ID)
    .setPlaceholder('Select the staff member you want to report')
    .addOptions(options);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
  return { row };
}

/** Select menu submitted → show the reason modal. */
export async function handleReportStaffSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const accusedId = interaction.values[0];

  const modal = new ModalBuilder()
    .setCustomId(`${MODAL_PREFIX}${accusedId}`)
    .setTitle('Report a Staff Member');

  const reasonInput = new TextInputBuilder()
    .setCustomId('reason')
    .setLabel('What happened? Please be as specific as you can.')
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(10)
    .setMaxLength(1000)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput));
  await interaction.showModal(modal);
}

/** Modal submitted → post the report to the log channel + save it, confirm to the reporter. */
export async function handleReportStaffModal(interaction: ModalSubmitInteraction): Promise<void> {
  if (!interaction.guild) return;
  const accusedId = interaction.customId.slice(MODAL_PREFIX.length);
  const reason = interaction.fields.getTextInputValue('reason').trim();

  await interaction.deferReply({ ephemeral: true });

  const cfg = Repo.getConfig(interaction.guild.id);
  if (!Repo.isConfigured(cfg)) {
    await interaction.editReply({
      embeds: [error('Reporting not set up', "This server hasn't finished setting up staff reporting. Ask an admin to run `/report-staff config`.")],
    });
    return;
  }

  const logChannel = interaction.guild.channels.cache.get(cfg.logChannel!) as TextChannel | undefined;
  if (!logChannel || !logChannel.isTextBased()) {
    await interaction.editReply({
      embeds: [error('Log channel missing', 'The configured report log channel no longer exists. Ask an admin to run `/report-staff config` again. Your report was NOT lost — it has been saved and can be recovered from the database.')],
    });
    // Still record it, so nothing is lost even if the channel is gone.
    Repo.recordReport(interaction.guild.id, interaction.user.id, accusedId, reason);
    return;
  }

  Repo.recordReport(interaction.guild.id, interaction.user.id, accusedId, reason);

  const reportEmbed = new EmbedBuilder()
    .setTitle('🚩 New Staff Report')
    .setColor('#ff6b35')
    .addFields(
      { name: 'Reporter', value: `<@${interaction.user.id}> (${interaction.user.id})`, inline: true },
      { name: 'Accused Staff', value: `<@${accusedId}> (${accusedId})`, inline: true },
      { name: 'Reason', value: reason.slice(0, 1024) },
    )
    .setFooter({ text: cfg.viewerRole ? 'Visible only to the configured High Staff role' : 'Staff Report' })
    .setTimestamp();

  const sent = await logChannel.send({ embeds: [reportEmbed] }).catch(() => null);

  if (!sent) {
    await interaction.editReply({
      embeds: [error('Could not deliver the report', "The bot couldn't send a message in the log channel (missing permissions?). Your report was saved and an admin can still find it — please also let a High Staff member know directly.")],
    });
    return;
  }

  await interaction.editReply({
    embeds: [success('Report submitted', 'Thank you — your report has been sent to the staff team privately. They will follow up if needed.')],
  });
}
