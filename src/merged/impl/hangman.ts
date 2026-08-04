import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, ButtonInteraction,
  MessageFlags,
} from 'discord.js';
import { getGuild } from '../../database/db';
import { reservePoints, addPoints, recordLoss } from '../../economy/db/EconomyDB';
import { validateBet } from '../../utils/betHelper';
import { getLocalized, Language } from '../../utils/localization';

const WORDS: Record<string, string[]> = {
  animals: ['elephant', 'giraffe', 'penguin', 'crocodile', 'butterfly', 'cheetah', 'platypus', 'flamingo'],
  tech: ['javascript', 'typescript', 'database', 'algorithm', 'framework', 'variable', 'function', 'interface'],
  food: ['spaghetti', 'guacamole', 'quesadilla', 'enchilada', 'croissant', 'tiramisu', 'bruschetta'],
};

const STAGES = [
  '```\n  +---+\n  |   |\n      |\n      |\n      |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n      |\n      |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n  |   |\n      |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n /|   |\n      |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n      |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n /    |\n      |\n=========```',
  '```\n  +---+\n  |   |\n  O   |\n /|\\  |\n / \\  |\n      |\n=========```',
];

export default {
  data: new SlashCommandBuilder()
    .setName('hangman')
    .setDescription('Play hangman')
    .addStringOption(o => o.setName('category').setDescription('Word category').addChoices(
      { name: 'Animals', value: 'animals' },
      { name: 'Tech', value: 'tech' },
      { name: 'Food', value: 'food' },
    )),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = getGuild(interaction.guildId!);
    const lang = (guild.language || 'en') as Language;
    const { bet, warning: betWarning } = validateBet(interaction.options.getInteger('bet') ?? 0, interaction.guildId!);
    const cat = (interaction.options.getString('category') ?? 'animals') as keyof typeof WORDS;
    const words = WORDS[cat];
    const word = words[Math.floor(Math.random() * words.length)];
    const guessed = new Set<string>();
    let wrong = 0;
    const maxWrong = STAGES.length - 1;

    const display = () => word.split('').map(c => (guessed.has(c) ? c : '_')).join(' ');
    const wrongLetters = () => [...guessed].filter(c => !word.includes(c)).join(' ') || 'None';

    const buildEmbed = () => new EmbedBuilder()
      .setTitle('🪝 Hangman')
      .setColor(wrong >= maxWrong ? '#ed4245' : '#5865f2')
      .setDescription(`${STAGES[wrong]}\n\n**Word:** \`${display()}\`\n**Wrong:** ${wrongLetters()}\n**Category:** ${cat}`)
      .setFooter({ text: `${maxWrong - wrong} lives left` });

    const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const buildRows = () => {
      const rows: ActionRowBuilder<ButtonBuilder>[] = [];
      for (let i = 0; i < LETTERS.length; i += 5) {
        const row = new ActionRowBuilder<ButtonBuilder>();
        LETTERS.slice(i, i + 5).forEach(l => {
          row.addComponents(new ButtonBuilder()
            .setCustomId(`hang_${l}`)
            .setLabel(l)
            .setStyle(guessed.has(l.toLowerCase()) ? (word.includes(l.toLowerCase()) ? ButtonStyle.Success : ButtonStyle.Danger) : ButtonStyle.Secondary)
            .setDisabled(guessed.has(l.toLowerCase()) || wrong >= maxWrong));
        });
        rows.push(row);
      }
      return rows.slice(0, 5);
    };

    if (betWarning) { await interaction.followUp({ content: betWarning, ephemeral: true }).catch(() => {}); }
    const msg = await interaction.reply({ embeds: [buildEmbed()], components: buildRows(), fetchReply: true });
    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 180000 });

    collector.on('collect', async (btn: ButtonInteraction) => {
      if (btn.user.id !== interaction.user.id) {
        await btn.reply({ content: getLocalized('game.notYourGame', lang), ephemeral: true });
        return;
      }
      const letter = btn.customId.split('_')[1].toLowerCase();
      guessed.add(letter);
      if (!word.includes(letter)) wrong++;
      await btn.deferUpdate();

      const won = word.split('').every(c => guessed.has(c));
      const lost = wrong >= maxWrong;

      if (won || lost) {
        if (won && bet > 0) addPoints(interaction.user.id, interaction.guildId!, bet * 2);
        if (lost && bet > 0) recordLoss(interaction.user.id, interaction.guildId!, bet);
        const betLine = bet > 0 ? (won ? `\n🪙 +${bet * 2} coins!` : `\n🪙 -${bet} coins.`) : '';
        const result = new EmbedBuilder()
          .setTitle(won ? '🎉 You won!' : '💀 Game over')
          .setColor(won ? '#57f287' : '#ed4245')
          .setDescription(`${STAGES[wrong]}\n\nThe word was: **${word}**${betLine}`);
        await interaction.editReply({ embeds: [result], components: buildRows() });
        collector.stop();
      } else {
        await interaction.editReply({ embeds: [buildEmbed()], components: buildRows() });
      }
    });
  },
};
