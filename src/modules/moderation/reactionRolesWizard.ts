/**
 * modules/moderation/reactionRolesWizard.ts
 *
 * Guided menu for /reactionroles — covers create/add/remove/delete/list via
 * clicks instead of typing panel IDs, role IDs, and button styles by hand.
 * Reuses the exact same reaction_role_panels / reaction_role_buttons tables
 * and buildPanelComponents() logic as the original command. All user-facing
 * text goes through tGuild() (reactionroles namespace, en/de/fr/ru).
 */

import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ChannelSelectMenuBuilder, ChannelType, RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder, MessageFlags, TextChannel, TextInputStyle,
  ChatInputCommandInteraction,
} from 'discord.js';
import db from '../../database/db';
import { success, error } from '../../utils/embeds';
import {
  createSession, getSession, endSession, touchSession, parseWizardId, buildWizardId,
  navRow, promptModal, renderTo, expiredView, noPermissionView,
  WizardComponentInteraction, WizardView,
} from '../../utils/wizardKit';
import { logConfigChange } from '../audit/configAudit';
import { tGuild } from '../../i18n';

// ── DB schema (unchanged from the original flat-command version) ─────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS reaction_role_panels (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id    TEXT    NOT NULL,
    channel_id  TEXT    NOT NULL,
    message_id  TEXT    NOT NULL,
    title       TEXT    NOT NULL,
    description TEXT,
    color       TEXT    DEFAULT '#5865f2',
    created_at  INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS reaction_role_buttons (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    panel_id  INTEGER NOT NULL,
    guild_id  TEXT    NOT NULL,
    role_id   TEXT    NOT NULL,
    label     TEXT    NOT NULL,
    emoji     TEXT,
    style     TEXT    DEFAULT 'primary',
    FOREIGN KEY (panel_id) REFERENCES reaction_role_panels(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_rrp_guild ON reaction_role_panels(guild_id);
  CREATE INDEX IF NOT EXISTS idx_rrb_panel ON reaction_role_buttons(panel_id);
`);

const PREFIX = 'rrw';
const VALID_HEX = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
const STYLES = ['primary', 'secondary', 'success', 'danger'] as const;
const STYLE_MAP: Record<string, ButtonStyle> = {
  primary: ButtonStyle.Primary, secondary: ButtonStyle.Secondary,
  success: ButtonStyle.Success, danger: ButtonStyle.Danger,
};

interface RRPanel {
  id: number; guild_id: string; channel_id: string; message_id: string;
  title: string; description: string | null; color: string;
}
interface RRButton {
  id: number; panel_id: number; guild_id: string;
  role_id: string; label: string; emoji: string | null; style: string;
}

function getPanel(id: number): RRPanel | null {
  return db.prepare('SELECT * FROM reaction_role_panels WHERE id = ?').get(id) as RRPanel | null;
}
function listPanels(guildId: string): RRPanel[] {
  return db.prepare('SELECT * FROM reaction_role_panels WHERE guild_id = ? ORDER BY id').all(guildId) as RRPanel[];
}
function getButtons(panelId: number): RRButton[] {
  return db.prepare('SELECT * FROM reaction_role_buttons WHERE panel_id = ?').all(panelId) as RRButton[];
}
function buildPanelComponents(buttons: RRButton[]): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < buttons.length; i += 5) {
    const chunk = buttons.slice(i, i + 5);
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
      ...chunk.map(b => {
        const btn = new ButtonBuilder().setCustomId(`rr:toggle:${b.role_id}`).setLabel(b.label).setStyle(STYLE_MAP[b.style] ?? ButtonStyle.Primary);
        if (b.emoji) btn.setEmoji(b.emoji);
        return btn;
      }),
    ));
  }
  return rows;
}
async function refreshPanelMessage(guild: import('discord.js').Guild, panel: RRPanel): Promise<void> {
  const ch = guild.channels.cache.get(panel.channel_id) as TextChannel | undefined;
  const msg = await ch?.messages.fetch(panel.message_id).catch(() => null);
  if (msg) await msg.edit({ components: buildPanelComponents(getButtons(panel.id)) }).catch(() => {});
}

export function isReactionRolesWizardComponent(customId: string): boolean {
  return customId.startsWith(`${PREFIX}:`);
}

export async function startReactionRolesWizard(ix: ChatInputCommandInteraction): Promise<void> {
  const sessionId = createSession(PREFIX, ix.guildId!, ix.user.id);
  await ix.reply({ ...renderPanelList(sessionId, ix.guildId!), flags: MessageFlags.Ephemeral });
}

function renderPanelList(sessionId: string, guildId: string): WizardView {
  const panels = listPanels(guildId);
  const t = (k: string, vars?: Record<string, string | number>) => tGuild(guildId, `reactionroles.${k}`, vars);
  const embed = new EmbedBuilder().setTitle(t('list_title')).setColor('#5865f2')
    .setDescription(panels.length === 0 ? t('list_none') : t('list_desc'));

  const components: ActionRowBuilder<any>[] = [];
  if (panels.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(buildWizardId(PREFIX, sessionId, 'panel', 'pick'))
      .setPlaceholder(t('pick_placeholder'))
      .addOptions(panels.slice(0, 25).map(p => ({ label: p.title.slice(0, 100), value: String(p.id), description: `[${p.id}] ${getButtons(p.id).length} ${t('opt_buttons')}`.slice(0, 100) })));
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
  }
  components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buildWizardId(PREFIX, sessionId, 'panel', 'create')).setLabel(t('create_btn')).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(buildWizardId(PREFIX, sessionId, 'nav', 'close')).setLabel(t('close_btn')).setStyle(ButtonStyle.Danger),
  ));
  return { embeds: [embed], components };
}

function renderPanelDetail(sessionId: string, panelId: number): WizardView {
  const gid = getSession(PREFIX, sessionId)?.guildId ?? '0';
  const t = (k: string, vars?: Record<string, string | number>) => tGuild(gid, `reactionroles.${k}`, vars);
  const panel = getPanel(panelId);
  if (!panel) return { embeds: [error(t('not_found_title'), t('not_found'))], components: [navRow(PREFIX, sessionId, 'list')] };
  const buttons = getButtons(panelId);

  const embed = new EmbedBuilder().setTitle(t('detail_title', { title: panel.title })).setColor((panel.color as any) || '#5865f2')
    .addFields(
      { name: t('f_id'), value: `\`${panel.id}\``, inline: true },
      { name: t('f_channel'), value: `<#${panel.channel_id}>`, inline: true },
      { name: t('f_buttons', { count: buttons.length }), value: buttons.length > 0 ? buttons.map(b => `${b.emoji ?? ''} **${b.label}** → <@&${b.role_id}>`.trim()).join('\n') : t('buttons_none') },
    );

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(buildWizardId(PREFIX, sessionId, 'btn', 'add', panelId)).setLabel(t('btn_add')).setStyle(ButtonStyle.Success).setDisabled(buttons.length >= 25),
    new ButtonBuilder().setCustomId(buildWizardId(PREFIX, sessionId, 'panel', 'delete', panelId)).setLabel(t('btn_delete_panel')).setStyle(ButtonStyle.Danger),
  );
  const components: ActionRowBuilder<any>[] = [row1];
  if (buttons.length > 0) {
    const select = new StringSelectMenuBuilder()
      .setCustomId(buildWizardId(PREFIX, sessionId, 'btn', 'remove', panelId))
      .setPlaceholder(t('remove_placeholder'))
      .addOptions(buttons.slice(0, 25).map(b => ({ label: b.label.slice(0, 100), value: String(b.id), description: `${t('opt_role')}: ${b.role_id}`.slice(0, 100) })));
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
  }
  components.push(navRow(PREFIX, sessionId, 'list'));
  return { embeds: [embed], components };
}

function renderCreateChannelStep(sessionId: string): WizardView {
  const gid = getSession(PREFIX, sessionId)?.guildId ?? '0';
  const t = (k: string) => tGuild(gid, `reactionroles.${k}`);
  const embed = new EmbedBuilder().setTitle(t('create2_title')).setColor('#5865f2').setDescription(t('create2_desc'));
  const select = new ChannelSelectMenuBuilder().setCustomId(buildWizardId(PREFIX, sessionId, 'panel', 'createchannel')).setPlaceholder(t('create2_pick')).addChannelTypes(ChannelType.GuildText);
  return { embeds: [embed], components: [new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(select), navRow(PREFIX, sessionId, 'list')] };
}

function renderAddButtonRoleStep(sessionId: string, panelId: number): WizardView {
  const gid = getSession(PREFIX, sessionId)?.guildId ?? '0';
  const t = (k: string) => tGuild(gid, `reactionroles.${k}`);
  const embed = new EmbedBuilder().setTitle(t('addbtn2_title')).setColor('#5865f2').setDescription(t('addbtn2_desc'));
  const select = new RoleSelectMenuBuilder().setCustomId(buildWizardId(PREFIX, sessionId, 'btn', 'addrole', panelId)).setPlaceholder(t('addbtn2_pick'));
  return { embeds: [embed], components: [new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(select), navRow(PREFIX, sessionId, `panel:detail:${panelId}`)] };
}

export async function handleReactionRolesWizardComponent(interaction: WizardComponentInteraction): Promise<void> {
  const { sessionId, section, action, args } = parseWizardId(interaction.customId);
  const session = getSession(PREFIX, sessionId);

  if (!session) { await renderTo(interaction, expiredView()); return; }
  if (interaction.user.id !== session.userId) { await renderTo(interaction, noPermissionView()); return; }
  touchSession(PREFIX, sessionId);
  const gid = session.guildId;
  const t = (k: string, vars?: Record<string, string | number>) => tGuild(gid, `reactionroles.${k}`, vars);

  if (section === 'nav') {
    if (action === 'back') {
      const path = args.join(':');
      if (path.startsWith('panel:detail:')) { await renderTo(interaction, renderPanelDetail(sessionId, Number(path.split(':')[2]))); return; }
      await renderTo(interaction, renderPanelList(sessionId, gid));
      return;
    }
    if (action === 'close') {
      endSession(PREFIX, sessionId);
      if (interaction.isButton()) await interaction.update({ embeds: [success(t('closed_title'), t('closed_desc'))], components: [] }).catch(() => {});
      return;
    }
    return;
  }

  if (section === 'panel') {
    if (action === 'list') { await renderTo(interaction, renderPanelList(sessionId, gid)); return; }
    if (action === 'pick' && interaction.isStringSelectMenu()) { await renderTo(interaction, renderPanelDetail(sessionId, Number(interaction.values[0]))); return; }
    if (action === 'detail') { await renderTo(interaction, renderPanelDetail(sessionId, Number(args[0]))); return; }

    if (action === 'create' && interaction.isButton()) {
      const result = await promptModal(interaction, buildWizardId(PREFIX, sessionId, 'panel', 'createmodal'), t('create1_title'), [
        { id: 'title', label: t('m_title'), required: true, maxLength: 256, value: 'Roles' },
        { id: 'description', label: t('m_desc'), style: TextInputStyle.Paragraph, maxLength: 1000 },
        { id: 'color', label: t('m_color'), maxLength: 7, value: '#5865f2' },
      ]);
      if (!result) return;
      const { values, submit } = result;
      if (values.color && !VALID_HEX.test(values.color)) {
        await submit.reply({ embeds: [error(t('invalid_color_title'), t('invalid_color_desc'))], flags: MessageFlags.Ephemeral });
        return;
      }
      session.data.pendingPanel = { title: values.title || 'Roles', description: values.description.trim() || null, color: values.color || '#5865f2' };
      touchSession(PREFIX, sessionId);
      await renderTo(submit, renderCreateChannelStep(sessionId));
      return;
    }

    if (action === 'createchannel' && interaction.isChannelSelectMenu()) {
      const pending = session.data.pendingPanel as { title: string; description: string | null; color: string } | undefined;
      if (!pending) return;

      try {
        const channel = await interaction.guild!.channels.fetch(interaction.values[0]) as TextChannel;
        const embed = new EmbedBuilder().setTitle(pending.title).setColor(pending.color as any).setFooter({ text: t('footer_hint') });
        if (pending.description) embed.setDescription(pending.description);
        const msg = await channel.send({ embeds: [embed] });

        const res = db.prepare(
          'INSERT INTO reaction_role_panels (guild_id, channel_id, message_id, title, description, color) VALUES (?, ?, ?, ?, ?, ?)',
        ).run(gid, channel.id, msg.id, pending.title, pending.description, pending.color);

        delete session.data.pendingPanel;
        logConfigChange(gid, interaction.user.id, 'reactionrole_panel_created', pending.title);
        await renderTo(interaction, renderPanelDetail(sessionId, Number(res.lastInsertRowid)));
      } catch (err) {
        console.error('[ReactionRolesWizard] create failed:', err);
        await renderTo(interaction, { embeds: [error(t('create_fail_title'), t('create_fail_desc'))], components: [navRow(PREFIX, sessionId, 'list')] });
      }
      return;
    }

    if (action === 'delete' && interaction.isButton()) {
      const panelId = Number(args[0]);
      const panel = getPanel(panelId);
      if (!panel) return;
      const ch = interaction.guild!.channels.cache.get(panel.channel_id) as TextChannel | undefined;
      const msg = await ch?.messages.fetch(panel.message_id).catch(() => null);
      await msg?.delete().catch(() => {});
      db.prepare('DELETE FROM reaction_role_panels WHERE id = ?').run(panelId);
      db.prepare('DELETE FROM reaction_role_buttons WHERE panel_id = ?').run(panelId);
      logConfigChange(gid, interaction.user.id, 'reactionrole_panel_deleted', panel.title);
      await renderTo(interaction, { embeds: [success(t('deleted_title'), t('deleted_desc'))], components: [navRow(PREFIX, sessionId, 'list')] });
      return;
    }
  }

  if (section === 'btn') {
    if (action === 'add' && interaction.isButton()) {
      const panelId = Number(args[0]);
      const result = await promptModal(interaction, buildWizardId(PREFIX, sessionId, 'btn', 'addmodal', panelId), t('addbtn1_title'), [
        { id: 'label', label: t('m_label'), required: true, maxLength: 80, value: 'Role' },
        { id: 'emoji', label: t('m_emoji'), maxLength: 20 },
        { id: 'style', label: t('m_style'), maxLength: 10, value: 'primary' },
      ]);
      if (!result) return;
      const { values, submit } = result;
      if (!STYLES.includes(values.style as any)) {
        await submit.reply({ embeds: [error(t('invalid_style_title'), t('invalid_style_desc'))], flags: MessageFlags.Ephemeral });
        return;
      }
      session.data.pendingButton = { panelId, label: values.label || 'Role', emoji: values.emoji.trim() || null, style: values.style || 'primary' };
      touchSession(PREFIX, sessionId);
      await renderTo(submit, renderAddButtonRoleStep(sessionId, panelId));
      return;
    }

    if (action === 'addrole' && interaction.isRoleSelectMenu()) {
      const panelId = Number(args[0]);
      const pending = session.data.pendingButton as { panelId: number; label: string; emoji: string | null; style: string } | undefined;
      if (!pending) return;

      const roleId = interaction.values[0];
      const existing = getButtons(panelId);
      if (existing.some(b => b.role_id === roleId)) {
        delete session.data.pendingButton;
        await renderTo(interaction, { embeds: [error(t('already_exists_title'), t('already_exists_desc'))], components: [navRow(PREFIX, sessionId, `panel:detail:${panelId}`)] });
        return;
      }
      if (existing.length >= 25) {
        delete session.data.pendingButton;
        await renderTo(interaction, { embeds: [error(t('limit_title'), t('limit_desc'))], components: [navRow(PREFIX, sessionId, `panel:detail:${panelId}`)] });
        return;
      }

      db.prepare('INSERT INTO reaction_role_buttons (panel_id, guild_id, role_id, label, emoji, style) VALUES (?, ?, ?, ?, ?, ?)')
        .run(panelId, gid, roleId, pending.label, pending.emoji, pending.style);
      delete session.data.pendingButton;

      const panel = getPanel(panelId);
      if (panel) await refreshPanelMessage(interaction.guild!, panel);

      await renderTo(interaction, renderPanelDetail(sessionId, panelId));
      return;
    }

    if (action === 'remove' && interaction.isStringSelectMenu()) {
      const panelId = Number(args[0]);
      const buttonId = Number(interaction.values[0]);
      db.prepare('DELETE FROM reaction_role_buttons WHERE id = ?').run(buttonId);

      const panel = getPanel(panelId);
      if (panel) await refreshPanelMessage(interaction.guild!, panel);

      await renderTo(interaction, renderPanelDetail(sessionId, panelId));
      return;
    }
  }
}
