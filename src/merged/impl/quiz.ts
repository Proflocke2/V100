import {
  SlashCommandBuilder, ChatInputCommandInteraction, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, EmbedBuilder, ComponentType, ButtonInteraction,
  MessageFlags,
} from 'discord.js';
import { getGuild } from '../../database/db';
import { reservePoints, addPoints, recordLoss } from '../../economy/db/EconomyDB';
import { validateBet } from '../../utils/betHelper';
import { getLocalized, Language } from '../../utils/localization';
import axios from 'axios';

interface TriviaQ {
  question: string;
  correct_answer: string;
  incorrect_answers: string[];
  category: string;
  difficulty: string;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function decodeHtml(str: string) {
  return str.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#039;/g,"'");
}

export default {
  data: new SlashCommandBuilder()
    .setName('quiz')
    .setDescription('Answer a trivia question')
    .addStringOption(o => o.setName('difficulty').setDescription('Difficulty').addChoices(
      { name: 'Easy', value: 'easy' },
      { name: 'Medium', value: 'medium' },
      { name: 'Hard', value: 'hard' },
    )),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = getGuild(interaction.guildId!);
    const lang = (guild.language || 'en') as Language;
    const { bet, warning: betWarning } = validateBet(interaction.options.getInteger('bet') ?? 0, interaction.guildId!);
    if (betWarning) await interaction.followUp({ content: betWarning, ephemeral: true }).catch(() => {});
    const diff = interaction.options.getString('difficulty') ?? 'medium';
    await interaction.deferReply();

    let q: TriviaQ;
    try {
      const res = await axios.get(`https://opentdb.com/api.php?amount=1&type=multiple&difficulty=${diff}`);
      q = res.data.results[0];
    } catch {
      return interaction.editReply('Could not fetch a question. Try again later.');
    }

    const answers = shuffle([q.correct_answer, ...q.incorrect_answers]);
    const letters = ['A', 'B', 'C', 'D'];

    const embed = new EmbedBuilder()
      .setTitle('🧠 Trivia')
      .setColor('#5865f2')
      .setDescription(`**${decodeHtml(q.question)}**`)
      .addFields(answers.map((a, i) => ({ name: letters[i], value: decodeHtml(a), inline: true })))
      .setFooter({ text: `${q.category} • ${diff} • 20 seconds` });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      answers.map((a, i) => new ButtonBuilder()
        .setCustomId(`quiz_${i}_${interaction.id}`)
        .setLabel(letters[i])
        .setStyle(ButtonStyle.Secondary))
    );

    const msg = await interaction.editReply({ embeds: [embed], components: [row] });

    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 20000 });
    const answered = new Set<string>();

    collector.on('collect', async (btn: ButtonInteraction) => {
      if (answered.has(btn.user.id)) {
        await btn.reply({ content: getLocalized('game.alreadyAnswered', lang), ephemeral: true });
        return;
      }
      answered.add(btn.user.id);
      const idx = parseInt(btn.customId.split('_')[1]);
      const chosen = answers[idx];
      const correct = chosen === q.correct_answer;
      if (correct && bet > 0) addPoints(btn.user.id, interaction.guildId!, bet * 2);
      if (!correct && bet > 0) recordLoss(btn.user.id, interaction.guildId!, bet);
      const betLine = bet > 0 ? (correct ? ` 🪙 +${bet * 2} coins!` : ` 🪙 -${bet} coins.`) : '';
      await btn.reply({ content: correct ? `✅ Correct! **${decodeHtml(q.correct_answer)}**${betLine}` : `❌ Wrong! Correct: **${decodeHtml(q.correct_answer)}**${betLine}`, ephemeral: true });
    });

    collector.on('end', () => {
      const disabled = row.components.map((b, i) =>
        ButtonBuilder.from(b.data as any)
          .setDisabled(true)
          .setStyle(answers[i] === q.correct_answer ? ButtonStyle.Success : ButtonStyle.Danger)
      );
      const dRow = new ActionRowBuilder<ButtonBuilder>().addComponents(disabled);
      interaction.editReply({ components: [dRow] }).catch(() => {});
    });
  },
};
