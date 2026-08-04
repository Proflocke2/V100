/**
 * /auto-defend
 *
 * FIX: updateSecurityConfig() called with `{ auto_defend: 0 }` — the value 0
 * passed through `?? null` in the original was fine, but the TypeScript cast
 * `as any` was hiding that `SecurityConfig` already includes these fields.
 * Rewritten with explicit typing so the compiler catches future mismatches.
 *
 * FIX: handleEnable called `return void await` — replaced with explicit await
 * + return to make async flow explicit and avoid any void-return confusion.
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
} from 'discord.js';
import {
  getSecurityConfig,
  updateSecurityConfig,
  SecurityConfig,
  DefendAction,
} from '../../modules/security/securityEngine';
import { getGuild } from '../../database/db';
import { getLocalized, Language } from '../../utils/localization';

// ─────────────────────────────────────────────────────────────────────────────

const ATTACK_TYPES = ['raid', 'spam', 'phishing', 'mass_ping', 'link'] as const;
type AttackType = typeof ATTACK_TYPES[number];

const DB_KEY: Record<AttackType, keyof SecurityConfig> = {
  raid:      'defend_raid',
  spam:      'defend_spam',
  phishing:  'defend_phishing',
  mass_ping: 'defend_mass_ping',
  link:      'defend_link',
};

// ─────────────────────────────────────────────────────────────────────────────

export default {
  data: new SlashCommandBuilder()
    .setName('auto-defend')
    .setDescription('Configure automatic bot actions against attacks [Admins only]')

    .addSubcommand(sub =>
      sub.setName('enable').setDescription('Activate automatic bot defense against attacks'),
    )
    .addSubcommand(sub =>
      sub.setName('disable').setDescription('Deactivate auto-defend (severity-based actions apply again)'),
    )
    .addSubcommand(sub =>
      sub
        .setName('set')
        .setDescription('Set the automatic action for a specific attack type')
        .addStringOption(opt =>
          opt
            .setName('attack')
            .setDescription('Which attack type to configure')
            .setRequired(true)
            .addChoices(
              { name: '🚨 Raid (mass joins)',      value: 'raid' },
              { name: '💬 Spam (message flood)',   value: 'spam' },
              { name: '🎣 Phishing links',         value: 'phishing' },
              { name: '📢 Mass-Ping / @everyone',  value: 'mass_ping' },
              { name: '🔗 Invite links',           value: 'link' },
            ),
        )
        .addStringOption(opt =>
          opt
            .setName('action')
            .setDescription('What the bot should do automatically')
            .setRequired(true)
            .addChoices(
              { name: '🔨 Ban — permanent ban + 1d message delete',      value: 'ban' },
              { name: '👢 Kick — remove from server',                    value: 'kick' },
              { name: '⏱️ Timeout — 10 min mute',                        value: 'timeout' },
              { name: '🔒 Lockdown — lock all channels + kick attacker', value: 'lockdown' },
              { name: '⚠️ Warn — DM warning only (no punishment)',        value: 'warn' },
            ),
        ),
    )
    .addSubcommand(sub =>
      sub.setName('status').setDescription('Show current auto-defend configuration'),
    ),

  // ─────────────────────────────────────────────────────────────────────────

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const hasPerms =
      interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
      interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);

    if (!hasPerms) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor('#ed4245')
          .setDescription('❌ You need **Manage Server** permission to use this command.')],
        ephemeral: true,
      });
      return;
    }

    const guildId = interaction.guildId!;
    const guild   = getGuild(guildId);
    const lang    = (guild.language || 'en') as Language;
    const sub     = interaction.options.getSubcommand();

    if (sub === 'enable' || sub === 'disable') {
      const enable = sub === 'enable';
      // FIX: explicit typed patch — no `as any` needed, SecurityConfig has auto_defend: number
      updateSecurityConfig(guildId, { auto_defend: enable ? 1 : 0 });

      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(enable ? '#57f287' : '#ed4245')
          .setTitle(getLocalized('autodefend.title', lang))
          .setDescription(getLocalized(
            enable ? 'autodefend.enabled' : 'autodefend.disabled',
            lang,
          ))],
        ephemeral: true,
      });
      return;
    }

    if (sub === 'set') {
      const attack = interaction.options.getString('attack', true) as AttackType;
      const action = interaction.options.getString('action', true) as DefendAction;
      const dbKey  = DB_KEY[attack];

      // FIX: explicit typed patch using keyof SecurityConfig
      updateSecurityConfig(guildId, { [dbKey]: action } as Partial<SecurityConfig>);

      const attackLabel: Record<AttackType, string> = {
        raid:      getLocalized('autodefend.field_raid', lang),
        spam:      getLocalized('autodefend.field_spam', lang),
        phishing:  getLocalized('autodefend.field_phishing', lang),
        mass_ping: getLocalized('autodefend.field_ping', lang),
        link:      getLocalized('autodefend.field_link', lang),
      };

      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#57f287')
          .setTitle(getLocalized('autodefend.title', lang))
          .setDescription(getLocalized('autodefend.action_set', lang, {
            attack: attackLabel[attack],
            action,
          }))],
        ephemeral: true,
      });
      return;
    }

    // status
    const cfg = getSecurityConfig(guildId);
    const isActive = cfg.auto_defend === 1;

    const al = (action: string) => getLocalized(`autodefend.action_${action}` as any, lang);

    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(isActive ? '#57f287' : '#ed4245')
        .setTitle(getLocalized('autodefend.status_title', lang))
        .addFields(
          { name: getLocalized('autodefend.status_mode', lang),    value: getLocalized(isActive ? 'autodefend.mode_on' : 'autodefend.mode_off', lang), inline: false },
          { name: getLocalized('autodefend.field_raid', lang),      value: al(cfg.defend_raid     ?? 'lockdown'), inline: true },
          { name: getLocalized('autodefend.field_spam', lang),      value: al(cfg.defend_spam     ?? 'timeout'),  inline: true },
          { name: getLocalized('autodefend.field_phishing', lang),  value: al(cfg.defend_phishing ?? 'ban'),      inline: true },
          { name: getLocalized('autodefend.field_ping', lang),      value: al(cfg.defend_mass_ping ?? 'kick'),    inline: true },
          { name: getLocalized('autodefend.field_link', lang),      value: al(cfg.defend_link     ?? 'warn'),     inline: true },
        )
        .setFooter({ text: getLocalized('autodefend.hint', lang) })
        .setTimestamp()],
      ephemeral: true,
    });
  },
};
