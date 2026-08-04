import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { getGuild } from '../../database/db';
import { getLocalized, Language } from '../../utils/localization';
import { transferPoints, getGuildMaxTransfer } from '../../economy/db/EconomyDB';
import { EconomyConfig } from '../../economy/config/EconomyConfig';
import { success, error } from '../../utils/embeds';

export default {
  data: new SlashCommandBuilder()
    .setName('pay')
    .setDescription('Transfer coins to another user')
    .addUserOption(o => o.setName('user').setDescription('Recipient').setRequired(true))
    .addIntegerOption(o =>
      // No Discord-side setMaxValue here — limit is per-guild and read at runtime
      o.setName('amount').setDescription('Amount (min 1)').setRequired(true).setMinValue(1)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild   = getGuild(interaction.guildId!);
    const lang    = (guild.language || 'en') as Language;
    const target  = interaction.options.getUser('user', true);
    const amount  = interaction.options.getInteger('amount', true);
    const guildId = interaction.guildId!;

    if (target.id === interaction.user.id)
      return interaction.reply({ embeds: [error(getLocalized('common.error', lang), getLocalized('economy.pay.self', lang))], ephemeral: true });
    if (target.bot)
      return interaction.reply({ embeds: [error(getLocalized('common.error', lang), getLocalized('economy.pay.bot', lang))], ephemeral: true });

    // Per-guild max transfer enforcement
    const maxTransfer = getGuildMaxTransfer(guildId);
    if (maxTransfer > 0 && amount > maxTransfer) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor('#fee75c')
          .setDescription(`⚠️ The maximum transfer on this server is **🪙 ${maxTransfer.toLocaleString()}**. Your amount (${amount.toLocaleString()}) exceeds this limit.`)],
        ephemeral: true,
      });
    }

    const ok = transferPoints(interaction.user.id, target.id, guildId, amount);
    if (!ok)
      return interaction.reply({ embeds: [error(getLocalized('economy.insufficient', lang))], ephemeral: true });

    const desc = getLocalized('economy.paid', lang, {
      sender:   interaction.user.toString(),
      amount:   EconomyConfig.fmt(amount),
      receiver: target.toString(),
    });
    await interaction.reply({ embeds: [success(getLocalized('economy.pay.transfer', lang), desc)] });
  },
};
