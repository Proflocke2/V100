import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder,
  ButtonBuilder, ButtonStyle, ActionRowBuilder, ButtonInteraction,
} from 'discord.js';
import { success, error } from '../../utils/embeds';

interface TriviaQuestion { q: string; options: string[]; answer: number; }

const QUESTIONS: TriviaQuestion[] = [
  { q: 'How many sides does a hexagon have?', options: ['5','6','7','8'], answer: 1 },
  { q: 'What is the capital of France?', options: ['Berlin','Madrid','Paris','Rome'], answer: 2 },
  { q: 'Which planet is closest to the Sun?', options: ['Venus','Earth','Mercury','Mars'], answer: 2 },
  { q: 'What is 12 × 12?', options: ['132','144','154','124'], answer: 1 },
  { q: 'How many continents are there?', options: ['5','6','7','8'], answer: 2 },
  { q: 'What is H₂O?', options: ['Hydrogen','Helium','Water','Oxygen'], answer: 2 },
  { q: 'Which animal is the fastest on land?', options: ['Lion','Cheetah','Horse','Leopard'], answer: 1 },
  { q: 'How many strings does a standard guitar have?', options: ['4','5','6','7'], answer: 2 },
  { q: 'What year did WW2 end?', options: ['1943','1944','1945','1946'], answer: 2 },
  { q: 'What is the largest ocean?', options: ['Atlantic','Indian','Arctic','Pacific'], answer: 3 },
  { q: 'How many bones in the adult human body?', options: ['196','206','216','226'], answer: 1 },
  { q: 'What is the chemical symbol for Gold?', options: ['Ag','Go','Gd','Au'], answer: 3 },
  { q: 'Which country invented pizza?', options: ['France','Spain','Italy','Greece'], answer: 2 },
  { q: 'How many minutes in a day?', options: ['1200','1440','1400','1480'], answer: 1 },
  { q: 'What is the speed of light (approx km/s)?', options: ['200k','300k','400k','500k'], answer: 1 },
];

const LETTERS = ['🇦','🇧','🇨','🇩'];
const WIN_SCORE = 5;
const pendingDuels = new Map<string, { challengerId: string; expiresAt: number }>();

export default {
  data: new SlashCommandBuilder()
    .setName('triviaduel')
    .setDescription('Challenge someone to a Trivia Duel (first to 5 wins)')
    .addUserOption(o => o.setName('opponent').setDescription('Your opponent').setRequired(true)),

  async execute(ix: ChatInputCommandInteraction) {
    const challenger = ix.user;
    const opponent = ix.options.getUser('opponent', true);
    if (opponent.bot || opponent.id === challenger.id)
      return ix.reply({ embeds: [error('Invalid opponent')], ephemeral: true });

    const key = `${ix.guildId}-${challenger.id}-${opponent.id}`;
    pendingDuels.set(key, { challengerId: challenger.id, expiresAt: Date.now() + 60_000 });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`td_accept_${key}`).setLabel('Accept').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`td_decline_${key}`).setLabel('Decline').setStyle(ButtonStyle.Danger),
    );

    const msg = await ix.reply({
      content: `<@${opponent.id}>, you've been challenged to a Trivia Duel by **${challenger.username}**!`,
      embeds: [new EmbedBuilder().setColor('#f0a500').setTitle('🎯 Trivia Duel Challenge').setDescription(`First to **${WIN_SCORE}** correct answers wins!\n\nYou have 60 seconds to accept.`)],
      components: [row], fetchReply: true,
    });

    const col = msg.createMessageComponentCollector({ time: 60_000 });
    col.on('collect', async (btn: ButtonInteraction) => {
      if (btn.user.id !== opponent.id) return btn.reply({ content: 'Not your challenge!', ephemeral: true });
      col.stop();

      if (btn.customId.startsWith('td_decline')) {
        pendingDuels.delete(key);
        return btn.update({ content: `${opponent.username} declined the duel.`, components: [], embeds: [] });
      }

      // Start game
      pendingDuels.delete(key);
      const scores: Record<string, number> = { [challenger.id]: 0, [opponent.id]: 0 };
      const players = [challenger, opponent];
      let turnIdx = 0;
      const usedQs = new Set<number>();

      const getNextQ = (): TriviaQuestion & { idx: number } => {
        let i: number;
        do { i = Math.floor(Math.random() * QUESTIONS.length); } while (usedQs.has(i) && usedQs.size < QUESTIONS.length);
        usedQs.add(i);
        return { ...QUESTIONS[i], idx: i };
      };

      const playRound = async () => {
        if (scores[challenger.id] >= WIN_SCORE || scores[opponent.id] >= WIN_SCORE) {
          const winner = scores[challenger.id] >= WIN_SCORE ? challenger : opponent;
          return btn.editReply({
            content: '',
            embeds: [new EmbedBuilder().setColor('#57f287').setTitle('🏆 Trivia Duel — Game Over!')
              .setDescription(`**${winner.username}** wins!\n\n${challenger.username}: ${scores[challenger.id]} | ${opponent.username}: ${scores[opponent.id]}`)],
            components: [],
          });
        }

        const cur = players[turnIdx % 2];
        const q = getNextQ();
        const qRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          q.options.map((opt, i) =>
            new ButtonBuilder().setCustomId(`td_ans_${i}`).setLabel(`${LETTERS[i].replace(/\u{200D}|\u{FE0F}/gu,'')} ${opt}`).setStyle(ButtonStyle.Primary)
          ),
        );

        await btn.editReply({
          content: `<@${cur.id}>'s turn`,
          embeds: [new EmbedBuilder().setColor('#5865f2').setTitle('🎯 Trivia Duel')
            .setDescription(`**${q.q}**`)
            .addFields(
              { name: `${challenger.username}`, value: `${scores[challenger.id]}/${WIN_SCORE}`, inline: true },
              { name: `${opponent.username}`, value: `${scores[opponent.id]}/${WIN_SCORE}`, inline: true },
            )
            .setFooter({ text: `${cur.username} — 20s to answer` })],
          components: [qRow],
        });

        const ansColl = msg.createMessageComponentCollector({ time: 20_000, max: 1,
          filter: (b) => b.user.id === cur.id && b.customId.startsWith('td_ans_'),
        });

        ansColl.on('end', async (collected) => {
          const ans = collected.first();
          const chosen = ans ? parseInt(ans.customId.split('_')[2]) : -1;
          const correct = chosen === q.answer;

          if (correct && ans) scores[cur.id]++;
          const feedback = correct ? '✅ Correct!' : ans ? `❌ Wrong! Answer: **${q.options[q.answer]}**` : `⏰ Time up! Answer: **${q.options[q.answer]}**`;
          if (ans) await ans.reply({ content: feedback, ephemeral: true }).catch(() => {});
          turnIdx++;
          setTimeout(playRound, 2000);
        });
      };

      await playRound();
    });

    col.on('end', (_, reason) => {
      if (reason === 'time') {
        pendingDuels.delete(key);
        ix.editReply({ content: 'Challenge expired.', components: [], embeds: [] }).catch(() => {});
      }
    });
  },
};
