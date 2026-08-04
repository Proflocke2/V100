/**
 * modules/moderation/antiNukeWizard.ts
 *
 * Guided menu for Anti-Nuke — covers everything the old `/security antinuke`
 * subcommand group did (setup, whitelist, unwhitelist, whitelist-list,
 * incidents, status) via clicks instead of typed options/user IDs. Same
 * underlying antiNuke.ts functions throughout. All user-facing text goes
 * through tGuild() (antinuke namespace, en/de/fr/ru).
 */

import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ChannelSelectMenuBuilder, ChannelType, UserSelectMenuBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder, MessageFlags, ChatInputCommandInteraction, TextInputStyle,
} from 'discord.js';
import {
  getAntiNukeConfig, updateAntiNukeConfig,
  addToWhitelist, removeFromWhitelist, getWhitelist, getIncidents, isWhitelisted,
} from './antiNuke';
import { success, error, info } from '../../utils/embeds';
import {
  createSession, getSession, endSession, touchSession, parseWizardId, buildWizardId,
  navRow, promptModal, renderTo, expiredView, noPermissionView,
  WizardComponentInteraction, WizardView,
} from '../../utils/wizardKit';
import { logConfigChange } from '../audit/configAudit';
import { tGuild } from '../../i18n';

const PREFIX = 'anw';
const ACTIONS: Array<'ban' | 'kick' | 'strip'> = ['ban', 'kick', 'strip'];

export function isAntiNukeWizardComponent(customId: string): boolean {
  return customId.startsWith(`${PREFIX}:`);
}

export async function startAntiNukeWizard(ix: ChatInputCommandInteraction): Promise<void> {
  const sessionId = createSession(PREFIX, ix.guildId!, ix.user.id);
  await ix.reply({ ...renderMainMenu(sessionId, ix.guildId!), flags: MessageFlags.Ephemeral });
}

function renderMainMenu(sessionId: string, guildId: string): WizardView {
  const cfg = getAntiNukeConfig(guildId);
  const wl = getWhitelist(guildId);
  const t = (k: string, vars?: Record<string, string | number>) => tGuild(guildId, `antinuke.${k}`, vars);

  const embed = new EmbedBuilder()
    .setTitle(t('menu_title'))
    .setColor(cfg.enabled ? '#57f287' : '#ed4245')
    .setDescription(t('menu_desc'))
    .addFields(
      { name: t('f_status'),      value: cfg.enabled ? t('status_on') : t('status_off'), inline: true },
      { name: t('f_action'),      value: cfg.action, inline: true },
      { name: t('f_log_channel'), value: cfg.log_channel_id ? `<#${cfg.log_channel_id}>` : '—', inline: true },
      { name: t('f_window'),      value: `${cfg.window_seconds}s`, inline: true },
      { name: t('f_limits'),      value: t('limits_value', { ch: cfg.channel_delete_limit, role: cfg.role_delete_limit, ban: cfg.ban_limit, webhook: cfg.webhook_limit }) },
      { name: t('f_whitelist'),   value: t('whitelist_count', { count: wl.length }), inline: true },
    );

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buildWizardId(PREFIX, sessionId, 'main', 'toggle')).setLabel(cfg.enabled ? t('btn_disable') : t('btn_enable')).setStyle(cfg.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId(buildWizardId(PREFIX, sessionId, 'main', 'action')).setLabel(t('btn_action', { action: cfg.action })).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(buildWizardId(PREFIX, sessionId, 'main', 'channel')).setLabel(t('btn_log_channel')).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(buildWizardId(PREFIX, sessionId, 'main', 'limits')).setLabel(t('btn_limits')).setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buildWizardId(PREFIX, sessionId, 'wl', 'menu')).setLabel(t('btn_whitelist')).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(buildWizardId(PREFIX, sessionId, 'incidents', 'show')).setLabel(t('btn_incidents')).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(buildWizardId(PREFIX, sessionId, 'nav', 'close')).setLabel(t('btn_close')).setStyle(ButtonStyle.Danger),
  );

  return { embeds: [embed], components: [row1, row2] };
}

function renderWhitelistMenu(sessionId: string, guildId: string): WizardView {
  const wl = getWhitelist(guildId);
  const t = (k: string, vars?: Record<string, string | number>) => tGuild(guildId, `antinuke.${k}`, vars);
  const embed = new EmbedBuilder().setTitle(t('wl_title')).setColor('#5865f2')
    .setDescription(t('wl_desc'))
    .addFields({ name: t('wl_current', { count: wl.length }), value: wl.length > 0 ? wl.map(e => t('wl_row', { user: e.user_id, by: e.added_by, at: e.added_at })).join('\n') : t('wl_none') });

  const components: ActionRowBuilder<any>[] = [
    new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
      new UserSelectMenuBuilder().setCustomId(buildWizardId(PREFIX, sessionId, 'wl', 'add')).setPlaceholder(t('wl_add_placeholder')),
    ),
  ];
  if (wl.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(buildWizardId(PREFIX, sessionId, 'wl', 'remove'))
      .setPlaceholder(t('wl_remove_placeholder'))
      .addOptions(wl.slice(0, 25).map(e => ({ label: e.user_id, value: e.user_id })));
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
  }
  components.push(navRow(PREFIX, sessionId, 'menu'));
  return { embeds: [embed], components };
}

function renderIncidents(guildId: string): EmbedBuilder {
  const incidents = getIncidents(guildId);
  const t = (k: string, vars?: Record<string, string | number>) => tGuild(guildId, `antinuke.${k}`, vars);
  const embed = new EmbedBuilder().setColor('#ed4245').setTitle(t('incidents_title'));
  if (incidents.length === 0) {
    embed.setDescription(t('incidents_none'));
  } else {
    embed.setDescription(incidents.map(i => t('incident_row', { id: i.id, at: i.created_at, attacker: i.attacker_id, event: i.event_type, count: i.count, action: i.action_taken })).join('\n\n'));
  }
  return embed;
}

export async function handleAntiNukeWizardComponent(interaction: WizardComponentInteraction): Promise<void> {
  const { sessionId, section, action, args } = parseWizardId(interaction.customId);
  const session = getSession(PREFIX, sessionId);

  if (!session) { await renderTo(interaction, expiredView()); return; }
  if (interaction.user.id !== session.userId) { await renderTo(interaction, noPermissionView()); return; }
  touchSession(PREFIX, sessionId);
  const gid = session.guildId;
  const t = (k: string, vars?: Record<string, string | number>) => tGuild(gid, `antinuke.${k}`, vars);

  if (section === 'nav') {
    if (action === 'back') { await renderTo(interaction, renderMainMenu(sessionId, gid)); return; }
    if (action === 'close') {
      endSession(PREFIX, sessionId);
      if (interaction.isButton()) await interaction.update({ embeds: [success(t('closed_title'), t('closed_desc'))], components: [] }).catch(() => {});
      return;
    }
    return;
  }

  if (section === 'incidents' && action === 'show' && interaction.isButton()) {
    await renderTo(interaction, { embeds: [renderIncidents(gid)], components: [navRow(PREFIX, sessionId, 'menu')] });
    return;
  }

  if (section === 'main') {
    if (action === 'toggle' && interaction.isButton()) {
      const cfg = getAntiNukeConfig(gid);
      updateAntiNukeConfig(gid, { enabled: cfg.enabled ? 0 : 1 });
      logConfigChange(gid, interaction.user.id, 'antinuke_toggled', cfg.enabled ? 'off' : 'on');
      await renderTo(interaction, renderMainMenu(sessionId, gid));
      return;
    }
    if (action === 'action' && interaction.isButton()) {
      const cfg = getAntiNukeConfig(gid);
      const idx = ACTIONS.indexOf(cfg.action as any);
      const next = ACTIONS[(idx + 1) % ACTIONS.length];
      updateAntiNukeConfig(gid, { action: next });
      logConfigChange(gid, interaction.user.id, 'antinuke_action_changed', next);
      await renderTo(interaction, renderMainMenu(sessionId, gid));
      return;
    }
    if (action === 'channel' && interaction.isButton()) {
      const embed = new EmbedBuilder().setTitle(t('channel_title')).setColor('#5865f2').setDescription(t('channel_desc'));
      const select = new ChannelSelectMenuBuilder().setCustomId(buildWizardId(PREFIX, sessionId, 'main', 'setchannel')).setPlaceholder(t('channel_pick')).addChannelTypes(ChannelType.GuildText);
      await renderTo(interaction, { embeds: [embed], components: [new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(select), navRow(PREFIX, sessionId, 'menu')] });
      return;
    }
    if (action === 'setchannel' && interaction.isChannelSelectMenu()) {
      updateAntiNukeConfig(gid, { log_channel_id: interaction.values[0] });
      logConfigChange(gid, interaction.user.id, 'antinuke_log_channel_changed', `<#${interaction.values[0]}>`);
      await renderTo(interaction, renderMainMenu(sessionId, gid));
      return;
    }
    if (action === 'limits' && interaction.isButton()) {
      const cfg = getAntiNukeConfig(gid);
      const result = await promptModal(interaction, buildWizardId(PREFIX, sessionId, 'main', 'limitsmodal'), t('limits_modal_title'), [
        { id: 'window', label: t('m_window'), required: true, maxLength: 3, value: String(cfg.window_seconds) },
        { id: 'chdel', label: t('m_chdel'), required: true, maxLength: 3, value: String(cfg.channel_delete_limit) },
        { id: 'roledel', label: t('m_roledel'), required: true, maxLength: 3, value: String(cfg.role_delete_limit) },
        { id: 'bans', label: t('m_bans'), required: true, maxLength: 3, value: String(cfg.ban_limit) },
        { id: 'webhooks', label: t('m_webhooks'), required: true, maxLength: 3, value: String(cfg.webhook_limit) },
      ]);
      if (!result) return;
      const { values, submit } = result;

      const window   = parseInt(values.window, 10);
      const chdel    = parseInt(values.chdel, 10);
      const roledel  = parseInt(values.roledel, 10);
      const bans     = parseInt(values.bans, 10);
      const webhooks = parseInt(values.webhooks, 10);

      const checks: Array<[boolean, string]> = [
        [isNaN(window) || window < 5 || window > 60, t('err_window')],
        [isNaN(chdel) || chdel < 1 || chdel > 20, t('err_chdel')],
        [isNaN(roledel) || roledel < 1 || roledel > 20, t('err_roledel')],
        [isNaN(bans) || bans < 1 || bans > 30, t('err_bans')],
        [isNaN(webhooks) || webhooks < 1 || webhooks > 20, t('err_webhooks')],
      ];
      const failed = checks.find(([bad]) => bad);
      if (failed) {
        await submit.reply({ embeds: [error(t('invalid_value_title'), failed[1])], flags: MessageFlags.Ephemeral });
        return;
      }

      updateAntiNukeConfig(gid, {
        window_seconds: window, channel_delete_limit: chdel, role_delete_limit: roledel,
        ban_limit: bans, webhook_limit: webhooks,
      });
      logConfigChange(gid, submit.user.id, 'antinuke_limits_changed', `window=${window}s ch=${chdel} role=${roledel} ban=${bans} webhook=${webhooks}`);
      await renderTo(submit, renderMainMenu(sessionId, gid));
      return;
    }
  }

  if (section === 'wl') {
    if (action === 'menu') { await renderTo(interaction, renderWhitelistMenu(sessionId, gid)); return; }
    if (action === 'add' && interaction.isUserSelectMenu()) {
      const userId = interaction.values[0];
      if (userId === interaction.guild?.ownerId) {
        await renderTo(interaction, { embeds: [info(t('already_exempt_title'), t('already_exempt_desc'))], components: [navRow(PREFIX, sessionId, 'menu')] });
        return;
      }
      addToWhitelist(gid, userId, interaction.user.id);
      logConfigChange(gid, interaction.user.id, 'antinuke_whitelist_added', `<@${userId}>`);
      await renderTo(interaction, renderWhitelistMenu(sessionId, gid));
      return;
    }
    if (action === 'remove' && interaction.isStringSelectMenu()) {
      const userId = interaction.values[0];
      if (isWhitelisted(gid, userId)) removeFromWhitelist(gid, userId);
      logConfigChange(gid, interaction.user.id, 'antinuke_whitelist_removed', `<@${userId}>`);
      await renderTo(interaction, renderWhitelistMenu(sessionId, gid));
      return;
    }
  }
}
