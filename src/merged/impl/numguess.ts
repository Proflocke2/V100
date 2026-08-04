import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ButtonInteraction,
  ModalBuilder, TextInputBuilder, TextInputStyle, ModalSubmitInteraction,
} from 'discord.js';
import { getGuild } from '../../database/db';
import { reservePoints, addPoints, recordLoss } from '../../economy/db/EconomyDB';
import { validateBet } from '../../utils/betHelper';
import { getLocalized, Language } from '../../utils/localization';

export default {
  data: new SlashCommandBuilder()
    .setName('numguess')
    .setDescription('Guess the number (1-100)')
    .addIntegerOption(o => o.setName('max').setDescription('Max number (default 100)').setMinValue(10).setMaxValue(1000)),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = getGuild(interaction.guildId!);
    const lang = (guild.language || 'en') as Language;
    const { bet, warning: betWarning } = validateBet(interaction.options.getInteger('bet') ?? 0, interaction.guildId!);
    const max = interaction.options.getInteger('max') ?? 100;
    const secret = Math.floor(Math.random() * max) + 1;
    let attempts = 0;
    const maxAttempts = Math.ceil(Math.log2(max)) + 2;

    const embed = (desc: string, color = '#5865f2') => new EmbedBuilder()
      .setTitle('🔢 Number Guessing')
      .setColor(color as any)
      .setDescription(desc)
      .setFooter({ text: `${maxAttempts - attempts} attempts left • Range: 1-${max}` });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('guess_input').setLabel('Make a Guess').setStyle(ButtonStyle.Primary)
    );

    if (betWarning) { await interaction.followUp({ content: betWarning, ephemeral: true }).catch(() => {}); }
    const msg = await interaction.reply({
      embeds: [embed(`I'm thinking of a number between **1** and **${max}**. Can you guess it?`)],
      components: [row],
      fetchReply: true,
    });

    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120000 });

    collector.on('collect', async (btn: ButtonInteraction) => {
      if (btn.user.id !== interaction.user.id) { await btn.reply({ content: getLocalized('game.notYourGame', lang), ephemeral: true }); return; }

      const modal = new ModalBuilder()
        .setCustomId('guess_modal')
        .setTitle('Your Guess')
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('guess_value').setLabel(`Number between 1 and ${max}`).setStyle(TextInputStyle.Short).setRequired(true)
          )
        );

      await btn.showModal(modal);

      const submitted = await btn.awaitModalSubmit({ time: 30000 }).catch(() => null) as ModalSubmitInteraction | null;
      if (!submitted) return;

      const val = parseInt(submitted.fields.getTextInputValue('guess_value'));
      if (isNaN(val) || val < 1 || val > max) {
        await submitted.reply({ content: `Enter a number between 1 and ${max}.`, ephemeral: true });
        return;
      }

      attempts++;
      await submitted.deferUpdate();

      if (val === secret) {
        if (bet > 0) addPoints(interaction.user.id, interaction.guildId!, bet * 2);
        collector.stop();
        await interaction.editReply({ embeds: [embed(`🎉 Correct! The number was **${secret}**!\nYou got it in **${attempts}** attempt(s).${bet > 0 ? `\n🪙 +${bet * 2} coins!` : ''}`, '#57f287')], components: [] });
      } else if (attempts >= maxAttempts) {
        if (bet > 0) recordLoss(interaction.user.id, interaction.guildId!, bet);
        collector.stop();
        await interaction.editReply({ embeds: [embed(`💀 Out of attempts! The number was **${secret}**.${bet > 0 ? `\n🪙 -${bet} coins.` : ''}`, '#ed4245')], components: [] });
      } else {
        const hint = val < secret ? '📈 Too low!' : '📉 Too high!';
        await interaction.editReply({ embeds: [embed(`${hint}\nYour guess: **${val}**`)], components: [row] });
      }
    });

    collector.on('end', (_, reason) => {
      if (reason === 'time') interaction.editReply({ embeds: [embed(`⏰ Time's up! The number was **${secret}**.`, '#fee75c')], components: [] }).catch(() => {});
    });
  },
};
