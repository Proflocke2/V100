import { sendChallenge } from '../../utils/pvpChallenge';
/**
 * /truthordare — Truth or Dare with rotating players, 3 difficulty levels
 */
import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, ComponentType, ButtonInteraction, MessageFlags,
} from 'discord.js';
import { getGuild } from '../../database/db';

const TRUTHS: Record<string, string[]> = {
  easy: [
    "What's the most embarrassing thing you've ever done?",
    "What's your biggest fear?",
    "Have you ever lied to get out of trouble? What was it?",
    "What's the weirdest dream you've ever had?",
    "What's a secret talent you have?",
    "Have you ever blamed someone else for something you did?",
    "What's the most childish thing you still do?",
    "Who was your first crush?",
    "What's the grossest thing you've ever eaten?",
    "Have you ever cheated on a test?",
  ],
  medium: [
    "What's something you've never told your parents?",
    "What's the biggest lie you've ever told?",
    "Have you ever stood someone up?",
    "What's the most embarrassing thing in your search history?",
    "What's a bad habit you're ashamed of?",
    "Have you ever ghosted someone?",
    "What's something you pretend to like but actually hate?",
    "Have you ever talked behind a friend's back?",
    "What's the worst date you've ever been on?",
    "Have you ever stolen something?",
  ],
  hard: [
    "What's the most illegal thing you've ever done?",
    "Have you ever had feelings for someone in this group?",
    "What's something you'd never want your family to find out?",
    "What's your most controversial opinion?",
    "Have you ever faked being sick to avoid someone?",
    "What's your biggest regret?",
    "Have you ever read someone's private messages without permission?",
    "What's something you've done that you're genuinely ashamed of?",
    "What would you do with $1M that you'd never admit publicly?",
    "Have you ever pretended to be someone else online?",
  ],
};

const DARES: Record<string, string[]> = {
  easy: [
    "Do your best impression of another player for 30 seconds.",
    "Sing the chorus of your favorite song.",
    "Tell a joke — if no one laughs, do it again.",
    "Do 10 jumping jacks.",
    "Speak in an accent for the next 2 rounds.",
    "Say something nice about every person in this chat.",
    "Send a selfie to the group chat.",
    "Change your nickname to something embarrassing for 5 min.",
    "Describe yourself using only food.",
    "Do your best robot dance (describe it in text).",
  ],
  medium: [
    "Send a voice message saying 'I love pickles' in the weirdest voice you can.",
    "Let the group choose your profile picture for 10 minutes.",
    "Write a haiku about the last person who messaged you.",
    "Post a status that says 'I eat socks for breakfast'.",
    "Compliment everyone in the server by name.",
    "Speak only in questions for the next 3 rounds.",
    "Change your Discord status to something embarrassing for 15 min.",
    "Do a 30-second stand-up comedy routine.",
    "Call someone in your phone and sing happy birthday.",
    "Let the group DM someone on your behalf (nothing mean).",
  ],
  hard: [
    "Post this message in 3 different servers: 'I believe in aliens 👽'.",
    "DM your most recent contact 'I miss you 💕' (no context).",
    "Change your profile picture to a potato for 30 minutes.",
    "Let the group write your next Discord status.",
    "Rate everyone in the game 1-10 and explain why.",
    "Post your most recent camera roll photo.",
    "Call the 3rd contact in your phone and say nothing for 10 seconds.",
    "Let someone look through your Spotify listening history.",
    "Post a vague but dramatic status for 1 hour.",
    "Describe your current situation without using the letter 'e'.",
  ],
};

interface TDGame {
  players: string[]; idx: number; round: number;
  maxRounds: number; done: boolean; createdAt: number;
}
const sessions = new Map<string, TDGame>();
setInterval(() => { const now=Date.now(); sessions.forEach((v,k)=>{ if(now-v.createdAt>60*60_000) sessions.delete(k); }); }, 15*60_000);

function pick(arr: string[]): string { return arr[Math.floor(Math.random()*arr.length)]; }

export default {
  data: new SlashCommandBuilder()
    .setName('truthordare')
    .setDescription('Truth or Dare 🎯')
    .setDMPermission(false)
    .addUserOption(o=>o.setName('player2').setDescription('Player 2').setRequired(true))
    .addUserOption(o=>o.setName('player3').setDescription('Player 3'))
    .addUserOption(o=>o.setName('player4').setDescription('Player 4'))
    .addUserOption(o=>o.setName('player5').setDescription('Player 5'))
    .addStringOption(o=>o.setName('difficulty').setDescription('Difficulty').addChoices({name:'Easy',value:'easy'},{name:'Medium',value:'medium'},{name:'Hard',value:'hard'}))
    .addIntegerOption(o=>o.setName('rounds').setDescription('Rounds per player (default 3)').setMinValue(1).setMaxValue(10)),

  async execute(ix: ChatInputCommandInteraction) {
    const diff = (ix.options.getString('difficulty') || 'medium');
    const maxRounds = ix.options.getInteger('rounds') ?? 3;
    const players = [ix.user.id];
    for (const opt of ['player2','player3','player4','player5']) {
      const u = ix.options.getUser(opt);
      if (u && !u.bot && !players.includes(u.id)) players.push(u.id);
    }

    const gid = `tod_${ix.user.id}_${Date.now()}`;
    const game: TDGame = { players, idx: 0, round: 1, maxRounds, done: false, createdAt: Date.now() };
    sessions.set(gid, game);

    const currentEmbed = (g: TDGame) => new EmbedBuilder()
      .setTitle('🎯 Truth or Dare')
      .setColor('#e74c3c')
      .setDescription(`**Round ${g.round}/${g.maxRounds} — <@${g.players[g.idx]}>'s turn!**\n\nChoose your fate:`)
      .addFields({name:'Difficulty',value:diff,inline:true},{name:'Players',value:players.map(p=>`<@${p}>`).join(', '),inline:true})
      .setFooter({text:'Click Truth or Dare!'});

    const buttons = () => new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`tod_truth_${gid}`).setLabel('🤔 Truth').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`tod_dare_${gid}`).setLabel('💪 Dare').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`tod_skip_${gid}`).setLabel('⏭️ Skip (no shame)').setStyle(ButtonStyle.Secondary),
    );

    const msg = await ix.reply({ embeds:[currentEmbed(game)], components:[buttons()], fetchReply:true });
    const col = msg.createMessageComponentCollector({ componentType:ComponentType.Button, filter:b=>b.customId.includes(gid), time:60*60_000 });

    col.on('collect', async(btn: ButtonInteraction) => {
      const g = sessions.get(gid); if(!g||g.done) return btn.deferUpdate();
      if (btn.user.id !== g.players[g.idx]) return btn.reply({ content:'Not your turn!', flags:MessageFlags.Ephemeral });

      let embed: EmbedBuilder;
      if (btn.customId === `tod_truth_${gid}`) {
        embed = new EmbedBuilder().setTitle('🤔 TRUTH').setColor('#3498db')
          .setDescription(`<@${g.players[g.idx]}>, answer honestly:\n\n**${pick(TRUTHS[diff])}**`)
          .setFooter({text:'Answer truthfully, then click Next when done.'});
      } else if (btn.customId === `tod_dare_${gid}`) {
        embed = new EmbedBuilder().setTitle('💪 DARE').setColor('#e74c3c')
          .setDescription(`<@${g.players[g.idx]}>, you must:\n\n**${pick(DARES[diff])}**`)
          .setFooter({text:'Complete the dare, then click Next when done.'});
      } else {
        embed = new EmbedBuilder().setTitle('⏭️ Skipped').setColor('#95a5a6')
          .setDescription(`<@${g.players[g.idx]}> skipped their turn.`);
      }

      const nextBtn = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`tod_next_${gid}`).setLabel('➡️ Next Turn').setStyle(ButtonStyle.Success),
      );

      await btn.update({ embeds:[embed], components:[nextBtn] });
    });

    col.on('collect', async(btn: ButtonInteraction) => {
      if (btn.customId !== `tod_next_${gid}`) return;
      const g = sessions.get(gid); if(!g||g.done) return btn.deferUpdate();

      g.idx = (g.idx+1) % g.players.length;
      if (g.idx === 0) g.round++;

      if (g.round > g.maxRounds) {
        g.done = true; sessions.delete(gid); col.stop();
        return btn.update({ embeds:[new EmbedBuilder().setTitle('🎯 Game Over!').setColor('#57f287').setDescription(`Thanks for playing Truth or Dare!\n\nPlayers: ${players.map(p=>`<@${p}>`).join(', ')}`)], components:[] });
      }

      await btn.update({ embeds:[currentEmbed(g)], components:[buttons()] });
    });
  },
};
