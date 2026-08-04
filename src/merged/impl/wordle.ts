import {
  SlashCommandBuilder, ChatInputCommandInteraction,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ButtonInteraction, ModalBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import db from '../../database/db';

const WORD_LIST = [
  'crane','slate','audio','raise','arose','stare','snare','share','shale','shine',
  'store','score','pride','prime','prize','price','brine','bride','gripe','tripe',
  'flame','frame','blame','brake','brave','grave','grace','trace','place','plane',
  'plant','bland','bland','brand','grant','front','frost','cross','gloss','gross',
  'close','clone','crone','prone','prune','brune','flute','fluke','flume','plume',
  'plunk','plumb','clump','stump','slump','slunk','skunk','spunk','chunk','churn',
  'stern','stone','stove','strove','grove','groan','grown','crown','frown','brown',
  'drown','drawn','draws','claws','clays','plays','plaza','blaze','glaze','graze',
  'grace','brace','trace','space','spare','share','snare','stare','flare','glare',
];

function getTodayWord(guildId: string): string {
  const day = Math.floor(Date.now() / 86400000);
  const idx = (parseInt(guildId.slice(-6), 16) + day) % WORD_LIST.length;
  return WORD_LIST[idx];
}

function renderGuesses(guesses: string[], target: string): string {
  if (guesses.length === 0) return '*No guesses yet*';
  return guesses.map(g => {
    const row: string[] = [];
    for (let i = 0; i < 5; i++) {
      if (g[i] === target[i]) row.push('🟩');
      else if (target.includes(g[i])) row.push('🟨');
      else row.push('⬛');
    }
    return row.join('') + `  \`${g.toUpperCase()}\``;
  }).join('\n');
}

export default {
  data: new SlashCommandBuilder()
    .setName('wordle')
    .setDescription('Daily Wordle — guess the 5-letter word'),

  async execute(ix: ChatInputCommandInteraction) {
    const guildId = ix.guildId!;
    const userId = ix.user.id;
    const today = Math.floor(Date.now() / 86400000);
    const target = getTodayWord(guildId);

    // Init table
    db.exec(`CREATE TABLE IF NOT EXISTS wordle_sessions (
      guild_id TEXT NOT NULL, user_id TEXT NOT NULL, day INTEGER NOT NULL,
      guesses TEXT DEFAULT '[]', won INTEGER DEFAULT 0,
      PRIMARY KEY (guild_id, user_id, day)
    )`);

    let session = db.prepare('SELECT * FROM wordle_sessions WHERE guild_id=? AND user_id=? AND day=?')
      .get(guildId, userId, today) as any;
    if (!session) {
      db.prepare('INSERT INTO wordle_sessions (guild_id,user_id,day) VALUES (?,?,?)').run(guildId, userId, today);
      session = db.prepare('SELECT * FROM wordle_sessions WHERE guild_id=? AND user_id=? AND day=?').get(guildId, userId, today) as any;
    }

    const guesses: string[] = JSON.parse(session.guesses);
    const won = session.won === 1;
    const lost = guesses.length >= 6 && !won;

    const buildEmbed = (g: string[], w: boolean, l: boolean) => new EmbedBuilder()
      .setTitle('🟩 Daily Wordle')
      .setColor(w ? '#57f287' : l ? '#ed4245' : '#5865f2')
      .setDescription(renderGuesses(g, target) || '*No guesses yet*')
      .addFields({ name: 'Attempts', value: `${g.length}/6`, inline: true })
      .setFooter({ text: w ? `✅ Solved in ${g.length} tries!` : l ? `❌ Word was: ${target.toUpperCase()}` : 'Guess a 5-letter word' });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId('wordle_guess').setLabel('Guess').setStyle(ButtonStyle.Primary).setDisabled(won || lost),
      new ButtonBuilder().setCustomId('wordle_rules').setLabel('Rules').setStyle(ButtonStyle.Secondary),
    );

    const msg = await ix.reply({ embeds: [buildEmbed(guesses, won, lost)], components: [row], fetchReply: true });

    const col = msg.createMessageComponentCollector({ time: 300_000 });
    col.on('collect', async (btn: ButtonInteraction) => {
      if (btn.user.id !== userId) return btn.reply({ content: 'Not your game!', ephemeral: true });

      if (btn.customId === 'wordle_rules') {
        return btn.reply({ content: '🟩 Correct letter + position\n🟨 Letter in word, wrong position\n⬛ Letter not in word\n\nNew word every day!', ephemeral: true });
      }

      // Guess modal
      const modal = new ModalBuilder().setCustomId('wordle_modal').setTitle('Enter your guess');
      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId('guess').setLabel('5-letter word').setStyle(TextInputStyle.Short)
          .setMinLength(5).setMaxLength(5).setRequired(true),
      ));
      await btn.showModal(modal);

      const modalSub = await btn.awaitModalSubmit({ time: 60_000 }).catch(() => null);
      if (!modalSub) return;

      const guess = modalSub.fields.getTextInputValue('guess').toLowerCase().trim();
      if (!/^[a-z]{5}$/.test(guess)) return modalSub.reply({ content: '❌ 5 English letters only.', ephemeral: true });

      const cur = db.prepare('SELECT * FROM wordle_sessions WHERE guild_id=? AND user_id=? AND day=?').get(guildId, userId, today) as any;
      const curGuesses: string[] = JSON.parse(cur.guesses);
      curGuesses.push(guess);
      const isWon = guess === target;
      db.prepare('UPDATE wordle_sessions SET guesses=?, won=? WHERE guild_id=? AND user_id=? AND day=?')
        .run(JSON.stringify(curGuesses), isWon ? 1 : 0, guildId, userId, today);

      const isLost = curGuesses.length >= 6 && !isWon;
      const newRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('wordle_guess').setLabel('Guess').setStyle(ButtonStyle.Primary).setDisabled(isWon || isLost),
        new ButtonBuilder().setCustomId('wordle_rules').setLabel('Rules').setStyle(ButtonStyle.Secondary),
      );

      await modalSub.update({ embeds: [buildEmbed(curGuesses, isWon, isLost)], components: [newRow] });
    });
  },
};
