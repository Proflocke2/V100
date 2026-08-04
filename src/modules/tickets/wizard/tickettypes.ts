/**
 * modules/tickets/wizard/tickettypes.ts
 *
 * Reusable category templates (ticket_types table) — a saved
 * label/emoji/color/channel/role/welcome combo you can stamp onto new
 * categories quickly instead of re-entering everything each time.
 */

import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ChannelSelectMenuBuilder, ChannelType,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder, MessageFlags,
} from 'discord.js';
import * as Repo from '../repository';
import { success, error } from '../../../utils/embeds';
import { buildCustomId, getSession, touchSession } from './session';
import { navRow, promptModal, renderTo, WizardComponentInteraction, WizardView } from './helpers';
import { tw, twg } from './i18n';

export function renderTypeList(sessionId: string, guildId: string): WizardView {
  const types = Repo.listTicketTypes(guildId);

  const embed = new EmbedBuilder()
    .setTitle(twg(guildId, 'types.list_title'))
    .setColor('#5865f2')
    .setDescription(twg(guildId, 'types.list_desc'))
    .addFields(types.length > 0
      ? types.map(t => ({ name: `${t.emoji ?? '🎫'} ${t.label}`, value: `${twg(guildId, 'types.opt_id')}: \`${t.custom_id}\` • <#${t.category_id}>${t.support_role_id ? ` • <@&${t.support_role_id}>` : ''}`, inline: false }))
      : [{ name: twg(guildId, 'types.none_title'), value: twg(guildId, 'types.none_desc') }]);

  const components: ActionRowBuilder<any>[] = [];
  if (types.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(buildCustomId(sessionId, 'type', 'pick'))
      .setPlaceholder(twg(guildId, 'types.pick_placeholder'))
      .addOptions(types.slice(0, 25).map(t => ({ label: t.label.slice(0, 100), value: t.custom_id, description: `${twg(guildId, 'types.opt_id')}: ${t.custom_id}`.slice(0, 100) })));
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
  }
  components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buildCustomId(sessionId, 'type', 'create')).setLabel(twg(guildId, 'types.create_btn')).setStyle(ButtonStyle.Success),
  ));
  components.push(navRow(sessionId, 'menu'));

  return { embeds: [embed], components };
}

function renderCreateChannelStep(sessionId: string): WizardView {
  const embed = new EmbedBuilder().setTitle(tw(sessionId, 'types.create2_title')).setColor('#5865f2').setDescription(tw(sessionId, 'types.create2_desc'));
  const select = new ChannelSelectMenuBuilder().setCustomId(buildCustomId(sessionId, 'type', 'createchannel')).setPlaceholder(tw(sessionId, 'types.create2_pick')).addChannelTypes(ChannelType.GuildCategory);
  return { embeds: [embed], components: [new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(select), navRow(sessionId, 'type:list')] };
}

function renderCreateRoleStep(sessionId: string): WizardView {
  const embed = new EmbedBuilder().setTitle(tw(sessionId, 'types.create3_title')).setColor('#5865f2').setDescription(tw(sessionId, 'types.create3_desc'));
  const select = new RoleSelectMenuBuilder().setCustomId(buildCustomId(sessionId, 'type', 'createrole')).setPlaceholder(tw(sessionId, 'types.create3_pick'));
  const skip = new ButtonBuilder().setCustomId(buildCustomId(sessionId, 'type', 'createrole', 'skip')).setLabel(tw(sessionId, 'common.skip')).setStyle(ButtonStyle.Secondary);
  return { embeds: [embed], components: [new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(select), new ActionRowBuilder<ButtonBuilder>().addComponents(skip), navRow(sessionId, 'type:list')] };
}

export async function handleTicketTypeSection(interaction: WizardComponentInteraction, sessionId: string, action: string, args: string[]): Promise<void> {
  const session = getSession(sessionId)!;
  const gid = session.guildId;

  if (action === 'create' && interaction.isButton()) {
    const result = await promptModal(interaction, buildCustomId(sessionId, 'type', 'createmodal'), tw(sessionId, 'types.create1_modal'), [
      { id: 'custom_id', label: tw(sessionId, 'types.m_customid'), required: true, maxLength: 50 },
      { id: 'label', label: tw(sessionId, 'types.m_label'), required: true, maxLength: 100 },
      { id: 'emoji', label: tw(sessionId, 'types.m_emoji'), maxLength: 20 },
      { id: 'color', label: tw(sessionId, 'types.m_color'), maxLength: 10, value: 'primary' },
    ]);
    if (!result) return;
    const { values, submit } = result;
    if (!['primary', 'secondary', 'success', 'danger'].includes(values.color || 'primary')) {
      await submit.reply({ embeds: [error(twg(gid, 'types.invalid_color_title'), twg(gid, 'types.invalid_color_desc'))], flags: MessageFlags.Ephemeral });
      return;
    }
    session.data.pendingType = { customId: values.custom_id.trim().replace(/\s+/g, '-'), label: values.label, emoji: values.emoji.trim() || null, color: values.color || 'primary' };
    touchSession(sessionId);
    return renderTo(submit, renderCreateChannelStep(sessionId));
  }

  if (action === 'createchannel' && interaction.isChannelSelectMenu()) {
    const pending = session.data.pendingType as any;
    if (!pending) return;
    pending.categoryId = interaction.values[0];
    touchSession(sessionId);
    return renderTo(interaction, renderCreateRoleStep(sessionId));
  }

  if (action === 'createrole') {
    const pending = session.data.pendingType as any;
    if (!pending) return;
    const roleId = args[0] === 'skip' ? null : (interaction.isRoleSelectMenu() ? interaction.values[0] : null);

    Repo.upsertTicketType({
      custom_id: pending.customId, guild_id: gid, label: pending.label, emoji: pending.emoji,
      color: pending.color, category_id: pending.categoryId, support_role_id: roleId, welcome_message: null,
    });
    delete session.data.pendingType;

    return renderTo(interaction, { embeds: [success(twg(gid, 'types.created_title'), twg(gid, 'types.created_desc', { label: pending.label }))], components: [navRow(sessionId, 'type:list')] });
  }

  if (action === 'pick' && interaction.isStringSelectMenu()) {
    const customId = interaction.values[0];
    const type = Repo.getTicketType(gid, customId);
    if (!type) return renderTo(interaction, renderTypeList(sessionId, gid));
    Repo.deleteTicketType(gid, customId);
    return renderTo(interaction, { embeds: [success(twg(gid, 'types.deleted_title'), twg(gid, 'types.deleted_desc', { label: type.label }))], components: [navRow(sessionId, 'type:list')] });
  }

  if (action === 'list') return renderTo(interaction, renderTypeList(sessionId, gid));
}
