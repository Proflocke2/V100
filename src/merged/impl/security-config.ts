import {
  SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuInteraction, ButtonInteraction,
  ModalBuilder, TextInputBuilder, TextInputStyle, ModalSubmitInteraction,
  MessageFlags, ChannelType,
  ChannelSelectMenuBuilder, ChannelSelectMenuInteraction,
} from 'discord.js';
import { requireAdmin } from '../../utils/guards';
import { warn, error } from '../../utils/embeds';
import { getGuild } from '../../database/db';
import { getLocalized, Language } from '../../utils/localization';
import {
  getSecurityConfig, updateSecurityConfig, SecurityConfig, Severity,
  getRecentIncidents, isLockdownActive, liftLockdown, triggerLockdown,
  isUltraModeActive,
} from '../../modules/security/securityEngine';
import {
  EXEMPTABLE_FEATURES, FEATURE_LABELS, ExemptableFeature,
  getChannelExceptions, setChannelException, listExemptChannels,
} from '../../modules/moderation/channelExceptions';
import { logConfigChange } from '../../modules/audit/configAudit';

// ── Localized feature/severity data ──────────────────────────────────────────

const FEATURES: { key: keyof SecurityConfig; label: string; emoji: string; descKey: string }[] = [
  { key: 'feat_antiraid',     label: 'Anti-Raid',       emoji: '🛡️', descKey: 'sec.feat_antiraid_desc' },
  { key: 'feat_antispam',     label: 'Anti-Spam',       emoji: '🚫', descKey: 'sec.feat_antispam_desc' },
  { key: 'feat_linkfilter',   label: 'Link-Filter',     emoji: '🔗', descKey: 'sec.feat_link_desc' },
  { key: 'feat_antiphing',    label: 'Phishing-Guard',  emoji: '🎣', descKey: 'sec.feat_phishing_desc' },
  { key: 'feat_masspinggard', label: 'Mass-Ping-Guard', emoji: '🔔', descKey: 'sec.feat_ping_desc' },
  { key: 'feat_accountage',   label: 'Account-Age',     emoji: '📅', descKey: 'sec.feat_age_desc' },
  { key: 'feat_anticaps',     label: 'Anti-Caps',       emoji: '🔠', descKey: 'sec.feat_caps_desc' },
  { key: 'feat_antinuke',     label: 'Anti-Nuke',       emoji: '💣', descKey: 'sec.feat_nuke_desc' },
];

const SEVERITY_INFO: Record<Severity, { labelKey: string; emoji: string; color: string; descKey: string }> = {
  low:    { labelKey: 'sec.sev_low',    emoji: '🟡', color: '#fee75c', descKey: 'sec.sev_low_desc' },
  medium: { labelKey: 'sec.sev_medium', emoji: '🟠', color: '#e67e22', descKey: 'sec.sev_medium_desc' },
  high:   { labelKey: 'sec.sev_high',   emoji: '🔴', color: '#ed4245', descKey: 'sec.sev_high_desc' },
};

function buildStatusEmbed(cfg: SecurityConfig, guildId: string, t: (k: string, v?: Record<string,string>) => string): EmbedBuilder {
  const sev  = SEVERITY_INFO[cfg.severity];
  const fLines = FEATURES.map(f => {
    const on  = (cfg[f.key] as number) === 1;
    const desc = t(f.descKey);
    return `${on ? '✅' : '⬜'} ${f.emoji} **${f.label}** — ${desc}`;
  }).join('\n');

  const lockStatus  = isLockdownActive(guildId) ? t('sec.lockdown_active') : t('sec.lockdown_inactive');
  const ultraStatus = (cfg.ultra_mode === 1 || isUltraModeActive(guildId))
    ? `⚡ **ACTIVE** (score threshold: ${cfg.ultra_score_threshold ?? 60}/100)` : '⬜ Inactive';

  return new EmbedBuilder()
    .setColor((cfg.ultra_mode === 1 || isUltraModeActive(guildId)) ? '#6600ff' : sev.color as any)
    .setTitle(t('sec.title'))
    .setDescription(
      t('sec.status', { status: cfg.enabled ? t('sec.active') : t('sec.inactive'), lockdown: lockStatus }) + '\n' +
      `**Ultra-Mode:** ${ultraStatus}\n` +
      `**Severity:** ${sev.emoji} ${t(sev.labelKey)} — ${t(sev.descKey)}\n\n` +
      t('sec.thresholds') + '\n' +
      t('sec.raid_threshold', { n: String(cfg.raid_threshold), w: String(cfg.raid_window_seconds) }) + '\n' +
      t('sec.spam_threshold', { n: String(cfg.spam_threshold), w: String(cfg.spam_window_seconds) }) + '\n' +
      t('sec.ping_limit', { n: String(cfg.mass_ping_limit) }) + '\n' +
      (cfg.feat_accountage ? t('sec.min_age', { n: String(cfg.min_account_age_min) }) + '\n' : '') +
      t('sec.log_channel', { ch: cfg.log_channel_id ? `<#${cfg.log_channel_id}>` : t('sec.log_not_set') }) + '\n\n' +
      t('sec.features_title') + '\n' + fLines,
    )
    .setFooter({ text: t('sec.footer') })
    .setTimestamp();
}

function buildMainButtons(cfg: SecurityConfig, t: (k: string) => string): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('sec:features').setLabel('⚙️ Features').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('sec:severity').setLabel('⚡ Severity').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('sec:thresholds').setLabel(t('sec.btn_thresholds')).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('sec:logchannel').setLabel(t('sec.btn_log')).setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('sec:toggle').setLabel(cfg.enabled ? t('sec.btn_disable') : t('sec.btn_enable')).setStyle(cfg.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder().setCustomId('sec:incidents').setLabel(t('sec.btn_incidents')).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('sec:lockdown').setLabel(isLockdownActive(cfg.guild_id) ? t('sec.btn_lift') : t('sec.btn_test_lock')).setStyle(isLockdownActive(cfg.guild_id) ? ButtonStyle.Danger : ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('sec:refresh').setLabel('🔄').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('sec:chanexceptions').setLabel('📍 Channel Exceptions').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function buildFeatureSelect(cfg: SecurityConfig, t: (k: string) => string): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('sec:features:select')
      .setPlaceholder(t('sec.feat_select_title'))
      .setMinValues(0).setMaxValues(FEATURES.length)
      .addOptions(FEATURES.map(f => ({
        label: f.label, value: f.key,
        description: t(f.descKey).slice(0, 100),
        emoji: { name: f.emoji.replace(/[\uFE0F]/g, '') },
        default: (cfg[f.key] as number) === 1,
      }))),
  );
}

function buildSeveritySelect(t: (k: string) => string): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('sec:severity:select')
      .setPlaceholder(t('sec.severity_title'))
      .addOptions((Object.entries(SEVERITY_INFO) as [Severity, typeof SEVERITY_INFO[Severity]][]).map(([key, s]) => ({
        label: `${s.emoji} ${t(s.labelKey)}`, value: key, description: t(s.descKey).slice(0, 100),
      }))),
  );
}

function buildThresholdModal(cfg: SecurityConfig, t: (k: string) => string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId('sec:thresholds:modal')
    .setTitle(t('sec.btn_thresholds'))
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId('raid_threshold').setLabel(t('sec.modal_raid_threshold')).setStyle(TextInputStyle.Short).setValue(String(cfg.raid_threshold)).setRequired(true).setMinLength(1).setMaxLength(3)),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId('raid_window').setLabel(t('sec.modal_raid_window')).setStyle(TextInputStyle.Short).setValue(String(cfg.raid_window_seconds)).setRequired(true).setMinLength(1).setMaxLength(3)),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId('spam_threshold').setLabel(t('sec.modal_spam_threshold')).setStyle(TextInputStyle.Short).setValue(String(cfg.spam_threshold)).setRequired(true).setMinLength(1).setMaxLength(2)),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId('spam_window').setLabel(t('sec.modal_spam_window')).setStyle(TextInputStyle.Short).setValue(String(cfg.spam_window_seconds)).setRequired(true).setMinLength(1).setMaxLength(2)),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId('mass_ping').setLabel(t('sec.modal_mass_ping')).setStyle(TextInputStyle.Short).setValue(String(cfg.mass_ping_limit)).setRequired(true).setMinLength(1).setMaxLength(2)),
    );
}

function buildChannelExceptionsOverview(guildId: string): EmbedBuilder {
  const exempt = listExemptChannels(guildId);
  const embed = new EmbedBuilder()
    .setColor('#5865f2')
    .setTitle('📍 Channel Exceptions')
    .setDescription(
      'Disable individual checks (e.g. anti-spam) for specific channels — handy for channels ' +
      'where spamming/caps/links are explicitly allowed.\n\nPick a channel below to edit its exceptions.',
    );
  if (exempt.length > 0) {
    embed.addFields({
      name: `Channels with exceptions (${exempt.length})`,
      value: exempt.map(e => `<#${e.channel_id}> — ${e.features.map(f => FEATURE_LABELS[f]).join(', ')}`).join('\n').slice(0, 1024),
    });
  }
  return embed;
}

function buildChannelPickRow(): ActionRowBuilder<ChannelSelectMenuBuilder> {
  return new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
    new ChannelSelectMenuBuilder().setCustomId('sec:chanexceptions:channel').setPlaceholder('Pick a channel…').addChannelTypes(ChannelType.GuildText),
  );
}

function buildFeatureExceptionSelect(guildId: string, channelId: string): ActionRowBuilder<StringSelectMenuBuilder> {
  const current = new Set(getChannelExceptions(guildId, channelId));
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`sec:chanexceptions:features:${channelId}`)
      .setPlaceholder('Pick checks to disable…')
      .setMinValues(0).setMaxValues(EXEMPTABLE_FEATURES.length)
      .addOptions(EXEMPTABLE_FEATURES.map(f => ({
        label: FEATURE_LABELS[f], value: f, default: current.has(f),
      }))),
  );
}
export default {
  data: new SlashCommandBuilder()
    .setName('security-config')
    .setDescription('🔐 Interactive security configuration menu — features, severity & thresholds')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),

  async execute(ix: ChatInputCommandInteraction) {
    if (!await requireAdmin(ix)) return;
    const gid  = ix.guildId!;
    const lang = ((getGuild(gid) as any).language || 'en') as Language;
    const t    = (k: string, v?: Record<string,string>) => getLocalized(k, lang, v);
    const cfg  = getSecurityConfig(gid);

    const response = await ix.reply({
      embeds: [buildStatusEmbed(cfg, gid, t)],
      components: buildMainButtons(cfg, t),
      flags: MessageFlags.Ephemeral,
      withResponse: true,
    });

    const collector = response.resource!.message!.createMessageComponentCollector({
      filter: (i) => i.user.id === ix.user.id,
      time:   10 * 60 * 1000,
    });

    collector.on('collect', async (interaction) => {
      const id       = interaction.customId;
      const fresh    = getSecurityConfig(gid);
      const freshLang = ((getGuild(gid) as any).language || 'en') as Language;
      const ft       = (k: string, v?: Record<string,string>) => getLocalized(k, freshLang, v);

      if (id === 'sec:features') {
        await interaction.update({
          embeds: [new EmbedBuilder().setColor('#5865f2').setTitle(ft('sec.feat_select_title')).setDescription(ft('sec.feat_select_desc'))],
          components: [buildFeatureSelect(fresh, ft), new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('sec:back').setLabel(ft('sec.btn_back')).setStyle(ButtonStyle.Secondary))],
        });
        return;
      }

      if (id === 'sec:features:select') {
        const sel = interaction as StringSelectMenuInteraction;
        const selected = new Set(sel.values);
        const patch: Partial<SecurityConfig> = {};
        for (const f of FEATURES) (patch as any)[f.key] = selected.has(f.key) ? 1 : 0;
        updateSecurityConfig(gid, patch);
        const upd = getSecurityConfig(gid);
        logConfigChange(gid, interaction.user.id, 'security_features_changed', [...selected].join(', ') || 'none');
        await interaction.update({ embeds: [buildStatusEmbed(upd, gid, ft)], components: buildMainButtons(upd, ft) });
        return;
      }

      if (id === 'sec:severity') {
        await interaction.update({
          embeds: [new EmbedBuilder().setColor('#5865f2').setTitle(ft('sec.severity_title'))
            .setDescription((Object.entries(SEVERITY_INFO) as [Severity, typeof SEVERITY_INFO[Severity]][]).map(([k, s]) =>
              `${s.emoji} **${ft(s.labelKey)}** (\`${k}\`)\n> ${ft(s.descKey)}`).join('\n\n'))],
          components: [buildSeveritySelect(ft), new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('sec:back').setLabel(ft('sec.btn_back')).setStyle(ButtonStyle.Secondary))],
        });
        return;
      }

      if (id === 'sec:severity:select') {
        const sel = interaction as StringSelectMenuInteraction;
        updateSecurityConfig(gid, { severity: sel.values[0] as Severity });
        const upd = getSecurityConfig(gid);
        logConfigChange(gid, interaction.user.id, 'security_severity_changed', sel.values[0]);
        await interaction.update({ embeds: [buildStatusEmbed(upd, gid, ft)], components: buildMainButtons(upd, ft) });
        return;
      }

      if (id === 'sec:thresholds') { await (interaction as ButtonInteraction).showModal(buildThresholdModal(fresh, ft)); return; }

      if (id === 'sec:logchannel') {
        await interaction.update({
          embeds: [new EmbedBuilder().setColor('#5865f2').setTitle(ft('sec.btn_log')).setDescription('Pick a channel.')],
          components: [
            new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
              new ChannelSelectMenuBuilder().setCustomId('sec:logchannel:select').setPlaceholder('Pick a channel…').addChannelTypes(ChannelType.GuildText),
            ),
            new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('sec:back').setLabel(ft('sec.btn_back')).setStyle(ButtonStyle.Secondary)),
          ],
        });
        return;
      }
      if (id === 'sec:logchannel:select' && interaction.isChannelSelectMenu()) {
        const chId = (interaction as ChannelSelectMenuInteraction).values[0];
        updateSecurityConfig(gid, { log_channel_id: chId });
        const upd = getSecurityConfig(gid);
        logConfigChange(gid, interaction.user.id, 'security_log_channel_changed', `<#${chId}>`);
        await interaction.update({ embeds: [buildStatusEmbed(upd, gid, ft)], components: buildMainButtons(upd, ft) });
        return;
      }

      if (id === 'sec:toggle') {
        updateSecurityConfig(gid, { enabled: fresh.enabled ? 0 : 1 });
        const upd = getSecurityConfig(gid);
        logConfigChange(gid, interaction.user.id, 'security_toggled', upd.enabled ? 'on' : 'off');
        await interaction.update({ embeds: [buildStatusEmbed(upd, gid, ft)], components: buildMainButtons(upd, ft) });
        return;
      }

      if (id === 'sec:incidents') {
        const incidents = getRecentIncidents(gid, 15);
        const lines = incidents.length
          ? incidents.map(i => `\`${new Date(i.ts * 1000).toLocaleTimeString()}\` **${i.type}** — ${i.action}${i.target_id ? ` (<@${i.target_id}>)` : ''}${i.detail ? ` — ${i.detail}` : ''}`).join('\n')
          : ft('sec.no_incidents');
        await interaction.update({
          embeds: [new EmbedBuilder().setColor('#fee75c').setTitle(ft('sec.incidents_title')).setDescription(lines.slice(0, 4000)).setTimestamp()],
          components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('sec:back').setLabel(ft('sec.btn_back')).setStyle(ButtonStyle.Secondary))],
        });
        return;
      }

      if (id === 'sec:lockdown') {
        if (isLockdownActive(gid)) {
          await interaction.deferUpdate();
          const count = await liftLockdown(ix.guild!);
          const upd   = getSecurityConfig(gid);
          await interaction.editReply({ embeds: [buildStatusEmbed(upd, gid, ft).setDescription(ft('sec.lifted', { n: String(count) }))], components: buildMainButtons(upd, ft) });
        } else {
          await interaction.update({
            embeds: [warn('⚠️', ft('sec.lockdown_warning'))],
            components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder().setCustomId('sec:lockdown:confirm').setLabel(ft('sec.lockdown_confirm_btn')).setStyle(ButtonStyle.Danger),
              new ButtonBuilder().setCustomId('sec:back').setLabel(ft('sec.btn_cancel')).setStyle(ButtonStyle.Secondary),
            )],
          });
        }
        return;
      }

      if (id === 'sec:lockdown:confirm') {
        await interaction.deferUpdate();
        await triggerLockdown(ix.guild!, fresh, 'Manual test lockdown via /security-config');
        const upd = getSecurityConfig(gid);
        await interaction.editReply({ embeds: [buildStatusEmbed(upd, gid, ft)], components: buildMainButtons(upd, ft) });
        return;
      }

      if (id === 'sec:back' || id === 'sec:refresh') {
        const upd = getSecurityConfig(gid);
        await interaction.update({ embeds: [buildStatusEmbed(upd, gid, ft)], components: buildMainButtons(upd, ft) });
        return;
      }

      // ── Channel exceptions ─────────────────────────────────────────────────
      if (id === 'sec:chanexceptions') {
        await interaction.update({
          embeds: [buildChannelExceptionsOverview(gid)],
          components: [buildChannelPickRow(), new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('sec:back').setLabel(ft('sec.btn_back')).setStyle(ButtonStyle.Secondary))],
        });
        return;
      }

      if (id === 'sec:chanexceptions:channel' && interaction.isChannelSelectMenu()) {
        const channelId = (interaction as ChannelSelectMenuInteraction).values[0];
        const embed = new EmbedBuilder().setColor('#5865f2').setTitle(`📍 Exceptions — <#${channelId}>`)
          .setDescription('Pick which checks should be disabled in this channel.');
        await interaction.update({
          embeds: [embed],
          components: [buildFeatureExceptionSelect(gid, channelId), new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('sec:chanexceptions').setLabel(ft('sec.btn_back')).setStyle(ButtonStyle.Secondary))],
        });
        return;
      }

      if (id.startsWith('sec:chanexceptions:features:') && interaction.isStringSelectMenu()) {
        const channelId = id.slice('sec:chanexceptions:features:'.length);
        const sel = interaction as StringSelectMenuInteraction;
        const selected = new Set(sel.values as ExemptableFeature[]);
        for (const f of EXEMPTABLE_FEATURES) setChannelException(gid, channelId, f, selected.has(f));
        logConfigChange(gid, interaction.user.id, 'channel_exceptions_changed', `<#${channelId}>: ${[...selected].join(', ') || 'none'}`);

        await interaction.update({
          embeds: [buildChannelExceptionsOverview(gid)],
          components: [buildChannelPickRow(), new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('sec:back').setLabel(ft('sec.btn_back')).setStyle(ButtonStyle.Secondary))],
        });
        return;
      }
    });

    const awaitModal = async () => {
      try {
        const modal = await ix.awaitModalSubmit({
          filter: (i) => i.user.id === ix.user.id && i.customId === 'sec:thresholds:modal',
          time: 5 * 60 * 1000,
        }) as ModalSubmitInteraction;

        const ml   = ((getGuild(gid) as any).language || 'en') as Language;
        const mt   = (k: string, v?: Record<string,string>) => getLocalized(k, ml, v);

        if (modal.customId === 'sec:thresholds:modal') {
          updateSecurityConfig(gid, {
            raid_threshold:       Math.max(3,  Math.min(100, parseInt(modal.fields.getTextInputValue('raid_threshold'))  || 10)),
            raid_window_seconds:  Math.max(3,  Math.min(60,  parseInt(modal.fields.getTextInputValue('raid_window'))     || 10)),
            spam_threshold:       Math.max(2,  Math.min(30,  parseInt(modal.fields.getTextInputValue('spam_threshold'))  || 5)),
            spam_window_seconds:  Math.max(1,  Math.min(10,  parseInt(modal.fields.getTextInputValue('spam_window'))     || 3)),
            mass_ping_limit:      Math.max(2,  Math.min(50,  parseInt(modal.fields.getTextInputValue('mass_ping'))       || 5)),
          });
          const upd = getSecurityConfig(gid);
          logConfigChange(gid, modal.user.id, 'security_thresholds_changed');
          await modal.deferUpdate();
          await ix.editReply({ embeds: [buildStatusEmbed(upd, gid, mt)], components: buildMainButtons(upd, mt) });
        }

        void awaitModal();
      } catch { /* timed out */ }
    };
    void awaitModal();

    collector.on('end', async () => { await ix.editReply({ components: [] }).catch(() => {}); });
  },
};
