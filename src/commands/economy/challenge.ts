import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { getGuild } from '../../database/db';
import { getLocalized, Language } from '../../utils/localization';
import { ChallengeEngine } from '../../economy/engine/ChallengeEngine';
import { EconomyConfig, ChallengeGame } from '../../economy/config/EconomyConfig';
import { error } from '../../utils/embeds';
import { sendGamblingDisclaimer } from '../../economy/guards/GamblingGuard';
import { checkGambling } from '../../economy/cooldown/checkGambling';
import { validateBet } from '../../utils/betHelper';

export default {
  data: new SlashCommandBuilder()
    .setName('eco-challenge')
    .setDescription('Challenge another user to a coin duel!')
    .addUserOption(o => o.setName('opponent').setDescription('Opponent').setRequired(true))
    .addStringOption(o =>
      o.setName('game').setDescription('Game type').setRequired(true)
        .addChoices(
          { name: '🃏 Blackjack', value: 'blackjack' },
          { name: '🪙 Coin Flip', value: 'coinflip' },
        )
    )
    .addIntegerOption(o =>
      o.setName('bet')
        .setDescription(`Bet (min ${EconomyConfig.SETTINGS.minBet} coins)`)
        .setRequired(true)
        .setMinValue(EconomyConfig.SETTINGS.minBet)
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild    = getGuild(interaction.guildId!);
    const lang     = (guild.language || 'en') as Language;
    const opponent = interaction.options.getUser('opponent', true);
    const game     = interaction.options.getString('game', true) as ChallengeGame;
    const bet      = interaction.options.getInteger('bet', true);
    const guildId  = interaction.guildId!;
    const userId   = interaction.user.id;

    // Validations — before disclaimer, still use reply()
    if (opponent.id === userId)
      return interaction.reply({ embeds: [error(getLocalized('common.error', lang), getLocalized('economy.challenge.self', lang))], ephemeral: true });
    if (opponent.bot)
      return interaction.reply({ embeds: [error(getLocalized('common.error', lang), getLocalized('economy.challenge.bot', lang))], ephemeral: true });

    const betError = ChallengeEngine.validateBet(bet);
    if (betError)
      return interaction.reply({ embeds: [error(getLocalized('economy.challenge.invalid_bet', lang), betError)], ephemeral: true });

    // Enforce server-wide max bet limit
    const { bet: effectiveBet, clamped, warning } = validateBet(bet, guildId);
    if (clamped) {
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor('#fee75c').setDescription(
          `${warning}\n${getLocalized('economy.admin.maxbet_clamped', lang, { amount: effectiveBet.toLocaleString() })}`,
        )],
        ephemeral: true,
      });
    }

    if (ChallengeEngine.hasPending(userId, guildId) || ChallengeEngine.hasPending(opponent.id, guildId))
      return interaction.reply({ embeds: [error(getLocalized('economy.challenge.pending_title', lang), getLocalized('economy.challenge.pending_desc', lang))], ephemeral: true });

    if (!await checkGambling(interaction, userId, guildId)) return;

    await sendGamblingDisclaimer(interaction, {
      type:          'challenge',
      userId,
      guildId,
      channelId:     interaction.channelId,
      bet:           effectiveBet,
      opponentId:    opponent.id,
      challengeGame: game,
    });
  },
};
