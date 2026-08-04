import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { getGuild } from '../../database/db';
import { Language, getLocalized } from '../../utils/localization';
import { EconomyConfig } from '../../economy/config/EconomyConfig';
import { sendGamblingDisclaimer } from '../../economy/guards/GamblingGuard';
import { checkGambling } from '../../economy/cooldown/checkGambling';
import { validateBet } from '../../utils/betHelper';

export default {
  data: new SlashCommandBuilder()
    .setName('slots')
    .setDescription('Play the slot machine (3×3 grid, 5 win lines)!')
    .addIntegerOption(o =>
      o.setName('bet')
        .setDescription(`Bet amount (min ${EconomyConfig.SETTINGS.minBet} coins)`)
        .setRequired(true)
        .setMinValue(EconomyConfig.SETTINGS.minBet)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild   = getGuild(interaction.guildId!);
    const lang    = (guild.language || 'en') as Language;
    const raw     = interaction.options.getInteger('bet', true);
    const guildId = interaction.guildId!;
    const userId  = interaction.user.id;

    // Enforce server-wide max bet limit
    const { bet, clamped, warning } = validateBet(raw, guildId);
    if (clamped) {
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor('#fee75c').setDescription(
          `${warning}\n${getLocalized('economy.admin.maxbet_clamped', lang, { amount: bet.toLocaleString() })}`,
        )],
        ephemeral: true,
      });
      return;
    }

    if (!await checkGambling(interaction, userId, guildId)) return;

    await sendGamblingDisclaimer(interaction, {
      type:      'slots',
      userId,
      guildId,
      channelId: interaction.channelId,
      bet,
    });
  },
};
