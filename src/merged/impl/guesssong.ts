/**
 * /guesssong — Guess the song from emoji/lyric clues
 * Multiple categories, difficulty levels, solo + multiplayer race
 */
import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle,
  ComponentType, ButtonInteraction, User, MessageFlags,
} from 'discord.js';
import { reservePoints, addPoints, recordLoss } from '../../economy/db/EconomyDB';
import { sendChallenge } from '../../utils/pvpChallenge';
import { validateBet } from '../../utils/betHelper';
import { getGuild } from '../../database/db';
import { getLocalized, Language } from '../../utils/localization';

interface SongClue {
  title: string; artist: string;
  emoji: string;         // emoji hint
  lyric: string;         // lyric snippet (not full lyric — safe to use)
  yearHint: string;      // decade hint
  genre: string;
}

const SONGS: SongClue[] = [
  {title:'Shape of You',      artist:'Ed Sheeran',        emoji:'🎵👤💕',lyric:'"I\'m in love with your body..."',yearHint:'2010s',genre:'Pop'},
  {title:'Blinding Lights',   artist:'The Weeknd',        emoji:'🌃💡🕶️',lyric:'"I been running through the night..."',yearHint:'2020s',genre:'Synth-pop'},
  {title:'Bohemian Rhapsody', artist:'Queen',              emoji:'👑🎸🎭',lyric:'"Is this the real life? Is this just fantasy?"',yearHint:'1970s',genre:'Rock'},
  {title:'Bad Guy',           artist:'Billie Eilish',     emoji:'😈👑💚',lyric:'"I\'m the bad guy... duh"',yearHint:'2010s',genre:'Pop'},
  {title:'Uptown Funk',       artist:'Mark Ronson ft Bruno Mars',emoji:'🕺🎶🔥',lyric:'"Don\'t believe me just watch"',yearHint:'2010s',genre:'Funk'},
  {title:'Despacito',         artist:'Luis Fonsi ft Daddy Yankee',emoji:'🌴💃🎸',lyric:'"Despacito, quiero respirar tu cuello despacio..."',yearHint:'2010s',genre:'Reggaeton'},
  {title:'Rolling in the Deep',artist:'Adele',            emoji:'💔🎤🌊',lyric:'"We could have had it all..."',yearHint:'2010s',genre:'Pop/Soul'},
  {title:'Thriller',          artist:'Michael Jackson',   emoji:'🧟🌙💀',lyric:'"Cause this is thriller, thriller night..."',yearHint:'1980s',genre:'Pop'},
  {title:'Hotel California',  artist:'Eagles',            emoji:'🏨🌴🎸',lyric:'"You can check out any time you like..."',yearHint:'1970s',genre:'Rock'},
  {title:'Smells Like Teen Spirit',artist:'Nirvana',      emoji:'👃🧪🎸',lyric:'"Here we are now, entertain us..."',yearHint:'1990s',genre:'Grunge'},
  {title:'Happy',             artist:'Pharrell Williams', emoji:'😊☀️🎵',lyric:'"Because I\'m happy, clap along if you feel..."',yearHint:'2010s',genre:'Pop'},
  {title:'Old Town Road',     artist:'Lil Nas X',         emoji:'🤠🏇🎸',lyric:'"I\'m gonna take my horse to the old town road..."',yearHint:'2010s',genre:'Country-rap'},
  {title:'Lose Yourself',     artist:'Eminem',            emoji:'🎤💊🎭',lyric:'"His palms are sweaty, knees weak, arms are heavy..."',yearHint:'2000s',genre:'Hip-hop'},
  {title:'someone like you',  artist:'Adele',             emoji:'💔🪟🕰️',lyric:'"Never mind, I\'ll find someone like you..."',yearHint:'2010s',genre:'Pop/Soul'},
  {title:'Watermelon Sugar',  artist:'Harry Styles',      emoji:'🍉🍬☀️',lyric:'"Tastes like strawberries on a summer evening..."',yearHint:'2020s',genre:'Pop'},
  {title:'Mr. Brightside',    artist:'The Killers',       emoji:'🌅😰💔',lyric:'"Coming out of my cage and I\'ve been doing just fine..."',yearHint:'2000s',genre:'Indie Rock'},
  {title:'Levitating',        artist:'Dua Lipa',          emoji:'🚀✨🪐',lyric:'"I got you, moonlight, you\'re my starlight..."',yearHint:'2020s',genre:'Pop'},
  {title:'Dynamite',          artist:'BTS',               emoji:'💥✨🕺',lyric:'"Cause I, I, I\'m in the stars tonight..."',yearHint:'2020s',genre:'K-pop'},
  {title:'Africa',            artist:'Toto',              emoji:'🌍🌧️🌙',lyric:'"I hear the drums echoing tonight..."',yearHint:'1980s',genre:'Rock'},
  {title:'Shallow',           artist:'Lady Gaga & Bradley Cooper',emoji:'🌊🎭💕',lyric:'"Tell me something boy, aren\'t you tired..."',yearHint:'2010s',genre:'Pop'},
];

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g,'').replace(/\s+/g,' ').trim();
}

function checkAnswer(guess: string, title: string, artist: string): boolean {
  const g = normalize(guess);
  const t = normalize(title);
  const a = normalize(artist).split(' ')[0]; // first word of artist name
  return g.includes(t) || t.includes(g) || (g.length>3 && g.includes(a));
}

interface GSGame {
  songs: SongClue[]; current: number; scores: Map<string,number>;
  players: string[]; guessed: Set<string>; round: number;
  done: boolean; bet: number; guildId: string; createdAt: number;
}
const sessions = new Map<string,GSGame>();
setInterval(()=>{const now=Date.now();sessions.forEach((v,k)=>{if(now-v.createdAt>30*60_000)sessions.delete(k);});},10*60_000);

export default {
  data: new SlashCommandBuilder()
    .setName('guesssong')
    .setDescription('Guess the Song from emoji & lyric clues! 🎵')
    .setDMPermission(false)
    .addIntegerOption(o=>o.setName('rounds').setDescription('Songs to guess (default 5)').setMinValue(1).setMaxValue(10))
    .addUserOption(o=>o.setName('player2').setDescription('Multiplayer: Player 2'))
    .addUserOption(o=>o.setName('player3').setDescription('Player 3'))
    .addIntegerOption(o=>o.setName('bet').setDescription('Bet coins (solo) / each (multi)').setMinValue(1)),

  async execute(ix: ChatInputCommandInteraction) {
    const lang = (getGuild(ix.guildId!)?.language || 'en') as Language;
    const t = (k:string,v?:Record<string,string>) => getLocalized(k,lang,v);
    const rounds = ix.options.getInteger('rounds') ?? 5;
    const rawBet = ix.options.getInteger('bet') ?? 0;
    const { bet, warning: betWarning, clamped: betClamped } = validateBet(rawBet, ix.guildId!);
    const players = [ix.user.id];
    for(const opt of ['player2','player3']){const u=ix.options.getUser(opt);if(u&&!u.bot&&!players.includes(u.id))players.push(u.id);}

    if(bet>0){
      for(const p of players){
        if(!reservePoints(p,ix.guildId!,bet)){
          players.forEach(pp=>addPoints(pp,ix.guildId!,bet));
          return ix.reply({embeds:[new EmbedBuilder().setColor('#ed4245').setDescription('❌ Insufficient coins.')],flags:MessageFlags.Ephemeral});
        }
      }
    }
    if (betWarning) { await ix.followUp({ content: betWarning, ephemeral: true }).catch(() => {}); }

    const songPool = [...SONGS].sort(()=>Math.random()-.5).slice(0,rounds);
    const gid = `gs_${ix.user.id}_${Date.now()}`;
    const g: GSGame = {
      songs: songPool, current:0, scores:new Map(players.map(p=>[p,0])),
      players, guessed:new Set(), round:1, done:false, bet, guildId:ix.guildId!, createdAt:Date.now(),
    };
    sessions.set(gid, g);

    const clueEmbed = (song: SongClue, revealed=false) => new EmbedBuilder()
      .setTitle(`🎵 Guess the Song — Round ${g.round}/${rounds}`)
      .setColor('#1db954')
      .setDescription(
        `**Emoji clue:** ${song.emoji}\n\n`+
        `**Lyric snippet:**\n> ${song.lyric}\n\n`+
        `**Decade:** ${song.yearHint}\n`+
        `**Genre:** ${song.genre}\n\n`+
        (revealed ? `✅ **Answer: "${song.title}" by ${song.artist}**` : '')+
        (g.players.length>1?`\n**Scores:** ${[...g.scores.entries()].map(([p,s])=>`<@${p}>: ${s}pts`).join(' | ')}`:''),
      )
      .setFooter({text:revealed?'Next round starting...':'Click "Guess" to answer! Fastest finger wins.'});

    const guessBtn = () => new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`gs_guess_${gid}`).setLabel('🎵 Guess!').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`gs_hint_${gid}`).setLabel('💡 Artist hint').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`gs_skip_${gid}`).setLabel('⏭️ Skip').setStyle(ButtonStyle.Danger),
    );

    const msg = await ix.reply({embeds:[clueEmbed(songPool[0])],components:[guessBtn()],fetchReply:true});
    const col = msg.createMessageComponentCollector({componentType:ComponentType.Button,filter:b=>b.customId.includes(gid)&&g.players.includes(b.user.id),time:20*60_000});

    col.on('collect', async(btn: ButtonInteraction)=>{
      const song = g.songs[g.current];
      if(btn.customId===`gs_hint_${gid}`){
        return btn.reply({content:`💡 Artist: **${song.artist.split(' ')[0]}...**`,flags:MessageFlags.Ephemeral});
      }
      if(btn.customId===`gs_skip_${gid}`){
        g.current++; g.round++; g.guessed.clear();
        if(g.current>=g.songs.length){
          finalize(g,ix,bet,col); return btn.update({embeds:[clueEmbed(song,true)],components:[]});
        }
        await btn.update({embeds:[clueEmbed(song,true)],components:[]});
        setTimeout(()=>ix.editReply({embeds:[clueEmbed(g.songs[g.current])],components:[guessBtn()]}),2500);
        return;
      }
      if(btn.customId===`gs_guess_${gid}`){
        const modal = new ModalBuilder().setCustomId(`gs_modal_${gid}_${btn.user.id}`).setTitle('Guess the Song')
          .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('guess').setLabel('Song title (or artist)').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(2).setMaxLength(100)
          ));
        await btn.showModal(modal);
        const sub = await btn.awaitModalSubmit({filter:m=>m.user.id===btn.user.id&&m.customId===`gs_modal_${gid}_${btn.user.id}`,time:30_000}).catch(()=>null);
        if(!sub) return;
        const guess = sub.fields.getTextInputValue('guess');
        if(checkAnswer(guess, song.title, song.artist)){
          g.scores.set(btn.user.id,(g.scores.get(btn.user.id)??0)+1);
          g.current++; g.round++; g.guessed.clear();
          await sub.reply({content:`🎉 Correct! **"${song.title}" by ${song.artist}**`,flags:MessageFlags.Ephemeral});
          if(g.current>=g.songs.length){
            finalize(g,ix,bet,col);
            return ix.editReply({embeds:[clueEmbed(song,true)],components:[]});
          }
          await ix.editReply({embeds:[clueEmbed(song,true).setTitle('✅ Correct!')],components:[]});
          setTimeout(()=>ix.editReply({embeds:[clueEmbed(g.songs[g.current])],components:[guessBtn()]}),2500);
        } else {
          await sub.reply({content:`❌ Not quite! Keep trying or skip.`,flags:MessageFlags.Ephemeral});
        }
      }
    });
  },
};

function finalize(g:GSGame,ix:ChatInputCommandInteraction,bet:number,col:any){
  col.stop();
  const sorted=[...g.scores.entries()].sort((a,b)=>b[1]-a[1]);
  const winner=sorted[0];
  if(bet>0){
    addPoints(winner[0],g.guildId,bet*g.players.length);
    g.players.filter(p=>p!==winner[0]).forEach(p=>recordLoss(p,g.guildId,bet));
  }
  setTimeout(()=>ix.editReply({embeds:[new EmbedBuilder().setTitle('🎵 Game Over!').setColor('#1db954')
    .setDescription(`🏆 **Winner: <@${winner[0]}> with ${winner[1]} correct!**\n\n${sorted.map(([p,s],i)=>`${i===0?'🥇':i===1?'🥈':'🥉'} <@${p}>: ${s}/${g.songs.length}`).join('\n')}${bet>0?`\n\n🪙 Winner gets **${bet*g.players.length}** coins!`:''}`)
    .setTimestamp()],components:[]}),2500);
  g.players.forEach(p=>sessions.delete(p));
}
