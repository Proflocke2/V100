import { sendChallenge } from '../../utils/pvpChallenge';
import { getLocalized, Language } from '../../utils/localization';
import { getGuild } from '../../database/db';
/**
 * /ghostsagainst — Cards Against Humanity style, 3-8 players
 * Judge picks best answer, points system, custom cards supported
 */
import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ButtonBuilder, ButtonStyle,
  ComponentType, ButtonInteraction, User, MessageFlags,
} from 'discord.js';

const BLACK_CARDS = [
  "My therapist says that my obsession with _____ is unhealthy.",
  "What's that smell? Oh, it's _____.",
  "I got 99 problems but _____ ain't one.",
  "Scientists have discovered that _____ causes cancer.",
  "In a pinch, _____ can be used as a contraceptive.",
  "Step 1: _____. Step 2: _____. Step 3: Profit.",
  "What do old people smell like? _____.",
  "The new iPhone comes with _____.",
  "Why am I sticky? _____.",
  "During sex, I like to think about _____.",
  "What's always a good idea? _____.",
  "What's that sound? It's the sound of _____.",
  "How did I lose the debate? _____.",
  "What ended my last relationship? _____.",
  "My superpower is _____.",
  "What's in my secret drawer? _____.",
  "I asked my AI assistant for help with _____. It called the police.",
  "What's my Roman Empire? _____.",
  "Therapists hate this one weird trick: _____.",
  "Breaking News: Local man arrested for _____.",
];

const WHITE_CARDS = [
  "A participation trophy",
  "Forgetting someone's name mid-conversation",
  "The audacity",
  "Accidentally liking a 3-year-old photo",
  "A very aggressive pigeon",
  "Reading the terms and conditions",
  "Emotional damage",
  "Sending 'k' as a response",
  "The sound dial-up internet made",
  "Blaming the dog",
  "Unsubscribing then re-subscribing",
  "Eating cereal without milk",
  "The LinkedIn grind",
  "A USB that never goes in right the first time",
  "The void",
  "Telling someone it'll be fine",
  "Selective hearing",
  "A sneeze during a handshake",
  "The wrong password",
  "Accidentally replying all",
  "A gamer chair",
  "Rock bottom",
  "The terms and conditions",
  "Daddy issues",
  "A feral raccoon in a suit",
  "Weaponized incompetence",
  "My villain origin story",
  "Gaslight, gatekeep, girlboss",
  "The entire Discord server",
  "Crying in the bathroom",
  "A vibe check",
  "Eating someone else's lunch",
  "The gym selfie",
  "An unsolicited opinion",
  "Therapy",
  "Getting ratio'd",
  "The algorithm",
  "A very confident idiot",
  "Lying on my resume",
  "Room temperature soup",
];

function shuffle<T>(a: T[]): T[] { const b=[...a]; for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]];} return b; }
function pickBlack(): string { return BLACK_CARDS[Math.floor(Math.random()*BLACK_CARDS.length)]; }

interface GADGame {
  players: string[]; judgeIdx: number; round: number; maxRounds: number;
  scores: Map<string,number>; deck: string[]; hands: Map<string,string[]>;
  blackCard: string; submissions: Map<string,string>; phase: 'play'|'judge'|'done';
  createdAt: number;
}

const sessions = new Map<string, GADGame>();
setInterval(()=>{const now=Date.now();sessions.forEach((v,k)=>{if(now-v.createdAt>90*60_000)sessions.delete(k);});},20*60_000);

function dealHand(deck: string[], n=7): string[] {
  return deck.splice(0, Math.min(n, deck.length));
}

function refillHand(g: GADGame, pid: string): void {
  const hand = g.hands.get(pid)!;
  while(hand.length < 7 && g.deck.length > 0) hand.push(g.deck.shift()!);
}

export default {
  data: new SlashCommandBuilder()
    .setName('ghostsagainst')
    .setDescription('Ghosts Against Discord — Cards Against Humanity style! 🃏 (3-8 players)')
    .setDMPermission(false)
    .addUserOption(o=>o.setName('player2').setDescription('Player 2').setRequired(true))
    .addUserOption(o=>o.setName('player3').setDescription('Player 3').setRequired(true))
    .addUserOption(o=>o.setName('player4').setDescription('Player 4'))
    .addUserOption(o=>o.setName('player5').setDescription('Player 5'))
    .addUserOption(o=>o.setName('player6').setDescription('Player 6'))
    .addUserOption(o=>o.setName('player7').setDescription('Player 7'))
    .addUserOption(o=>o.setName('player8').setDescription('Player 8'))
    .addIntegerOption(o=>o.setName('rounds').setDescription('Rounds (default 5)').setMinValue(2).setMaxValue(15)),

  async execute(ix: ChatInputCommandInteraction) {
    const players = [ix.user.id];
    for(const opt of ['player2','player3','player4','player5','player6','player7','player8']) {
      const u = ix.options.getUser(opt);
      if(u && !u.bot && !players.includes(u.id)) players.push(u.id);
    }
    if(players.length < 3) return ix.reply({embeds:[new EmbedBuilder().setColor('#ed4245').setDescription('❌ Need at least 3 players!')],flags:MessageFlags.Ephemeral});

    const maxRounds = ix.options.getInteger('rounds') ?? 5;
    const deck = shuffle([...WHITE_CARDS]);
    const hands = new Map<string,string[]>();
    players.forEach(p => hands.set(p, dealHand(deck)));

    const gid = `gad_${ix.user.id}_${Date.now()}`;
    const g: GADGame = {
      players, judgeIdx: 0, round: 1, maxRounds,
      scores: new Map(players.map(p=>[p,0])),
      deck, hands, blackCard: pickBlack(),
      submissions: new Map(), phase: 'play', createdAt: Date.now(),
    };
    sessions.set(gid, g);

    const roundEmbed = () => new EmbedBuilder()
      .setTitle(`🃏 Ghosts Against Discord — Round ${g.round}/${g.maxRounds}`)
      .setColor('#1a1a2e')
      .setDescription(
        `**Black Card:**\n> ${g.blackCard}\n\n`+
        `**Card Czar (Judge):** <@${g.players[g.judgeIdx]}>\n\n`+
        `**Players:** ${g.players.filter(p=>p!==g.players[g.judgeIdx]).map(p=>`<@${p}> ${g.submissions.has(p)?'✅':'⏳'}`).join(' ')}\n\n`+
        (g.phase==='play'?'*All non-judge players: click the button to play a card privately.*':
          `**Submissions (judge picks the best):**\n${[...g.submissions.entries()].map(([,c],i)=>`${i+1}. ${c}`).join('\n')}`)+
        `\n\n**Scores:** ${[...g.scores.entries()].map(([p,s])=>`<@${p}>: ${s}pt`).join(' | ')}`,
      )
      .setFooter({text:g.phase==='play'?'Submit your card via the button below':'Judge: pick the winning card!'});

    const playBtn = () => new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`gad_play_${gid}`).setLabel('🃏 Play a Card').setStyle(ButtonStyle.Primary),
    );

    const msg = await ix.reply({embeds:[roundEmbed()], components:[playBtn()], fetchReply:true});

    const col = msg.createMessageComponentCollector({
      filter: b=>b.customId.includes(gid) && g.players.includes(b.user.id),
      time: 90*60_000,
    });

    col.on('collect', async(btn: ButtonInteraction) => {
      const id = btn.customId;

      // Play card button
      if(id === `gad_play_${gid}`) {
        if(btn.user.id === g.players[g.judgeIdx]) return btn.reply({content:"You're the judge this round! Wait for others.",flags:MessageFlags.Ephemeral});
        if(g.phase !== 'play') return btn.reply({content:'Judging phase — wait for the next round.',flags:MessageFlags.Ephemeral});
        if(g.submissions.has(btn.user.id)) return btn.reply({content:'You already played a card this round!',flags:MessageFlags.Ephemeral});

        const hand = g.hands.get(btn.user.id)!;
        if(!hand.length) return btn.reply({content:'No cards in hand!',flags:MessageFlags.Ephemeral});

        const menu = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder().setCustomId(`gad_card_${gid}`).setPlaceholder('Choose your card')
            .addOptions(hand.map((c,i)=>new StringSelectMenuOptionBuilder().setLabel(c.slice(0,100)).setValue(String(i))))
        );
        await btn.reply({embeds:[new EmbedBuilder().setColor('#9b59b6').setDescription(`**Black Card:** ${g.blackCard}\n\n**Your hand:**`)],components:[menu],flags:MessageFlags.Ephemeral});

        const sel = await btn.channel!.createMessageComponentCollector({
          componentType: ComponentType.StringSelect,
          filter: s=>s.user.id===btn.user.id && s.customId===`gad_card_${gid}`,
          time: 60_000, max: 1,
        });

        sel.on('collect', async(s:any)=>{
          const idx = +s.values[0];
          const card = hand.splice(idx, 1)[0];
          g.submissions.set(btn.user.id, card);
          refillHand(g, btn.user.id);
          await s.update({embeds:[new EmbedBuilder().setColor('#57f287').setDescription(`✅ You played: **${card}**`)],components:[]});

          // Check if all non-judges submitted
          const nonJudges = g.players.filter(p=>p!==g.players[g.judgeIdx]);
          if(nonJudges.every(p=>g.submissions.has(p))) {
            g.phase = 'judge';
            // Build judge menu
            const shuffledSubs = shuffle([...g.submissions.entries()]);
            const judgeMenu = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
              new StringSelectMenuBuilder().setCustomId(`gad_judge_${gid}`).setPlaceholder('Pick the funniest card')
                .addOptions(shuffledSubs.map(([,c],i)=>new StringSelectMenuOptionBuilder().setLabel(c.slice(0,100)).setValue(String(i))))
            );
            await ix.editReply({embeds:[roundEmbed()],components:[judgeMenu]});
          } else {
            await ix.editReply({embeds:[roundEmbed()],components:[playBtn()]});
          }
        });
        return;
      }

      // Judge picks
      if(id === `gad_judge_${gid}`) {
        if(btn.user.id !== g.players[g.judgeIdx]) return btn.reply({content:"You're not the judge!",flags:MessageFlags.Ephemeral});
        const shuffledSubs = shuffle([...g.submissions.entries()]);
        const winnerEntry = shuffledSubs[+((btn as any).values?.[0] ?? 0)];
        return; // handled by select collector below
      }
    });

    // Judge select
    const judgeCol = msg.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      filter: s=>s.customId===`gad_judge_${gid}` && s.user.id===g.players[g.judgeIdx],
      time: 90*60_000,
    });

    judgeCol.on('collect', async(sel:any)=>{
      const shuffledSubs = shuffle([...g.submissions.entries()]);
      const idx = +sel.values[0];
      const [winnerId, winCard] = shuffledSubs[idx];
      g.scores.set(winnerId, (g.scores.get(winnerId)??0)+1);

      await sel.update({embeds:[new EmbedBuilder()
        .setTitle(`🎉 Round ${g.round} Winner!`)
        .setColor('#f1c40f')
        .setDescription(`**Black Card:**\n> ${g.blackCard}\n\n**Winning answer:**\n> ${winCard}\n\n🏆 <@${winnerId}> gets a point!\n\n**Scores:** ${[...g.scores.entries()].map(([p,s])=>`<@${p}>: **${s}pt**`).join(' | ')}`)
        .setFooter({text:'Next round starting...'})],
        components:[]});

      // Next round
      g.round++; g.submissions.clear();
      if(g.round > g.maxRounds) {
        col.stop(); judgeCol.stop();
        const sorted = [...g.scores.entries()].sort((a,b)=>b[1]-a[1]);
        const winner = sorted[0];
        return setTimeout(()=>ix.editReply({embeds:[new EmbedBuilder()
          .setTitle('🃏 Ghosts Against Discord — Game Over!')
          .setColor('#57f287')
          .setDescription(`🏆 **Winner: <@${winner[0]}> with ${winner[1]} points!**\n\n**Final Scores:**\n${sorted.map(([p,s],i)=>`${i===0?'🥇':i===1?'🥈':'🥉'} <@${p}>: **${s}pts**`).join('\n')}`)
          .setTimestamp()],components:[]}),3000);
      }

      g.judgeIdx = (g.judgeIdx+1) % g.players.length;
      g.blackCard = pickBlack(); g.phase = 'play';
      setTimeout(()=>ix.editReply({embeds:[roundEmbed()],components:[playBtn()]}),3000);
    });
  },
};
