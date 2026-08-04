/**
 * AUTOMOD WIZARD HANDLER
 *
 * Handles all "amw:" button and modal interactions for the /automod wizard.
 * customId format:
 *   Buttons : amw:<section>:<action>:<userId>
 *   Modals  : amwm:<section>:<action>:<userId>
 *
 * Every section renders itself as an ephemeral message the user navigates
 * with buttons. The userId in the customId ensures only the initiating
 * admin can interact.
 */

import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ButtonInteraction, ModalSubmitInteraction, StringSelectMenuBuilder,
  StringSelectMenuInteraction, TextChannel,
} from 'discord.js';
import db, { getGuild, setGuildValue } from '../database/db';
import { getAntiRaidConfig, updateAntiRaidConfig } from '../modules/moderation/antiRaid';
import { getAntiNukeConfig, updateAntiNukeConfig } from '../modules/moderation/antiNuke';
import {
  getSecurityConfig, updateSecurityConfig, SecurityConfig,
  activateUltraMode, deactivateUltraMode, isUltraModeActive,
} from '../modules/security/securityEngine';

// ── Helpers ───────────────────────────────────────────────────────────────────

const ON  = '🟢 On';
const OFF = '🔴 Off';
const flag = (v: number | boolean | undefined) => v ? ON : OFF;

function btn(label: string, id: string, style = ButtonStyle.Primary, disabled = false): ButtonBuilder {
  return new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);
}

function row(...btns: ButtonBuilder[]): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(...btns);
}

function getAutomod3Config(guildId: string) {
  let cfg = db.prepare('SELECT * FROM automod3_config WHERE guild_id=?').get(guildId) as any;
  if (!cfg) {
    db.prepare("INSERT OR IGNORE INTO automod3_config (guild_id) VALUES (?)").run(guildId);
    cfg = db.prepare('SELECT * FROM automod3_config WHERE guild_id=?').get(guildId);
  }
  return cfg;
}

function getWarnConfig(guildId: string) {
  let cfg = db.prepare('SELECT * FROM warn_config WHERE guild_id=?').get(guildId) as any;
  if (!cfg) {
    db.prepare("INSERT OR IGNORE INTO warn_config (guild_id) VALUES (?)").run(guildId);
    cfg = db.prepare('SELECT * FROM warn_config WHERE guild_id=?').get(guildId);
  }
  return cfg;
}

// ── Home screen ───────────────────────────────────────────────────────────────

export async function buildAutomodHome(guildId: string) {
  const g    = getGuild(guildId) as any;
  const raid = getAntiRaidConfig(guildId);
  const nuke = getAntiNukeConfig(guildId);
  const am3  = getAutomod3Config(guildId);
  const sec  = getSecurityConfig(guildId) as any;

  const embed = new EmbedBuilder()
    .setTitle('🛡️ Mod Setup')
    .setColor('#5865f2')
    .setDescription('Click a section to configure it. All changes apply immediately.')
    .addFields(
      { name: '🔤 Basic Filters',    value: `Anti-Spam ${flag(g.automod_antispam)} · Anti-Link ${flag(g.automod_antilink)} · Anti-Caps ${flag(g.automod_anticaps)} · Anti-Invite ${flag(g.automod_antiinvite)}`, inline: false },
      { name: '🔬 Advanced AutoMod', value: `Phishing ${flag(am3?.phishing_filter)} · Mass-Ping ${flag(am3?.anti_mass_ping)} · Regex filters: ${JSON.parse(am3?.regex_filters ?? '[]').length}`, inline: false },
      { name: '🔐 Security Engine',  value: `${flag(sec?.enabled)} · Severity: ${sec?.severity ?? 'medium'}`, inline: false },
      { name: '🌊 Anti-Raid',        value: `${flag(raid.enabled)} · Action: ${raid.action} · Threshold: ${raid.threshold}/${raid.window_seconds}s`, inline: false },
      { name: '💣 Anti-Nuke',        value: `${flag(nuke.enabled)} · Action: ${nuke.action}`, inline: false },
      { name: '⚖️ Warn Escalation',  value: (() => { const w = getWarnConfig(guildId); return `Mute at ${w.mute_threshold || '—'} · Kick at ${w.kick_threshold || '—'} · Ban at ${w.ban_threshold || '—'}`; })(), inline: false },
      { name: '⚡ Ultra-Mode',       value: `${flag(isUltraModeActive(guildId))} · Score threshold: ${sec?.ultra_score_threshold ?? 60}/100`, inline: false },
    )
    .setFooter({ text: 'Use the buttons below to configure each section' });

  const rows = [
    row(
      btn('🔤 Basic Filters',    `amw:filters:open:${guildId}`),
      btn('🔬 Advanced AutoMod', `amw:advanced:open:${guildId}`),
      btn('🔐 Security Engine',  `amw:security:open:${guildId}`),
    ),
    row(
      btn('🌊 Anti-Raid',   `amw:raid:open:${guildId}`),
      btn('💣 Anti-Nuke',   `amw:nuke:open:${guildId}`),
      btn('⚖️ Warn Config', `amw:warn:open:${guildId}`),
      btn('⚡ Ultra-Mode',  `amw:ultra:open:${guildId}`),
    ),
  ];

  return { embeds: [embed], components: rows };
}

// ── Section: Basic Filters ────────────────────────────────────────────────────

async function buildFiltersScreen(guildId: string) {
  const g = getGuild(guildId) as any;
  const embed = new EmbedBuilder()
    .setTitle('🔤 Basic Filters')
    .setColor('#5865f2')
    .addFields(
      { name: 'Anti-Spam',        value: flag(g.automod_antispam),   inline: true },
      { name: 'Anti-Link',        value: flag(g.automod_antilink),   inline: true },
      { name: 'Anti-Caps',        value: flag(g.automod_anticaps),   inline: true },
      { name: 'Anti-Invite',      value: flag(g.automod_antiinvite), inline: true },
      { name: 'Bad Words',        value: `${JSON.parse(g.automod_badwords ?? '[]').length} words`, inline: true },
      { name: 'Mod Log Channel',  value: g.mod_log_channel ? `<#${g.mod_log_channel}>` : '—', inline: true },
    );

  const components = [
    row(
      btn(g.automod_antispam   ? '🔴 Disable Spam'   : '🟢 Enable Spam',   `amw:filters:spam:${guildId}`,   ButtonStyle.Secondary),
      btn(g.automod_antilink   ? '🔴 Disable Links'  : '🟢 Enable Links',  `amw:filters:link:${guildId}`,   ButtonStyle.Secondary),
      btn(g.automod_anticaps   ? '🔴 Disable Caps'   : '🟢 Enable Caps',   `amw:filters:caps:${guildId}`,   ButtonStyle.Secondary),
      btn(g.automod_antiinvite ? '🔴 Disable Invites': '🟢 Enable Invites',`amw:filters:invite:${guildId}`, ButtonStyle.Secondary),
    ),
    row(
      btn('✏️ Edit Bad Words',   `amw:filters:badwords:${guildId}`),
      btn('📋 Set Log Channel',  `amw:filters:logch:${guildId}`),
      btn('◀ Back',              `amw:home:open:${guildId}`,           ButtonStyle.Danger),
    ),
  ];
  return { embeds: [embed], components };
}

// ── Section: Advanced AutoMod (AutoMod3) ──────────────────────────────────────

async function buildAdvancedScreen(guildId: string) {
  const am3    = getAutomod3Config(guildId);
  const profile = JSON.parse(am3.punishment_profile ?? '{"1":"warn","2":"timeout_1h","3":"ban"}');
  const filters = JSON.parse(am3.regex_filters ?? '[]');

  const embed = new EmbedBuilder()
    .setTitle('🔬 Advanced AutoMod')
    .setColor('#5865f2')
    .addFields(
      { name: 'Phishing Filter',  value: flag(am3.phishing_filter),  inline: true },
      { name: 'Mass-Ping Guard',  value: flag(am3.anti_mass_ping),   inline: true },
      { name: 'Anti-Mass-DM',     value: flag(am3.anti_mass_dm),     inline: true },
      { name: 'Spam Threshold',   value: `${am3.spam_threshold}msg / ${am3.spam_window_seconds}s`, inline: true },
      { name: 'Mass-Ping Limit',  value: `${am3.mass_ping_limit} mentions`, inline: true },
      { name: 'Regex Filters',    value: `${filters.length} active`, inline: true },
      { name: 'Punishment 1st',   value: profile['1'] ?? 'warn',   inline: true },
      { name: 'Punishment 2nd',   value: profile['2'] ?? 'timeout_1h', inline: true },
      { name: 'Punishment 3rd',   value: profile['3'] ?? 'ban',    inline: true },
    );

  const components = [
    row(
      btn(am3.phishing_filter ? '🔴 Disable Phishing' : '🟢 Enable Phishing', `amw:advanced:phishing:${guildId}`,  ButtonStyle.Secondary),
      btn(am3.anti_mass_ping  ? '🔴 Disable MassPing' : '🟢 Enable MassPing', `amw:advanced:masspng:${guildId}`,   ButtonStyle.Secondary),
      btn(am3.anti_mass_dm    ? '🔴 Disable MassDM'   : '🟢 Enable MassDM',   `amw:advanced:massdm:${guildId}`,    ButtonStyle.Secondary),
    ),
    row(
      btn('⚙️ Spam Threshold',    `amw:advanced:spam:${guildId}`),
      btn('🎯 Punishments',       `amw:advanced:punish:${guildId}`),
      btn('🔍 Regex Filters',     `amw:advanced:regex:${guildId}`),
      btn('◀ Back',               `amw:home:open:${guildId}`, ButtonStyle.Danger),
    ),
  ];
  return { embeds: [embed], components };
}

// ── Section: Anti-Raid ────────────────────────────────────────────────────────

async function buildRaidScreen(guildId: string) {
  const cfg = getAntiRaidConfig(guildId);
  const embed = new EmbedBuilder()
    .setTitle('🌊 Anti-Raid')
    .setColor(cfg.enabled ? '#57f287' : '#ed4245')
    .addFields(
      { name: 'Status',          value: flag(cfg.enabled),       inline: true },
      { name: 'Action',          value: cfg.action,              inline: true },
      { name: 'Threshold',       value: `${cfg.threshold} joins`, inline: true },
      { name: 'Time Window',     value: `${cfg.window_seconds}s`, inline: true },
      { name: 'Min Account Age', value: `${cfg.min_age_minutes}min`, inline: true },
      { name: 'Log Channel',     value: cfg.log_channel_id ? `<#${cfg.log_channel_id}>` : '—', inline: true },
    );

  const actionMenu = new StringSelectMenuBuilder()
    .setCustomId(`amw:raid:action:${guildId}`)
    .setPlaceholder(`Action: currently "${cfg.action}"`)
    .addOptions(
      { label: '👢 Kick',            value: 'kick',     description: 'Kick raiders' },
      { label: '🔨 Ban',             value: 'ban',      description: 'Ban raiders' },
      { label: '⏱️ Timeout (1h)',    value: 'timeout',  description: 'Timeout raiders for 1h' },
      { label: '🔒 Lockdown only',   value: 'lockdown', description: 'Only lock channels, no user action' },
    );

  const components = [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(actionMenu),
    row(
      btn(cfg.enabled ? '🔴 Disable' : '🟢 Enable', `amw:raid:toggle:${guildId}`, cfg.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      btn('⚙️ Thresholds', `amw:raid:thresholds:${guildId}`),
      btn('📋 Log Channel', `amw:raid:logch:${guildId}`),
      btn('◀ Back',         `amw:home:open:${guildId}`, ButtonStyle.Danger),
    ),
  ];
  return { embeds: [embed], components };
}

// ── Section: Anti-Nuke ────────────────────────────────────────────────────────

async function buildNukeScreen(guildId: string) {
  const cfg = getAntiNukeConfig(guildId);
  const embed = new EmbedBuilder()
    .setTitle('💣 Anti-Nuke')
    .setColor(cfg.enabled ? '#57f287' : '#ed4245')
    .addFields(
      { name: 'Status',           value: flag(cfg.enabled),       inline: true },
      { name: 'Action',           value: cfg.action,              inline: true },
      { name: 'Window',           value: `${cfg.window_seconds}s`, inline: true },
      { name: 'Channel Deletes',  value: `Max ${cfg.channel_delete_limit}`, inline: true },
      { name: 'Role Deletes',     value: `Max ${cfg.role_delete_limit}`,    inline: true },
      { name: 'Bans',             value: `Max ${cfg.ban_limit}`,            inline: true },
      { name: 'Webhooks',         value: `Max ${cfg.webhook_limit}`,        inline: true },
      { name: 'Log Channel',      value: cfg.log_channel_id ? `<#${cfg.log_channel_id}>` : '—', inline: true },
    );

  const actionMenu = new StringSelectMenuBuilder()
    .setCustomId(`amw:nuke:action:${guildId}`)
    .setPlaceholder(`Action: currently "${cfg.action}"`)
    .addOptions(
      { label: '👢 Kick',  value: 'kick', description: 'Kick the attacker' },
      { label: '🔨 Ban',   value: 'ban',  description: 'Ban the attacker' },
      { label: '🔕 Strip', value: 'strip_roles', description: 'Strip all roles' },
    );

  const components = [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(actionMenu),
    row(
      btn(cfg.enabled ? '🔴 Disable' : '🟢 Enable', `amw:nuke:toggle:${guildId}`, cfg.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      btn('⚙️ Limits',      `amw:nuke:limits:${guildId}`),
      btn('📋 Log Channel', `amw:nuke:logch:${guildId}`),
      btn('◀ Back',         `amw:home:open:${guildId}`, ButtonStyle.Danger),
    ),
  ];
  return { embeds: [embed], components };
}

// ── Section: Warn Escalation ──────────────────────────────────────────────────

async function buildWarnScreen(guildId: string) {
  const w = getWarnConfig(guildId);
  const embed = new EmbedBuilder()
    .setTitle('⚖️ Warn Escalation')
    .setColor('#faa61a')
    .setDescription('Set how many warnings trigger automatic escalations.\n0 = disabled for that action.')
    .addFields(
      { name: 'Mute at warns',       value: w.mute_threshold ? `${w.mute_threshold} warns → ${w.mute_duration_minutes}min mute` : 'Off', inline: false },
      { name: 'Kick at warns',       value: w.kick_threshold ? `${w.kick_threshold} warns` : 'Off', inline: true },
      { name: 'Ban at warns',        value: w.ban_threshold  ? `${w.ban_threshold} warns`  : 'Off', inline: true },
    );

  const components = [
    row(
      btn('⚙️ Edit Thresholds', `amw:warn:edit:${guildId}`),
      btn('◀ Back',             `amw:home:open:${guildId}`, ButtonStyle.Danger),
    ),
  ];
  return { embeds: [embed], components };
}

// ── Section: Ultra-Mode ───────────────────────────────────────────────────────

async function buildUltraScreen(guildId: string) {
  const active = isUltraModeActive(guildId);
  const sec    = getSecurityConfig(guildId) as any;
  const embed  = new EmbedBuilder()
    .setTitle('⚡ Ultra-Mode')
    .setColor(active ? '#6600ff' : '#5865f2')
    .setDescription(
      active
        ? '**ACTIVE** — Every new join is scored. Accounts over the threshold are instantly banned.'
        : 'Ultra-Mode is currently **off**. Activate it during an active raid or attack.',
    )
    .addFields({ name: 'Score Threshold', value: `${sec?.ultra_score_threshold ?? 60}/100`, inline: true });

  const components = [
    row(
      btn(active ? '🔴 Deactivate Ultra-Mode' : '⚡ Activate Ultra-Mode', `amw:ultra:toggle:${guildId}`, active ? ButtonStyle.Danger : ButtonStyle.Success),
      btn('⚙️ Set Score Threshold', `amw:ultra:threshold:${guildId}`),
      btn('◀ Back',                 `amw:home:open:${guildId}`, ButtonStyle.Danger),
    ),
  ];
  return { embeds: [embed], components };
}

// ── Section: Security Engine ──────────────────────────────────────────────────

const SECURITY_FEATURES = [
  { key: 'feat_antiraid',     label: 'Anti-Raid' },
  { key: 'feat_antispam',     label: 'Anti-Spam' },
  { key: 'feat_linkfilter',   label: 'Link Filter' },
  { key: 'feat_antiphing',    label: 'Phishing Guard' },
  { key: 'feat_masspinggard', label: 'Mass-Ping Guard' },
  { key: 'feat_accountage',   label: 'Account Age Gate' },
  { key: 'feat_anticaps',     label: 'Anti-Caps' },
  { key: 'feat_antinuke',     label: 'Anti-Nuke' },
];

async function buildSecurityScreen(guildId: string) {
  const cfg = getSecurityConfig(guildId) as any;
  const featLines = SECURITY_FEATURES.map(f => `${cfg[f.key] ? '✅' : '⬜'} ${f.label}`).join(' · ');
  const embed = new EmbedBuilder()
    .setTitle('🔐 Security Engine')
    .setColor(cfg.enabled ? '#57f287' : '#ed4245')
    .addFields(
      { name: 'Status',         value: flag(cfg.enabled),         inline: true },
      { name: 'Severity',       value: cfg.severity ?? 'medium',  inline: true },
      { name: 'Log Channel',    value: cfg.log_channel_id ? `<#${cfg.log_channel_id}>` : '—', inline: true },
      { name: 'Raid Threshold', value: `${cfg.raid_threshold}/${cfg.raid_window_seconds}s`, inline: true },
      { name: 'Spam Threshold', value: `${cfg.spam_threshold}/${cfg.spam_window_seconds}s`, inline: true },
      { name: 'Mass-Ping Limit',value: `${cfg.mass_ping_limit} mentions`,                   inline: true },
      { name: 'Features',       value: featLines, inline: false },
    );

  const sevMenu = new StringSelectMenuBuilder()
    .setCustomId(`amw:security:severity:${guildId}`)
    .setPlaceholder(`Severity: currently "${cfg.severity ?? 'medium'}"`)
    .addOptions(
      { label: '🟡 Low — permissive, minimal false positives',    value: 'low' },
      { label: '🟠 Medium — balanced (default)',                   value: 'medium' },
      { label: '🔴 High — strict, blocks more aggressively',       value: 'high' },
    );

  const featMenu = new StringSelectMenuBuilder()
    .setCustomId(`amw:security:features:${guildId}`)
    .setPlaceholder('Toggle security features (select all you want ON)')
    .setMinValues(0)
    .setMaxValues(SECURITY_FEATURES.length)
    .addOptions(SECURITY_FEATURES.map(f => ({
      label: f.label, value: f.key,
      default: !!cfg[f.key],
    })));

  const components = [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(sevMenu),
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(featMenu),
    row(
      btn(cfg.enabled ? '🔴 Disable Engine' : '🟢 Enable Engine', `amw:security:toggle:${guildId}`, cfg.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      btn('⚙️ Thresholds', `amw:security:thresholds:${guildId}`),
      btn('📋 Log Channel', `amw:security:logch:${guildId}`),
      btn('◀ Back',         `amw:home:open:${guildId}`, ButtonStyle.Danger),
    ),
  ];
  return { embeds: [embed], components };
}

// ── Routing ───────────────────────────────────────────────────────────────────

export function isAutomodWizardButton(id: string)  { return id.startsWith('amw:'); }
export function isAutomodWizardSelect(id: string)   { return id.startsWith('amw:'); }
export function isAutomodWizardModal(id: string)    { return id.startsWith('amwm:'); }

export async function handleAutomodWizardButton(btn: ButtonInteraction): Promise<void> {
  const [, section, action, guildId] = btn.customId.split(':');
  if (!guildId || btn.guildId !== guildId) { await btn.reply({ content: '❌ Guild mismatch.', ephemeral: true }); return; }

  // Home
  if (section === 'home') { return void btn.update(await buildAutomodHome(guildId)); }

  // Filters
  if (section === 'filters') {
    if (action === 'open')   return void btn.update(await buildFiltersScreen(guildId));
    if (action === 'spam')   { setGuildValue(guildId, 'automod_antispam',   getGuild(guildId).automod_antispam   ? 0 : 1); return void btn.update(await buildFiltersScreen(guildId)); }
    if (action === 'link')   { setGuildValue(guildId, 'automod_antilink',   getGuild(guildId).automod_antilink   ? 0 : 1); return void btn.update(await buildFiltersScreen(guildId)); }
    if (action === 'caps')   { setGuildValue(guildId, 'automod_anticaps',   (getGuild(guildId) as any).automod_anticaps   ? 0 : 1); return void btn.update(await buildFiltersScreen(guildId)); }
    if (action === 'invite') { setGuildValue(guildId, 'automod_antiinvite', (getGuild(guildId) as any).automod_antiinvite ? 0 : 1); return void btn.update(await buildFiltersScreen(guildId)); }
    if (action === 'badwords') {
      const modal = new ModalBuilder().setCustomId(`amwm:filters:badwords:${guildId}`).setTitle('Bad Words Filter');
      const g = getGuild(guildId) as any;
      const current = JSON.parse(g.automod_badwords ?? '[]').join(', ');
      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId('words').setLabel('Words (comma-separated)').setStyle(TextInputStyle.Paragraph).setValue(current).setRequired(false),
      ));
      return void btn.showModal(modal);
    }
    if (action === 'logch') {
      const modal = new ModalBuilder().setCustomId(`amwm:filters:logch:${guildId}`).setTitle('Mod Log Channel');
      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId('channel_id').setLabel('Channel ID').setStyle(TextInputStyle.Short).setRequired(true),
      ));
      return void btn.showModal(modal);
    }
  }

  // Advanced
  if (section === 'advanced') {
    if (action === 'open') return void btn.update(await buildAdvancedScreen(guildId));
    const am3 = getAutomod3Config(guildId);
    if (action === 'phishing') { db.prepare("UPDATE automod3_config SET phishing_filter=? WHERE guild_id=?").run(am3.phishing_filter ? 0 : 1, guildId); return void btn.update(await buildAdvancedScreen(guildId)); }
    if (action === 'masspng')  { db.prepare("UPDATE automod3_config SET anti_mass_ping=? WHERE guild_id=?").run(am3.anti_mass_ping  ? 0 : 1, guildId); return void btn.update(await buildAdvancedScreen(guildId)); }
    if (action === 'massdm')   { db.prepare("UPDATE automod3_config SET anti_mass_dm=? WHERE guild_id=?").run(am3.anti_mass_dm    ? 0 : 1, guildId); return void btn.update(await buildAdvancedScreen(guildId)); }
    if (action === 'spam') {
      const modal = new ModalBuilder().setCustomId(`amwm:advanced:spam:${guildId}`).setTitle('Spam Threshold');
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('messages').setLabel('Max messages in window').setStyle(TextInputStyle.Short).setValue(String(am3.spam_threshold)).setRequired(true)),
        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('seconds').setLabel('Time window (seconds)').setStyle(TextInputStyle.Short).setValue(String(am3.spam_window_seconds)).setRequired(true)),
      );
      return void btn.showModal(modal);
    }
    if (action === 'punish') {
      const profile = JSON.parse(am3.punishment_profile ?? '{}');
      const modal = new ModalBuilder().setCustomId(`amwm:advanced:punish:${guildId}`).setTitle('Punishment Profile');
      const choices = 'warn, timeout_10m, timeout_1h, timeout_24h, kick, ban';
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('first').setLabel(`1st violation (${choices})`).setStyle(TextInputStyle.Short).setValue(profile['1'] ?? 'warn').setRequired(true)),
        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('second').setLabel(`2nd violation (${choices})`).setStyle(TextInputStyle.Short).setValue(profile['2'] ?? 'timeout_1h').setRequired(true)),
        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('third').setLabel(`3rd violation (${choices})`).setStyle(TextInputStyle.Short).setValue(profile['3'] ?? 'ban').setRequired(true)),
      );
      return void btn.showModal(modal);
    }
    if (action === 'regex') {
      const modal = new ModalBuilder().setCustomId(`amwm:advanced:regex:${guildId}`).setTitle('Add Regex Filter');
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('pattern').setLabel('Regex pattern (without //)').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Name/description').setStyle(TextInputStyle.Short).setRequired(true)),
      );
      return void btn.showModal(modal);
    }
  }

  // Security Engine
  if (section === 'security') {
    if (action === 'open') return void btn.update(await buildSecurityScreen(guildId));
    const cfg = getSecurityConfig(guildId) as any;
    if (action === 'toggle') {
      updateSecurityConfig(guildId, { enabled: cfg.enabled ? 0 : 1 } as any);
      return void btn.update(await buildSecurityScreen(guildId));
    }
    if (action === 'thresholds') {
      const modal = new ModalBuilder().setCustomId(`amwm:security:thresholds:${guildId}`).setTitle('Security Thresholds');
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('raid_thr').setLabel('Raid: joins to trigger (default 10)').setStyle(TextInputStyle.Short).setValue(String(cfg.raid_threshold ?? 10)).setRequired(false)),
        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('raid_win').setLabel('Raid: time window (seconds)').setStyle(TextInputStyle.Short).setValue(String(cfg.raid_window_seconds ?? 10)).setRequired(false)),
        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('spam_thr').setLabel('Spam: messages to trigger').setStyle(TextInputStyle.Short).setValue(String(cfg.spam_threshold ?? 5)).setRequired(false)),
        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('spam_win').setLabel('Spam: time window (seconds)').setStyle(TextInputStyle.Short).setValue(String(cfg.spam_window_seconds ?? 3)).setRequired(false)),
        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('ping_lim').setLabel('Mass-Ping: mention limit').setStyle(TextInputStyle.Short).setValue(String(cfg.mass_ping_limit ?? 5)).setRequired(false)),
      );
      return void btn.showModal(modal);
    }
    if (action === 'logch') {
      const modal = new ModalBuilder().setCustomId(`amwm:security:logch:${guildId}`).setTitle('Security Log Channel');
      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('channel_id').setLabel('Channel ID').setStyle(TextInputStyle.Short).setRequired(true)));
      return void btn.showModal(modal);
    }
  }

  // Raid
  if (section === 'raid') {
    if (action === 'open') return void btn.update(await buildRaidScreen(guildId));
    const cfg = getAntiRaidConfig(guildId);
    if (action === 'toggle') {
      updateAntiRaidConfig(guildId, { enabled: cfg.enabled ? 0 : 1 });
      return void btn.update(await buildRaidScreen(guildId));
    }
    if (action === 'thresholds') {
      const modal = new ModalBuilder().setCustomId(`amwm:raid:thresholds:${guildId}`).setTitle('Anti-Raid Thresholds');
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('threshold').setLabel('Join threshold to trigger').setStyle(TextInputStyle.Short).setValue(String(cfg.threshold)).setRequired(true)),
        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('window').setLabel('Time window (seconds)').setStyle(TextInputStyle.Short).setValue(String(cfg.window_seconds)).setRequired(true)),
        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('min_age').setLabel('Min account age (minutes, 0=off)').setStyle(TextInputStyle.Short).setValue(String(cfg.min_age_minutes)).setRequired(false)),
      );
      return void btn.showModal(modal);
    }
    if (action === 'logch') {
      const modal = new ModalBuilder().setCustomId(`amwm:raid:logch:${guildId}`).setTitle('Anti-Raid Log Channel');
      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('channel_id').setLabel('Channel ID').setStyle(TextInputStyle.Short).setRequired(true)));
      return void btn.showModal(modal);
    }
  }

  // Nuke
  if (section === 'nuke') {
    if (action === 'open') return void btn.update(await buildNukeScreen(guildId));
    const cfg = getAntiNukeConfig(guildId);
    if (action === 'toggle') {
      updateAntiNukeConfig(guildId, { enabled: cfg.enabled ? 0 : 1 });
      return void btn.update(await buildNukeScreen(guildId));
    }
    if (action === 'limits') {
      const modal = new ModalBuilder().setCustomId(`amwm:nuke:limits:${guildId}`).setTitle('Anti-Nuke Limits');
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('channels').setLabel('Max channel deletes').setStyle(TextInputStyle.Short).setValue(String(cfg.channel_delete_limit)).setRequired(true)),
        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('roles').setLabel('Max role deletes').setStyle(TextInputStyle.Short).setValue(String(cfg.role_delete_limit)).setRequired(true)),
        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('bans').setLabel('Max bans in window').setStyle(TextInputStyle.Short).setValue(String(cfg.ban_limit)).setRequired(true)),
        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('webhooks').setLabel('Max webhook creates').setStyle(TextInputStyle.Short).setValue(String(cfg.webhook_limit)).setRequired(true)),
        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('window').setLabel('Time window (seconds)').setStyle(TextInputStyle.Short).setValue(String(cfg.window_seconds)).setRequired(true)),
      );
      return void btn.showModal(modal);
    }
    if (action === 'logch') {
      const modal = new ModalBuilder().setCustomId(`amwm:nuke:logch:${guildId}`).setTitle('Anti-Nuke Log Channel');
      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('channel_id').setLabel('Channel ID').setStyle(TextInputStyle.Short).setRequired(true)));
      return void btn.showModal(modal);
    }
  }

  // Warn
  if (section === 'warn') {
    if (action === 'open') return void btn.update(await buildWarnScreen(guildId));
    if (action === 'edit') {
      const w = getWarnConfig(guildId);
      const modal = new ModalBuilder().setCustomId(`amwm:warn:edit:${guildId}`).setTitle('Warn Escalation Thresholds');
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('mute_at').setLabel('Mute after X warns (0=off)').setStyle(TextInputStyle.Short).setValue(String(w.mute_threshold)).setRequired(false)),
        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('mute_minutes').setLabel('Mute duration (minutes)').setStyle(TextInputStyle.Short).setValue(String(w.mute_duration_minutes)).setRequired(false)),
        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('kick_at').setLabel('Kick after X warns (0=off)').setStyle(TextInputStyle.Short).setValue(String(w.kick_threshold)).setRequired(false)),
        new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('ban_at').setLabel('Ban after X warns (0=off)').setStyle(TextInputStyle.Short).setValue(String(w.ban_threshold)).setRequired(false)),
      );
      return void btn.showModal(modal);
    }
  }

  // Ultra
  if (section === 'ultra') {
    if (action === 'open') return void btn.update(await buildUltraScreen(guildId));
    if (action === 'toggle') {
      if (isUltraModeActive(guildId)) deactivateUltraMode(guildId);
      else activateUltraMode(guildId);
      return void btn.update(await buildUltraScreen(guildId));
    }
    if (action === 'threshold') {
      const modal = new ModalBuilder().setCustomId(`amwm:ultra:threshold:${guildId}`).setTitle('Ultra-Mode Score Threshold');
      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId('score').setLabel('Risk score to trigger instant ban (1-100)').setStyle(TextInputStyle.Short).setRequired(true),
      ));
      return void btn.showModal(modal);
    }
  }
}

export async function handleAutomodWizardSelect(sel: StringSelectMenuInteraction): Promise<void> {
  const [, section, action, guildId] = sel.customId.split(':');
  if (!guildId || sel.guildId !== guildId) return;

  if (section === 'security' && action === 'severity') {
    updateSecurityConfig(guildId, { severity: sel.values[0] as any });
    return void sel.update(await buildSecurityScreen(guildId));
  }
  if (section === 'security' && action === 'features') {
    const selected = new Set(sel.values);
    const patch: Record<string, number> = {};
    for (const f of SECURITY_FEATURES) patch[f.key] = selected.has(f.key) ? 1 : 0;
    updateSecurityConfig(guildId, patch as any);
    return void sel.update(await buildSecurityScreen(guildId));
  }
  if (section === 'raid' && action === 'action') {
    updateAntiRaidConfig(guildId, { action: sel.values[0] as any });
    return void sel.update(await buildRaidScreen(guildId));
  }
  if (section === 'nuke' && action === 'action') {
    updateAntiNukeConfig(guildId, { action: sel.values[0] as any });
    return void sel.update(await buildNukeScreen(guildId));
  }
}

export async function handleAutomodWizardModal(modal: ModalSubmitInteraction): Promise<void> {
  const [, section, action, guildId] = modal.customId.split(':');
  const get = (id: string) => { try { return modal.fields.getTextInputValue(id).trim(); } catch { return ''; } };

  if (section === 'security') {
    if (action === 'thresholds') {
      const p: any = {};
      const rt = parseInt(get('raid_thr'), 10); if (!isNaN(rt) && rt > 0) p.raid_threshold = rt;
      const rw = parseInt(get('raid_win'), 10); if (!isNaN(rw) && rw > 0) p.raid_window_seconds = rw;
      const st = parseInt(get('spam_thr'), 10); if (!isNaN(st) && st > 0) p.spam_threshold = st;
      const sw = parseInt(get('spam_win'), 10); if (!isNaN(sw) && sw > 0) p.spam_window_seconds = sw;
      const pl = parseInt(get('ping_lim'), 10); if (!isNaN(pl) && pl > 0) p.mass_ping_limit = pl;
      if (Object.keys(p).length) updateSecurityConfig(guildId, p as any);
    }
    if (action === 'logch') {
      const chId = get('channel_id');
      if (chId) updateSecurityConfig(guildId, { log_channel_id: chId } as any);
    }
    await modal.reply({ content: '✅ Saved!', ephemeral: true });
    return;
  }

  if (section === 'filters') {
    if (action === 'badwords') {
      const words = get('words').split(',').map(w => w.trim().toLowerCase()).filter(Boolean);
      setGuildValue(guildId, 'automod_badwords', JSON.stringify(words));
    }
    if (action === 'logch') {
      const chId = get('channel_id');
      if (chId) setGuildValue(guildId, 'mod_log_channel', chId);
    }
    await modal.reply({ content: '✅ Saved!', ephemeral: true });
    return;
  }

  if (section === 'advanced') {
    if (action === 'spam') {
      const msgs = parseInt(get('messages'), 10) || 5;
      const secs = parseInt(get('seconds'),  10) || 3;
      db.prepare("UPDATE automod3_config SET spam_threshold=?, spam_window_seconds=? WHERE guild_id=?").run(msgs, secs, guildId);
    }
    if (action === 'punish') {
      const profile = { '1': get('first'), '2': get('second'), '3': get('third') };
      db.prepare("UPDATE automod3_config SET punishment_profile=? WHERE guild_id=?").run(JSON.stringify(profile), guildId);
    }
    if (action === 'regex') {
      const pattern = get('pattern');
      const name    = get('name');
      if (pattern && name) {
        try { new RegExp(pattern); } catch { await modal.reply({ content: '❌ Invalid regex pattern.', ephemeral: true }); return; }
        const am3 = getAutomod3Config(guildId);
        const filters: any[] = JSON.parse(am3.regex_filters ?? '[]');
        filters.push({ pattern, name, id: Date.now() });
        db.prepare("UPDATE automod3_config SET regex_filters=? WHERE guild_id=?").run(JSON.stringify(filters), guildId);
      }
    }
    await modal.reply({ content: '✅ Saved!', ephemeral: true });
    return;
  }

  if (section === 'raid') {
    if (action === 'thresholds') {
      const threshold = parseInt(get('threshold'), 10);
      const window    = parseInt(get('window'),    10);
      const min_age   = parseInt(get('min_age'),   10);
      updateAntiRaidConfig(guildId, {
        ...(threshold > 0 && { threshold }),
        ...(window    > 0 && { window_seconds: window }),
        ...(!isNaN(min_age) && { min_age_minutes: min_age }),
      });
    }
    if (action === 'logch') {
      const chId = get('channel_id');
      if (chId) updateAntiRaidConfig(guildId, { log_channel_id: chId });
    }
    await modal.reply({ content: '✅ Saved!', ephemeral: true });
    return;
  }

  if (section === 'nuke') {
    if (action === 'limits') {
      updateAntiNukeConfig(guildId, {
        channel_delete_limit: parseInt(get('channels'), 10) || 3,
        role_delete_limit:    parseInt(get('roles'),    10) || 3,
        ban_limit:            parseInt(get('bans'),     10) || 5,
        webhook_limit:        parseInt(get('webhooks'), 10) || 5,
        window_seconds:       parseInt(get('window'),   10) || 10,
      });
    }
    if (action === 'logch') {
      const chId = get('channel_id');
      if (chId) updateAntiNukeConfig(guildId, { log_channel_id: chId });
    }
    await modal.reply({ content: '✅ Saved!', ephemeral: true });
    return;
  }

  if (section === 'warn' && action === 'edit') {
    const mute     = parseInt(get('mute_at'),     10);
    const muteMin  = parseInt(get('mute_minutes'),10);
    const kick     = parseInt(get('kick_at'),     10);
    const ban      = parseInt(get('ban_at'),      10);
    if (!isNaN(mute))    db.prepare('UPDATE warn_config SET mute_threshold=? WHERE guild_id=?').run(mute, guildId);
    if (!isNaN(muteMin)) db.prepare('UPDATE warn_config SET mute_duration_minutes=? WHERE guild_id=?').run(muteMin, guildId);
    if (!isNaN(kick))    db.prepare('UPDATE warn_config SET kick_threshold=? WHERE guild_id=?').run(kick, guildId);
    if (!isNaN(ban))     db.prepare('UPDATE warn_config SET ban_threshold=? WHERE guild_id=?').run(ban, guildId);
    await modal.reply({ content: '✅ Saved!', ephemeral: true });
    return;
  }

  if (section === 'ultra' && action === 'threshold') {
    const score = Math.max(1, Math.min(100, parseInt(get('score'), 10) || 60));
    const sec = getSecurityConfig(guildId) as any;
    db.prepare('UPDATE security_config SET ultra_score_threshold=? WHERE guild_id=?').run(score, guildId);
    await modal.reply({ content: `✅ Score threshold set to **${score}/100**.`, ephemeral: true });
    return;
  }

  await modal.reply({ content: '✅ Saved!', ephemeral: true });
}
