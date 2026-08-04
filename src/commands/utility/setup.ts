/**
 * /setup — Interactive setup wizard.
 *
 * Enables security and moderation features with a single
 * command. All selected features are configured immediately.
 *
 * Subcommands:
 *   wizard   — Interactive button-based setup with selection
 *   quick    — Quick setup: all recommended features at once
 *   status   — overview of all currently active features
 */

import {
  SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  MessageFlags, ComponentType, TextChannel, ChannelType,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ChannelSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import { requireAdmin } from '../../utils/guards';
import { success, error, info } from '../../utils/embeds';
import { getAutomod3Config } from '../../merged/impl/automod3';
import { setGuildValue, getGuild } from '../../database/db';
import { getAntiRaidConfig, updateAntiRaidConfig } from '../../modules/moderation/antiRaid';
import db from '../../database/db';

// ── Feature definitions ───────────────────────────────────────────────────────

interface Feature {
  id: string;
  label: string;
  emoji: string;
  description: string;
  category: 'security' | 'automod' | 'logging';
  recommended: boolean;
}

const FEATURES: Feature[] = [
  // Security
  { id: 'antiraid',       label: 'Anti-Raid',           emoji: '🛡️',  description: 'Detects join spikes and automatically kicks/bans raiders',       category: 'security', recommended: true  },
  { id: 'alt_detection',  label: 'Alt-Detection',        emoji: '🔰',  description: 'Detects new accounts (< 7 days old) on join',            category: 'security', recommended: true  },
  { id: 'verification',   label: 'Verification Gate',   emoji: '✅',  description: 'New members must verify before accessing the server',  category: 'security', recommended: false },
  // AutoMod
  { id: 'antispam',       label: 'Anti-Spam',            emoji: '🔇',  description: 'Blocks users who send too many messages',              category: 'automod',  recommended: true  },
  { id: 'antilink',       label: 'Anti-Link',            emoji: '🔗',  description: 'Blocks external links (non-mods)',                          category: 'automod',  recommended: false },
  { id: 'antiinvite',     label: 'Anti-Invite',          emoji: '🚫',  description: 'Blocks Discord invite links',                             category: 'automod',  recommended: true  },
  { id: 'anticaps',       label: 'Anti-Caps',            emoji: '🔠',  description: 'Deletes messages with >70% uppercase letters',                   category: 'automod',  recommended: false },
  { id: 'phishing',       label: 'Phishing Filter',      emoji: '🎣',  description: 'Detects and deletes phishing links automatically',                category: 'automod',  recommended: true  },
  { id: 'masspings',      label: 'Anti-Mass-Ping',       emoji: '📢',  description: 'Blocks messages with too many mentions',                  category: 'automod',  recommended: true  },
  { id: 'regex',          label: 'Regex-Filter',         emoji: '🔍',  description: 'Block custom text patterns',                      category: 'automod',  recommended: false },
  // Logging
  { id: 'modlog',         label: 'Mod-Log',              emoji: '📋',  description: 'Logs deleted/edited messages, joins/leaves, etc.',category: 'logging',  recommended: true  },
  { id: 'badwords',       label: 'Word Filter',          emoji: '🤐',  description: 'Blocks specific words/phrases',                           category: 'automod',  recommended: false },
];

// ── Status helper ─────────────────────────────────────────────────────────────

function getFeatureStatus(guildId: string): Record<string, boolean> {
  const guild = getGuild(guildId);
  const antiRaid = getAntiRaidConfig(guildId);
  const am3 = getAutomod3Config(guildId);
  const welcomeSettings = db.prepare('SELECT * FROM welcome_settings WHERE guild_id = ?').get(guildId) as any;
  const verifyConfig = db.prepare('SELECT * FROM verification_config WHERE guild_id = ?').get(guildId) as any;

  return {
    antiraid:      !!antiRaid.enabled,
    alt_detection: !!welcomeSettings?.alt_enabled,
    verification:  !!verifyConfig?.enabled,
    antispam:      !!guild.automod_antispam,
    antilink:      !!guild.automod_antilink,
    antiinvite:    !!(guild as any).automod_antiinvite,
    anticaps:      !!(guild as any).automod_anticaps,
    phishing:      !!am3.phishing_filter,
    masspings:     !!am3.anti_mass_ping,
    regex:         JSON.parse(am3.regex_filters).length > 0,
    modlog:        !!(guild.mod_log_channel || guild.log_channel),
    badwords:      JSON.parse(guild.automod_badwords || '[]').length > 0,
  };
}

// ── Apply features ────────────────────────────────────────────────────────────

async function applyFeature(guildId: string, featureId: string, enable: boolean): Promise<string> {
  const val = enable ? 1 : 0;

  switch (featureId) {
    case 'antiraid':
      updateAntiRaidConfig(guildId, {
        enabled: val,
        threshold: 8,
        window_seconds: 10,
        action: 'kick',
        min_age_minutes: 30,
      });
      return enable
        ? '🛡️ Anti-Raid enabled (8 joins/10s → kick, min age 30min)'
        : '🛡️ Anti-Raid disabled';

    case 'alt_detection':
      db.prepare('INSERT OR IGNORE INTO welcome_settings (guild_id) VALUES (?)').run(guildId);
      db.prepare('UPDATE welcome_settings SET alt_enabled = ?, alt_min_age_days = 7, alt_action = ? WHERE guild_id = ?')
        .run(val, enable ? 'log' : 'log', guildId);
      return enable
        ? '🔰 Alt-Detection enabled (< 7 day old accounts flagged)'
        : '🔰 Alt-Detection disabled';

    case 'antispam':
      setGuildValue(guildId, 'automod_enabled', val);
      setGuildValue(guildId, 'automod_antispam', val);
      return enable ? '🔇 Anti-Spam enabled' : '🔇 Anti-Spam disabled';

    case 'antilink':
      setGuildValue(guildId, 'automod_enabled', 1);
      setGuildValue(guildId, 'automod_antilink', val);
      return enable ? '🔗 Anti-Link enabled' : '🔗 Anti-Link disabled';

    case 'antiinvite':
      setGuildValue(guildId, 'automod_enabled', 1);
      setGuildValue(guildId, 'automod_antiinvite', val);
      return enable ? '🚫 Anti-Invite enabled' : '🚫 Anti-Invite disabled';

    case 'anticaps':
      setGuildValue(guildId, 'automod_enabled', 1);
      setGuildValue(guildId, 'automod_anticaps', val);
      return enable ? '🔠 Anti-Caps enabled' : '🔠 Anti-Caps disabled';

    case 'phishing': {
      db.prepare('INSERT OR IGNORE INTO automod3_config (guild_id) VALUES (?)').run(guildId);
      db.prepare('UPDATE automod3_config SET phishing_filter = ? WHERE guild_id = ?').run(val, guildId);
      return enable ? '🎣 Phishing filter enabled' : '🎣 Phishing filter disabled';
    }

    case 'masspings': {
      db.prepare('INSERT OR IGNORE INTO automod3_config (guild_id) VALUES (?)').run(guildId);
      db.prepare('UPDATE automod3_config SET anti_mass_ping = ?, mass_ping_limit = 5 WHERE guild_id = ?').run(val, guildId);
      return enable ? '📢 Anti-Mass-Ping enabled (max 5 mentions)' : '📢 Anti-Mass-Ping disabled';
    }

    case 'modlog':
      // Can only log if a mod_log_channel exists — just enable automod so events fire
      setGuildValue(guildId, 'automod_enabled', val);
      return enable
        ? '📋 Mod-Log enabled — set a channel with `/automod logchannel`'
        : '📋 Mod-Log disabled';

    default:
      return `⚠️ Feature "${featureId}" must be configured manually`;
  }
}

// ── Build status embed ────────────────────────────────────────────────────────

function buildStatusEmbed(guildId: string): EmbedBuilder {
  const status = getFeatureStatus(guildId);
  const categories = ['security', 'automod', 'logging'] as const;
  const catLabels = { security: '🔒 Security', automod: '🤖 AutoMod', logging: '📋 Logging' };

  const embed = new EmbedBuilder()
    .setTitle('⚙️ MultiBotV2 — Feature Overview')
    .setColor('#5865f2')
    .setTimestamp()
    .setFooter({ text: 'Use /setup wizard for interactive setup' });

  for (const cat of categories) {
    const features = FEATURES.filter(f => f.category === cat);
    const lines = features.map(f => `${status[f.id] ? '✅' : '❌'} ${f.emoji} **${f.label}** — ${f.description}`);
    embed.addFields({ name: catLabels[cat], value: lines.join('\n') });
  }

  const active = Object.values(status).filter(Boolean).length;
  const total = Object.keys(status).length;
  embed.setDescription(`**${active}/${total}** features active`);

  return embed;
}

// ── Export ────────────────────────────────────────────────────────────────────

export default {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Interactive setup wizard for security & moderation')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)

    .addSubcommand(s => s.setName('quick').setDescription('Quick setup: enable all recommended features instantly'))
    .addSubcommand(s => s.setName('disable-all').setDescription('⚠️ Disable all AutoMod/Security features')),

  async execute(ix: ChatInputCommandInteraction) {
    if (!await requireAdmin(ix)) return;
    const sub = ix.options.getSubcommand();
    const gid = ix.guildId!;

    // (status subcommand removed — use /admin dashboard)

    // ── Quick Setup ─────────────────────────────────────────────────────────
    if (sub === 'quick') {
      await ix.deferReply({ flags: MessageFlags.Ephemeral });
      const recommended = FEATURES.filter(f => f.recommended);
      const results: string[] = [];
      for (const f of recommended) {
        results.push(await applyFeature(gid, f.id, true));
      }
      const embed = new EmbedBuilder()
        .setColor('#57f287')
        .setTitle('✅ Quick Setup Complete')
        .setDescription(`**${recommended.length}** recommended features have been enabled:`)
        .addFields({ name: 'Enabled', value: results.join('\n') })
        .addFields({
          name: '⚠️ Next Steps',
          value: [
            '• `/security antiraid setup` — adjust action (kick/ban)',
            '• `/automod logchannel channel:#channel` — set log channel',
            '• `/welcome` — set up the welcome system',
          ].join('\n'),
        })
        .setTimestamp();
      return ix.editReply({ embeds: [embed] });
    }

    // ── Disable All ─────────────────────────────────────────────────────────
    if (sub === 'disable-all') {
      await ix.deferReply({ flags: MessageFlags.Ephemeral });
      setGuildValue(gid, 'automod_enabled', 0);
      setGuildValue(gid, 'automod_antispam', 0);
      setGuildValue(gid, 'automod_antilink', 0);
      setGuildValue(gid, 'automod_antiinvite', 0);
      setGuildValue(gid, 'automod_anticaps', 0);
      updateAntiRaidConfig(gid, { enabled: 0 });
      db.prepare('UPDATE automod3_config SET phishing_filter=0, anti_mass_ping=0 WHERE guild_id=?').run(gid);
      return ix.editReply({ embeds: [success('All Features Disabled', 'AutoMod and security have been turned off.')] });
    }

    // ── Wizard ──────────────────────────────────────────────────────────────
    if (sub === 'wizard') {
      const status = getFeatureStatus(gid);

      const selectSecurity = new StringSelectMenuBuilder()
        .setCustomId('setup:security')
        .setPlaceholder('🔒 Select security features…')
        .setMinValues(0)
        .setMaxValues(FEATURES.filter(f => f.category === 'security').length)
        .addOptions(
          FEATURES.filter(f => f.category === 'security').map(f =>
            new StringSelectMenuOptionBuilder()
              .setLabel(f.label)
              .setValue(f.id)
              .setDescription(f.description.slice(0, 100))
              .setEmoji(f.emoji)
              .setDefault(!!status[f.id])
          )
        );

      const selectAutomod = new StringSelectMenuBuilder()
        .setCustomId('setup:automod')
        .setPlaceholder('🤖 Select AutoMod features…')
        .setMinValues(0)
        .setMaxValues(FEATURES.filter(f => f.category === 'automod').length)
        .addOptions(
          FEATURES.filter(f => f.category === 'automod').map(f =>
            new StringSelectMenuOptionBuilder()
              .setLabel(f.label)
              .setValue(f.id)
              .setDescription(f.description.slice(0, 100))
              .setEmoji(f.emoji)
              .setDefault(!!status[f.id])
          )
        );

      const applyBtn = new ButtonBuilder()
        .setCustomId('setup:apply')
        .setLabel('✅ Apply')
        .setStyle(ButtonStyle.Success);

      const cancelBtn = new ButtonBuilder()
        .setCustomId('setup:cancel')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary);

      const row1 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectSecurity);
      const row2 = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectAutomod);
      const row3 = new ActionRowBuilder<ButtonBuilder>().addComponents(applyBtn, cancelBtn);

      const embed = new EmbedBuilder()
        .setColor('#5865f2')
        .setTitle('⚙️ Setup Wizard')
        .setDescription(
          'Select the features you want to enable.\n' +
          'Already active options are pre-selected.\n\n' +
          '**Green features** = currently active\n' +
          'Then click **✅ Apply**.'
        )
        .addFields(
          { name: '🔒 Security', value: FEATURES.filter(f => f.category === 'security').map(f => `${status[f.id] ? '✅' : '⬜'} ${f.emoji} ${f.label}`).join('\n'), inline: true },
          { name: '🤖 AutoMod', value: FEATURES.filter(f => f.category === 'automod').map(f => `${status[f.id] ? '✅' : '⬜'} ${f.emoji} ${f.label}`).join('\n'), inline: true },
        )
        .setFooter({ text: 'Expires in 3 minutes' });

      const resp = await ix.reply({
        embeds: [embed],
        components: [row1, row2, row3],
        flags: MessageFlags.Ephemeral,
      });

      // Collect selections
      const selectedFeatures = new Set<string>(
        FEATURES.filter(f => !!status[f.id]).map(f => f.id)
      );

      const collector = resp.createMessageComponentCollector({
        filter: i => i.user.id === ix.user.id,
        time: 180_000,
      });

      collector.on('collect', async interaction => {
        if (interaction.customId === 'setup:cancel') {
          collector.stop('cancel');
          await interaction.update({ embeds: [info('Cancelled', 'Setup was not changed.')], components: [] });
          return;
        }

        if (interaction.isStringSelectMenu()) {
          // Clear all features from this category, then re-add selected
          const cat = interaction.customId.replace('setup:', '') as 'security' | 'automod' | 'logging';
          FEATURES.filter(f => f.category === cat).forEach(f => selectedFeatures.delete(f.id));
          interaction.values.forEach(v => selectedFeatures.add(v));
          await interaction.deferUpdate();
          return;
        }

        if (interaction.customId === 'setup:apply') {
          collector.stop('apply');
          await interaction.deferUpdate();

          const results: string[] = [];
          // For each feature, enable if selected, disable if not
          for (const feature of FEATURES) {
            if (feature.id === 'verification' || feature.id === 'regex' || feature.id === 'badwords' || feature.id === 'modlog') {
              if (selectedFeatures.has(feature.id)) {
                results.push(`⚠️ ${feature.emoji} **${feature.label}** — use the button below to finish setup`);
              }
              continue;
            }
            const shouldEnable = selectedFeatures.has(feature.id);
            results.push(await applyFeature(gid, feature.id, shouldEnable));
          }

          const manualSteps: string[] = [];
          if (selectedFeatures.has('verification')) manualSteps.push('• **Verification:** set role/channel via `/v-setup configure`');

          const finalEmbed = new EmbedBuilder()
            .setColor('#57f287')
            .setTitle('✅ Setup Complete')
            .addFields({ name: 'Changes', value: results.join('\n') || 'No changes' });

          if (manualSteps.length > 0) {
            finalEmbed.addFields({ name: '⚠️ Manual steps required', value: manualSteps.join('\n') });
          }

          // Mod log, word filter, and regex filter need more than a simple
          // on/off — instead of pointing to other commands, finish the
          // setup right here (channel picker / modal).
          const followRow = new ActionRowBuilder<ButtonBuilder>();
          if (selectedFeatures.has('modlog'))   followRow.addComponents(new ButtonBuilder().setCustomId('setup:modlog_channel').setLabel('📬 Set log channel').setStyle(ButtonStyle.Primary));
          if (selectedFeatures.has('badwords')) followRow.addComponents(new ButtonBuilder().setCustomId('setup:badwords').setLabel('📋 Set up word filter').setStyle(ButtonStyle.Primary));
          if (selectedFeatures.has('regex'))    followRow.addComponents(new ButtonBuilder().setCustomId('setup:regex').setLabel('🔍 Set up regex filter').setStyle(ButtonStyle.Primary));

          const finalComponents = followRow.components.length > 0 ? [followRow] : [];
          const finalMsg = await interaction.editReply({ embeds: [finalEmbed], components: finalComponents });

          if (followRow.components.length > 0) {
            const followCollector = finalMsg.createMessageComponentCollector({
              filter: i => i.user.id === ix.user.id,
              time: 180_000,
            });

            followCollector.on('collect', async fi => {
              // ── Mod log channel picker ──────────────────────────────────
              if (fi.customId === 'setup:modlog_channel' && fi.isButton()) {
                const select = new ChannelSelectMenuBuilder().setCustomId('setup:modlog_channel_pick').setPlaceholder('Pick a log channel').addChannelTypes(ChannelType.GuildText);
                await fi.reply({ content: 'Pick a log channel:', components: [new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(select)], flags: MessageFlags.Ephemeral });
                return;
              }
              if (fi.customId === 'setup:modlog_channel_pick' && fi.isChannelSelectMenu()) {
                setGuildValue(gid, 'mod_log_channel', fi.values[0]);
                setGuildValue(gid, 'automod_enabled', 1);
                await fi.update({ content: `✅ Log channel set: <#${fi.values[0]}>`, components: [] });
                return;
              }

              // ── Word filter ──────────────────────────────────────────────
              if (fi.customId === 'setup:badwords' && fi.isButton()) {
                const modal = new ModalBuilder().setCustomId('setup:badwords_modal').setTitle('Word Filter');
                modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
                  new TextInputBuilder().setCustomId('words').setLabel('Words, comma-separated').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000),
                ));
                await fi.showModal(modal);
                try {
                  const submit = await fi.awaitModalSubmit({ filter: m => m.customId === 'setup:badwords_modal' && m.user.id === ix.user.id, time: 5 * 60 * 1000 });
                  const words = submit.fields.getTextInputValue('words').split(',').map(w => w.trim()).filter(Boolean);
                  setGuildValue(gid, 'automod_badwords', JSON.stringify(words));
                  setGuildValue(gid, 'automod_enabled', 1);
                  await submit.reply({ embeds: [success('✅ Word filter saved', `${words.length} word(s) active.`)], flags: MessageFlags.Ephemeral });
                } catch { /* timeout / dismissed — nothing to clean up */ }
                return;
              }

              // ── Regex filter ─────────────────────────────────────────────
              if (fi.customId === 'setup:regex' && fi.isButton()) {
                const modal = new ModalBuilder().setCustomId('setup:regex_modal').setTitle('Add Regex Filter');
                modal.addComponents(
                  new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Name').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(50)),
                  new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('pattern').setLabel('Regex pattern').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(200)),
                );
                await fi.showModal(modal);
                try {
                  const submit = await fi.awaitModalSubmit({ filter: m => m.customId === 'setup:regex_modal' && m.user.id === ix.user.id, time: 5 * 60 * 1000 });
                  const name    = submit.fields.getTextInputValue('name');
                  const pattern = submit.fields.getTextInputValue('pattern');
                  try { new RegExp(pattern); } catch {
                    await submit.reply({ embeds: [error('Invalid pattern', 'Not a valid regular expression.')], flags: MessageFlags.Ephemeral });
                    return;
                  }
                  db.prepare('INSERT OR IGNORE INTO automod3_config (guild_id) VALUES (?)').run(gid);
                  const cfg = getAutomod3Config(gid);
                  const filters = JSON.parse(cfg.regex_filters) as { pattern: string; name: string }[];
                  filters.push({ pattern, name });
                  db.prepare('UPDATE automod3_config SET regex_filters = ? WHERE guild_id = ?').run(JSON.stringify(filters), gid);
                  await submit.reply({ embeds: [success('✅ Regex filter added', `**${name}**: \`${pattern}\``)], flags: MessageFlags.Ephemeral });
                } catch { /* timeout / dismissed — nothing to clean up */ }
                return;
              }
            });
          }
        }
      });

      collector.on('end', (_c, reason) => {
        if (reason === 'time') {
          ix.editReply({ embeds: [error('Timeout', 'Setup expired.')], components: [] }).catch(() => {});
        }
      });
    }
  },
};
