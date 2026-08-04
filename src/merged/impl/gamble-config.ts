/**
 * /gamble-config
 *
 * FIX: replaced raw db.prepare('UPDATE guilds SET gambling_cooldown_ms...') with
 * setGuildValue() — the established safe pattern that goes through ALLOWED_GUILD_KEYS
 * validation and is guaranteed to work even on fresh deployments where the column
 * migration might not have run yet (setGuildValue uses the same guarded path).
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
} from 'discord.js';
import { getGuild, setGuildValue } from '../../database/db';
import { getLocalized, Language } from '../../utils/localization';
import { GamblingCooldown } from '../../economy/cooldown/GamblingCooldown';

export default {
  data: new SlashCommandBuilder()
    .setName('gamble-config')
    .setDescription('Configure gambling cooldown and disclaimer for this server [Admins only]')

    .addSubcommand(sub =>
      sub
        .setName('cooldown')
        .setDescription('Set the cooldown between gambling commands (0 = disabled)')
        .addIntegerOption(opt =>
          opt
            .setName('seconds')
            .setDescription('Seconds between games (0–300)')
            .setMinValue(0)
            .setMaxValue(300)
            .setRequired(true),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('disclaimer')
        .setDescription('Toggle the 18+ gambling disclaimer before each game')
        .addBooleanOption(opt =>
          opt
            .setName('enabled')
            .setDescription('true = show disclaimer, false = start immediately')
            .setRequired(true),
        ),
    )
    .addSubcommand(sub =>
      sub.setName('status').setDescription('Show current gambling settings'),
    ),

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

    if (sub === 'cooldown') {
      const seconds = interaction.options.getInteger('seconds', true);
      const ms      = seconds * 1_000;

      // FIX: use setGuildValue() — safe, validated, works on fresh DBs
      setGuildValue(guildId, 'gambling_cooldown_ms', ms);

      const desc = seconds === 0
        ? getLocalized('gamblecfg.cooldown_zero', lang)
        : getLocalized('gamblecfg.cooldown_desc', lang, { seconds: String(seconds), ms: String(ms) });

      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(seconds === 0 ? '#fee75c' : '#57f287')
          .setTitle(getLocalized('gamblecfg.cooldown_set', lang))
          .setDescription(desc)],
        ephemeral: true,
      });
      return;
    }

    if (sub === 'disclaimer') {
      const enabled = interaction.options.getBoolean('enabled', true);

      // FIX: use setGuildValue() — also ensures guild row exists first
      setGuildValue(guildId, 'gambling_disclaimer', enabled ? 1 : 0);

      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(enabled ? '#57f287' : '#ed4245')
          .setTitle(getLocalized('gamblecfg.title', lang))
          .setDescription(getLocalized(
            enabled ? 'gamblecfg.disclaimer_on' : 'gamblecfg.disclaimer_off',
            lang,
          ))],
        ephemeral: true,
      });
      return;
    }

    // status
    const cdMs      = typeof guild.gambling_cooldown_ms === 'number'
      ? guild.gambling_cooldown_ms
      : GamblingCooldown.GLOBAL_CD_MS;
    const cdSecs    = cdMs / 1_000;
    const disclaimerOn = guild.gambling_disclaimer !== 0;

    await interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor('#5865f2')
        .setTitle(getLocalized('gamblecfg.status_title', lang))
        .addFields(
          {
            name:   getLocalized('gamblecfg.status_cooldown', lang),
            value:  cdSecs === 0
              ? getLocalized('gamblecfg.status_cooldown_off', lang)
              : getLocalized('gamblecfg.status_cooldown_val', lang, { seconds: String(cdSecs) }),
            inline: true,
          },
          {
            name:   getLocalized('gamblecfg.status_disclaimer', lang),
            value:  getLocalized(
              disclaimerOn ? 'gamblecfg.status_disclaimer_on' : 'gamblecfg.status_disclaimer_off',
              lang,
            ),
            inline: true,
          },
        )
        .setTimestamp()],
      ephemeral: true,
    });
  },
};
