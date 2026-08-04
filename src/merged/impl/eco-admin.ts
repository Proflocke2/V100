import { requireAdmin } from '../../utils/guards';
import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { getGuild } from '../../database/db';
import { getLocalized, Language } from '../../utils/localization';
import {
  addPoints, setPoints, getEconomyUser,
  getGuildMaxBet, setGuildMaxBet,
  getGuildMaxTransfer, setGuildMaxTransfer,
  logAdminAction,
} from '../../economy/db/EconomyDB';
import { EconomyConfig } from '../../economy/config/EconomyConfig';
import { success, error } from '../../utils/embeds';

export default {
  data: new SlashCommandBuilder()
    .setName('eco-admin')
    .setDescription('Economy admin commands [Admin only]')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s =>
      s.setName('add').setDescription('Add or subtract coins')
        .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
        .addIntegerOption(o => o.setName('amount').setDescription('Amount (negative = subtract)').setRequired(true))
    )
    .addSubcommand(s =>
      s.setName('set').setDescription('Set coins to a fixed value')
        .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
        .addIntegerOption(o => o.setName('amount').setDescription('New amount').setRequired(true).setMinValue(0))
    )
    .addSubcommand(s =>
      s.setName('info').setDescription('Show detailed economy info for a user')
        .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
    )
    .addSubcommand(s =>
      s.setName('maxbet').setDescription('Set or remove the server-wide max bet limit')
        .addIntegerOption(o => o.setName('amount').setDescription('Max bet limit (0 = no limit)').setRequired(true).setMinValue(0))
    )
    .addSubcommand(s =>
      s.setName('maxtransfer').setDescription('Set or remove the server-wide max /pay transfer limit')
        .addIntegerOption(o => o.setName('amount').setDescription('Max coins per /pay (0 = no limit)').setRequired(true).setMinValue(0))
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!await requireAdmin(interaction)) return;
    const guild   = getGuild(interaction.guildId!);
    const lang    = (guild.language || 'en') as Language;
    const sub     = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;

    if (sub === 'add') {
      const target = interaction.options.getUser('user', true);
      const amount = interaction.options.getInteger('amount', true);
      const before = getEconomyUser(target.id, guildId);
      const user   = addPoints(target.id, guildId, amount);
      // Audit log (G)
      logAdminAction(guildId, interaction.user.id, target.id, 'add', amount, before.points, user.points);
      const sign   = amount >= 0 ? '+' : '';
      return interaction.reply({
        embeds: [success(
          getLocalized('economy.admin.adjusted', lang),
          `<@${target.id}>\n${sign}${amount} → ${getLocalized('economy.balance', lang)}: **${user.points.toLocaleString()}**`,
        )],
      });
    }

    if (sub === 'set') {
      const target = interaction.options.getUser('user', true);
      const amount = interaction.options.getInteger('amount', true);
      const before = getEconomyUser(target.id, guildId);
      const user   = setPoints(target.id, guildId, amount);
      // Audit log (G)
      logAdminAction(guildId, interaction.user.id, target.id, 'set', amount, before.points, user.points);
      return interaction.reply({
        embeds: [success(
          getLocalized('economy.admin.set', lang),
          getLocalized('economy.admin.set_desc', lang, {
            user:   `<@${target.id}>`,
            amount: user.points.toLocaleString(),
          }),
        )],
      });
    }

    if (sub === 'info') {
      const target = interaction.options.getUser('user', true);
      const user = getEconomyUser(target.id, guildId);
      return interaction.reply({
        embeds: [success(
          getLocalized('economy.admin.info', lang),
          [
            `**${getLocalized('common.user', lang)}:** <@${target.id}>`,
            `**${getLocalized('economy.balance', lang)}:** ${user.points.toLocaleString()} coins`,
            `**${getLocalized('economy.admin.won', lang)}:** ${user.totalWon.toLocaleString()}`,
            `**${getLocalized('economy.admin.lost', lang)}:** ${user.totalLost.toLocaleString()}`,
            `**${getLocalized('economy.admin.games', lang)}:** ${user.gamesPlayed}`,
          ].join('\n'),
        )],
      });
    }

    if (sub === 'maxbet') {
      const amount  = interaction.options.getInteger('amount', true);
      const prev    = getGuildMaxBet(guildId);
      setGuildMaxBet(guildId, amount);

      const noLimit  = amount === 0;
      const prevText = prev === 0
        ? getLocalized('economy.admin.maxbet_prev_none', lang)
        : `🪙 **${prev.toLocaleString()}**`;

      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(noLimit ? '#fee75c' : '#57f287')
          .setTitle(getLocalized('economy.admin.maxbet_title', lang))
          .addFields(
            { name: getLocalized('economy.admin.maxbet_prev', lang), value: prevText, inline: true },
            { name: getLocalized('economy.admin.maxbet_new', lang),  value: noLimit ? getLocalized('economy.admin.maxbet_none', lang) : `🪙 **${amount.toLocaleString()}**`, inline: true },
          )
          .setDescription(
            noLimit
              ? getLocalized('economy.admin.maxbet_removed', lang)
              : getLocalized('economy.admin.maxbet_set', lang, { amount: amount.toLocaleString() }),
          )],
        ephemeral: true,
      });
    }

    if (sub === 'maxtransfer') {
      const amount  = interaction.options.getInteger('amount', true);
      const prev    = getGuildMaxTransfer(guildId);
      setGuildMaxTransfer(guildId, amount);

      const noLimit  = amount === 0;
      const prevText = prev === 0 ? '∞ No limit' : `🪙 **${prev.toLocaleString()}**`;

      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(noLimit ? '#fee75c' : '#57f287')
          .setTitle('🔁 Max Transfer Updated')
          .addFields(
            { name: 'Previous limit', value: prevText,                                                              inline: true },
            { name: 'New limit',      value: noLimit ? '∞ No limit' : `🪙 **${amount.toLocaleString()}**`,         inline: true },
          )
          .setDescription(
            noLimit
              ? '✅ Max transfer limit **removed** — players can send any amount via `/pay`.'
              : `✅ Max transfer set to **🪙 ${amount.toLocaleString()}**.\n\`/pay\` amounts exceeding this are rejected.`,
          )],
        ephemeral: true,
      });
    }
  },
};
