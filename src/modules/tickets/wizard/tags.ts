/**
 * modules/tickets/wizard/tags.ts
 *
 * Tag (saved-reply) MANAGEMENT — create/edit/delete/list. Deliberately
 * doesn't include "use a tag", since that's a fast, high-frequency action
 * staff need mid-conversation inside an actual ticket — burying it behind
 * a multi-click admin wizard would make it slower to use, not easier. That
 * stays a lightweight live command: /ticket tag name:<x>.
 */

import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder,
  EmbedBuilder, MessageFlags, TextInputStyle,
} from 'discord.js';
import * as Repo from '../repository';
import { success, error } from '../../../utils/embeds';
import { buildCustomId, getSession } from './session';
import { navRow, promptModal, renderTo, WizardComponentInteraction, WizardView } from './helpers';
import { tw, twg } from './i18n';

export function renderTagList(sessionId: string, guildId: string): WizardView {
  const tags = Repo.listTags(guildId);

  const embed = new EmbedBuilder()
    .setTitle(twg(guildId, 'tags.list_title'))
    .setColor('#5865f2')
    .setDescription(twg(guildId, 'tags.list_desc'))
    .addFields(tags.length > 0
      ? tags.slice(0, 25).map(t => ({ name: t.name, value: t.content.slice(0, 100) + (t.content.length > 100 ? '…' : '') }))
      : [{ name: twg(guildId, 'tags.none_title'), value: twg(guildId, 'tags.none_desc') }]);

  const components: ActionRowBuilder<any>[] = [];
  if (tags.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(buildCustomId(sessionId, 'tag', 'pick'))
      .setPlaceholder(twg(guildId, 'tags.pick_placeholder'))
      .addOptions(tags.slice(0, 25).map(t => ({ label: t.name.slice(0, 100), value: t.name })));
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
  }
  components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buildCustomId(sessionId, 'tag', 'create')).setLabel(twg(guildId, 'tags.create_btn')).setStyle(ButtonStyle.Success),
  ));
  components.push(navRow(sessionId, 'menu'));

  return { embeds: [embed], components };
}

function renderTagDetail(sessionId: string, guildId: string, name: string): WizardView {
  const tag = Repo.getTag(guildId, name);
  if (!tag) return { embeds: [error(twg(guildId, 'common.not_found_title'), twg(guildId, 'tags.not_found'))], components: [navRow(sessionId, 'tag:list')] };

  const embed = new EmbedBuilder().setTitle(twg(guildId, 'tags.detail_title', { name: tag.name })).setColor('#5865f2').addFields(
    { name: twg(guildId, 'tags.f_content'), value: tag.content.slice(0, 1024) },
    { name: twg(guildId, 'tags.f_created_by'), value: `<@${tag.created_by}>`, inline: true },
  );
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buildCustomId(sessionId, 'tag', 'edit', name)).setLabel(twg(guildId, 'tags.btn_edit')).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(buildCustomId(sessionId, 'tag', 'remove', name)).setLabel(twg(guildId, 'tags.btn_remove')).setStyle(ButtonStyle.Danger),
  );
  return { embeds: [embed], components: [row, navRow(sessionId, 'tag:list')] };
}

export async function handleTagSection(interaction: WizardComponentInteraction, sessionId: string, action: string, args: string[]): Promise<void> {
  const session = getSession(sessionId)!;
  const gid = session.guildId;

  if (action === 'list') return renderTo(interaction, renderTagList(sessionId, gid));

  if (action === 'pick' && interaction.isStringSelectMenu()) {
    return renderTo(interaction, renderTagDetail(sessionId, gid, interaction.values[0]));
  }

  if (action === 'create' && interaction.isButton()) {
    const result = await promptModal(interaction, buildCustomId(sessionId, 'tag', 'createmodal'), tw(sessionId, 'tags.create_modal'), [
      { id: 'name', label: tw(sessionId, 'tags.m_name'), required: true, maxLength: 50 },
      { id: 'content', label: tw(sessionId, 'tags.m_content'), style: TextInputStyle.Paragraph, required: true, maxLength: 1500 },
    ]);
    if (!result) return;
    const { values, submit } = result;
    const created = Repo.createTag({ guild_id: gid, name: values.name.trim(), content: values.content, created_by: interaction.user.id });
    if (!created) {
      await submit.reply({ embeds: [error(twg(gid, 'tags.name_taken_title'), twg(gid, 'tags.name_taken_desc', { name: values.name }))], flags: MessageFlags.Ephemeral });
      return;
    }
    return renderTo(submit, renderTagDetail(sessionId, gid, created.name));
  }

  const name = args[0];
  if (!name) return;

  if (action === 'edit' && interaction.isButton()) {
    const tag = Repo.getTag(gid, name);
    if (!tag) return;
    const result = await promptModal(interaction, buildCustomId(sessionId, 'tag', 'editmodal', name), tw(sessionId, 'tags.edit_modal', { name }), [
      { id: 'content', label: tw(sessionId, 'tags.m_content'), style: TextInputStyle.Paragraph, required: true, maxLength: 1500, value: tag.content },
    ]);
    if (!result) return;
    const { values, submit } = result;
    Repo.updateTag(gid, name, values.content);
    return renderTo(submit, renderTagDetail(sessionId, gid, name));
  }

  if (action === 'remove' && interaction.isButton()) {
    Repo.deleteTag(gid, name);
    return renderTo(interaction, { embeds: [success(twg(gid, 'tags.removed_title'), twg(gid, 'tags.removed_desc', { name }))], components: [navRow(sessionId, 'tag:list')] });
  }
}
