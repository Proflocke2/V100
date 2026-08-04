import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import db from '../../database/db';
import { getEconomyUser, addPoints } from '../../economy/db/EconomyDB';
import { success, error } from '../../utils/embeds';

const BASE = 200;
const MAX_STREAK_MULTIPLIER = 7; // cap at 7x

function initTables() {
  db.exec(`CREATE TABLE IF NOT EXISTS daily_streaks (
    user_id TEXT NOT NULL, guild_id TEXT NOT NULL,
    streak INTEGER DEFAULT 1, last_claim INTEGER DEFAULT 0,
    PRIMARY KEY (user_id, guild_id)
  )`);
}

export default {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim your daily coins — streak gives bonus!'),

  async execute(ix: ChatInputCommandInteraction) {
    initTables();
    const userId = ix.user.id;
    const guildId = ix.guildId!;
    const now = Math.floor(Date.now() / 1000);
    const todayStart = Math.floor(Date.now() / 86400000) * 86400;

    let row = db.prepare('SELECT * FROM daily_streaks WHERE user_id=? AND guild_id=?').get(userId, guildId) as any;

    let streak = 1;
    if (row) {
      const yesterday = todayStart - 86400;
      if (row.last_claim >= todayStart) {
        const nextClaim = todayStart + 86400;
        return ix.reply({
          embeds: [error('Already claimed', `Next daily: <t:${nextClaim}:R>`)],
          ephemeral: true,
        });
      }
      if (row.last_claim >= yesterday) {
        streak = Math.min(row.streak + 1, MAX_STREAK_MULTIPLIER * 10);
      } else {
        streak = 1; // reset streak if missed a day
      }
      db.prepare('UPDATE daily_streaks SET streak=?, last_claim=? WHERE user_id=? AND guild_id=?')
        .run(streak, now, userId, guildId);
    } else {
      db.prepare('INSERT INTO daily_streaks (user_id, guild_id, streak, last_claim) VALUES (?,?,?,?)').run(userId, guildId, 1, now);
    }

    const multiplier = Math.min(streak, MAX_STREAK_MULTIPLIER);
    const reward = BASE * multiplier;
    const streakBonus = reward - BASE;
    addPoints(userId, guildId, reward);
    const user = getEconomyUser(userId, guildId);

    const embed = new EmbedBuilder()
      .setTitle('📅 Daily Reward')
      .setColor('#faa61a')
      .setDescription(`You claimed your daily reward!`)
      .addFields(
        { name: '💰 Base', value: `${BASE} coins`, inline: true },
        { name: '🔥 Streak Bonus', value: `+${streakBonus} coins (×${multiplier})`, inline: true },
        { name: '✨ Total', value: `**${reward} coins**`, inline: true },
        { name: '🔥 Streak', value: `${streak} day${streak !== 1 ? 's' : ''}`, inline: true },
        { name: '💳 Balance', value: `${user.points.toLocaleString()} coins`, inline: true },
      )
      .setFooter({ text: streak >= 7 ? '🏆 Max streak multiplier reached!' : `Keep your streak for more bonus!` });

    await ix.reply({ embeds: [embed] });
  },
};
