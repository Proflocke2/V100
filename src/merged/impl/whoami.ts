import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder,
  ButtonBuilder, ButtonStyle, ActionRowBuilder, ButtonInteraction,
  ModalBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('whoami')
    .setDescription('Who Am I? — one player picks a character, others ask Yes/No questions')
    .addUserOption(o => o.setName('host').setDescription('Who picks the character').setRequired(false)),

  async execute(ix: ChatInputCommandInteraction) {
    const host = ix.options.getUser('host') ?? ix.user;

    // Step 1: Host sets the character via DM/modal
    const setupModal = new ModalBuilder().setCustomId('whoami_setup').setTitle('Who Am I? — Set Character');
    setupModal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId('character').setLabel('Character / Person / Fictional figure')
          .setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('e.g. Elon Musk, Gandalf, Batman…'),
      ),
    );

    if (host.id !== ix.user.id) {
      await ix.reply({ content: `<@${host.id}>, you were chosen as the host! I'll DM you to set the character.`, ephemeral: false });
      // Can't force DM modal — fallback: ask in ephemeral
      return ix.followUp({ content: `<@${host.id}>, please use \`/whoami\` yourself to host.`, ephemeral: true });
    }

    await ix.showModal(setupModal);
    const modal = await ix.awaitModalSubmit({ time: 120_000 }).catch(() => null);
    if (!modal) return;

    const character = modal.fields.getTextInputValue('character');
    const hint = character.length > 0 ? `**${character.split('').map(() => '?').join('')}** (${character.length} chars)` : '?';

    const embed = () => new EmbedBuilder()
      .setTitle('🕵️ Wer bin ich? / Who Am I?')
      .setColor('#f0a500')
      .setDescription(`**<@${host.id}>** is thinking of a character!\nAsk **Yes/No** questions to figure out who it is.\n\nCharacter hint: ${hint}`)
      .setFooter({ text: 'Click "Ask Question" to guess. Host clicks Yes/No. Click "Reveal" to end.' });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('wai_ask').setLabel('Ask Question').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('wai_yes').setLabel('✅ Yes').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('wai_no').setLabel('❌ No').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('wai_reveal').setLabel('Reveal').setStyle(ButtonStyle.Secondary),
    );

    await modal.reply({ embeds: [embed()], components: [row] });
    const msg = await modal.fetchReply();

    const questions: string[] = [];
    let lastQuestion = '';

    const col = msg.createMessageComponentCollector({ time: 1_800_000 }); // 30min
    col.on('collect', async (btn: ButtonInteraction) => {
      if (btn.customId === 'wai_ask') {
        if (btn.user.id === host.id) return btn.reply({ content: 'You are the host!', ephemeral: true });
        const qModal = new ModalBuilder().setCustomId('wai_qmodal').setTitle('Ask a Yes/No Question');
        qModal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId('q').setLabel('Your question').setStyle(TextInputStyle.Short).setRequired(true),
        ));
        await btn.showModal(qModal);
        const sub = await btn.awaitModalSubmit({ time: 30_000 }).catch(() => null);
        if (!sub) return;
        lastQuestion = `**${btn.user.username}** asks: *${sub.fields.getTextInputValue('q')}*`;
        questions.push(lastQuestion);
        await sub.reply({ content: `Question sent! The host will answer.`, ephemeral: true });
        await modal.editReply({
          embeds: [embed().addFields({ name: 'Latest Question', value: lastQuestion })
            .addFields({ name: 'Previous Questions', value: questions.slice(-5).join('\n') || 'None' })],
          components: [row],
        });
        return;
      }

      if (btn.customId === 'wai_yes' || btn.customId === 'wai_no') {
        if (btn.user.id !== host.id) return btn.reply({ content: 'Only the host can answer!', ephemeral: true });
        const ans = btn.customId === 'wai_yes' ? '✅ **Yes**' : '❌ **No**';
        if (lastQuestion) questions[questions.length - 1] += ` → ${ans}`;
        await btn.update({
          embeds: [embed().addFields({ name: 'Q&A Log', value: questions.slice(-8).join('\n') || 'None' })],
          components: [row],
        });
        return;
      }

      if (btn.customId === 'wai_reveal') {
        if (btn.user.id !== host.id) return btn.reply({ content: 'Only the host can reveal!', ephemeral: true });
        col.stop();
        await btn.update({
          embeds: [new EmbedBuilder().setTitle('🎉 Who Am I? — Revealed!').setColor('#57f287')
            .setDescription(`The character was: **${character}**!\n\n${questions.slice(-8).join('\n') || 'No questions asked.'}`)],
          components: [],
        });
      }
    });
  },
};
