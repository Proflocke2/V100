/**
 * /yahtzee — Solo or PvP (alternating turns), full rules, Economy bets
 */
import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder, ComponentType, ButtonInteraction, User, MessageFlags,
} from 'discord.js';
import { getGuild } from '../../database/db';
import { Language } from '../../utils/localization';
import { reservePoints, addPoints, recordLoss } from '../../economy/db/EconomyDB';
import { sendChallenge } from '../../utils/pvpChallenge';
import { validateBet } from '../../utils/betHelper';

type Cat='ones'|'twos'|'threes'|'fours'|'fives'|'sixes'|'threeKind'|'fourKind'|'fullHouse'|'smallStr'|'largeStr'|'yahtzee'|'chance';
const CATS:Cat[]=['ones','twos','threes','fours','fives','sixes','threeKind','fourKind','fullHouse','smallStr','largeStr','yahtzee','chance'];
const CAT_LABEL:Record<Cat,string>={ones:'Ones',twos:'Twos',threes:'Threes',fours:'Fours',fives:'Fives',sixes:'Sixes',threeKind:'3-of-a-Kind',fourKind:'4-of-a-Kind',fullHouse:'Full House',smallStr:'Sm. Straight',largeStr:'Lg. Straight',yahtzee:'YAHTZEE!',chance:'Chance'};
const DICE_EMOJI=['','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣'];

interface YPlayer { id:string; scores:Partial<Record<Cat,number>>; }
interface YGame { dice:number[]; held:boolean[]; rollsLeft:number; players:YPlayer[]; currentIdx:number; round:number; done:boolean; bet:number; guildId:string; createdAt:number; }

const sessions=new Map<string,YGame>();
setInterval(()=>{const now=Date.now();sessions.forEach((v,k)=>{if(now-v.createdAt>30*60_000)sessions.delete(k);});},10*60_000);

function roll5(){return Array.from({length:5},()=>Math.floor(Math.random()*6)+1);}
function rollKeep(d:number[],h:boolean[]){return d.map((v,i)=>h[i]?v:Math.floor(Math.random()*6)+1);}
function score(cat:Cat,dice:number[]):number{
  const cnt=Array(7).fill(0);dice.forEach(d=>cnt[d]++);const sum=dice.reduce((a,b)=>a+b,0);
  switch(cat){case'ones':return cnt[1];case'twos':return cnt[2]*2;case'threes':return cnt[3]*3;case'fours':return cnt[4]*4;case'fives':return cnt[5]*5;case'sixes':return cnt[6]*6;
    case'threeKind':return[1,2,3,4,5,6].some(v=>cnt[v]>=3)?sum:0;case'fourKind':return[1,2,3,4,5,6].some(v=>cnt[v]>=4)?sum:0;
    case'fullHouse':return[1,2,3,4,5,6].some(v=>cnt[v]===3)&&[1,2,3,4,5,6].some(v=>cnt[v]===2)?25:0;
    case'smallStr':{const u=new Set(dice);return[[1,2,3,4],[2,3,4,5],[3,4,5,6]].some(s=>s.every(n=>u.has(n)))?30:0;}
    case'largeStr':{const u=new Set(dice);return[[1,2,3,4,5],[2,3,4,5,6]].some(s=>s.every(n=>u.has(n)))?40:0;}
    case'yahtzee':return new Set(dice).size===1?50:0;case'chance':return sum;}
}
function total(s:Partial<Record<Cat,number>>):number{
  let t=Object.values(s).reduce((a,b)=>a+(b??0),0);
  const upper=(s.ones??0)+(s.twos??0)+(s.threes??0)+(s.fours??0)+(s.fives??0)+(s.sixes??0);
  if(upper>=63)t+=35;return t;
}
function scoreStr(s:Partial<Record<Cat,number>>,dice:number[]):string{
  const upper=CATS.slice(0,6).map(c=>s[c]!==undefined?`${CAT_LABEL[c]}: **${s[c]}**`:`${CAT_LABEL[c]}: *(${score(c,dice)})*`).join(' | ');
  const lower=CATS.slice(6).map(c=>s[c]!==undefined?`${CAT_LABEL[c]}: **${s[c]}**`:`${CAT_LABEL[c]}: *(${score(c,dice)})*`).join(' | ');
  const up=(s.ones??0)+(s.twos??0)+(s.threes??0)+(s.fours??0)+(s.fives??0)+(s.sixes??0);
  return `**Upper:** ${upper}\n**Lower:** ${lower}\n**Total:** ${total(s)}${up>=63?' ✅ +35 bonus!':up>0?` (${up}/63 for bonus)`:''}`;
}

function buildDiceButtons(gid:string,dice:number[],held:boolean[],rollsLeft:number):ActionRowBuilder<ButtonBuilder>[]{
  const row1=new ActionRowBuilder<ButtonBuilder>();
  dice.forEach((d,i)=>row1.addComponents(new ButtonBuilder().setCustomId(`yz_h_${gid}_${i}`).setLabel(`${held[i]?'🔒':'  '} ${DICE_EMOJI[d]}`).setStyle(held[i]?ButtonStyle.Success:ButtonStyle.Secondary)));
  const row2=new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`yz_roll_${gid}`).setLabel(`🎲 Roll (${rollsLeft} left)`).setStyle(ButtonStyle.Primary).setDisabled(rollsLeft===0),
    new ButtonBuilder().setCustomId(`yz_score_${gid}`).setLabel('📋 Score Category').setStyle(ButtonStyle.Danger),
  );
  return [row1,row2];
}

function buildCatMenu(gid:string,scores:Partial<Record<Cat,number>>,dice:number[]):ActionRowBuilder<StringSelectMenuBuilder>[]{
  const avail=CATS.filter(c=>scores[c]===undefined);
  const opts=avail.map(c=>new StringSelectMenuOptionBuilder().setLabel(`${CAT_LABEL[c]} → ${score(c,dice)} pts`).setValue(c));
  return [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId(`yz_cat_${gid}`).setPlaceholder('Choose scoring category').addOptions(opts))];
}

function gameEmbed(g:YGame,status=''):EmbedBuilder{
  const p=g.players[g.currentIdx];const diceStr=g.dice.map((d,i)=>`${g.held[i]?'🔒':''}${DICE_EMOJI[d]}`).join(' ');
  return new EmbedBuilder().setTitle('🎲 Yahtzee').setColor('#f0c040')
    .setDescription(`**Round ${g.round}/13 — ${g.players.length>1?`<@${p.id}>'s turn`:''} **\n\n${diceStr}\n\n${scoreStr(p.scores,g.dice)}`)
    .addFields(...(g.bet>0?[{name:'Bet',value:`🪙 ${g.bet}`,inline:true}]:[]))
    .setFooter({text:status||'Toggle dice to hold, then Roll or Score'});
}

async function runGame(ix:ChatInputCommandInteraction,players:User[],bet:number,lang:Language){
  const gid=`yz_${ix.user.id}_${Date.now()}`;
  const g:YGame={dice:roll5(),held:Array(5).fill(false),rollsLeft:2,players:players.map(p=>({id:p.id,scores:{}})),currentIdx:0,round:1,done:false,bet,guildId:ix.guildId!,createdAt:Date.now()};
  players.forEach(p=>sessions.set(p.id,g));
  const msg=await ix.editReply({embeds:[gameEmbed(g)],components:buildDiceButtons(gid,g.dice,g.held,g.rollsLeft) as any});
  const col=msg.createMessageComponentCollector({filter:b=>b.customId.includes(gid)&&players.map(p=>p.id).includes(b.user.id),time:25*60_000});
  col.on('collect',async(inter:any)=>{
    const gg=sessions.get(inter.user.id);if(!gg||gg.done)return inter.deferUpdate();
    const currentId=gg.players[gg.currentIdx].id;
    if(inter.user.id!==currentId&&inter.customId!==`yz_view_${gid}`)return inter.reply({content:'Not your turn!',flags:MessageFlags.Ephemeral});
    const id=inter.customId;
    if(id.startsWith('yz_h_')){const i=+id.split('_')[3];gg.held[i]=!gg.held[i];return inter.update({embeds:[gameEmbed(gg)],components:buildDiceButtons(gid,gg.dice,gg.held,gg.rollsLeft) as any});}
    if(id===`yz_roll_${gid}`){if(gg.rollsLeft===0)return inter.reply({content:'No rolls left!',flags:MessageFlags.Ephemeral});gg.dice=rollKeep(gg.dice,gg.held);gg.rollsLeft--;return inter.update({embeds:[gameEmbed(gg)],components:buildDiceButtons(gid,gg.dice,gg.held,gg.rollsLeft) as any});}
    if(id===`yz_score_${gid}`)return inter.update({embeds:[gameEmbed(gg,'Choose a category:')],components:buildCatMenu(gid,gg.players[gg.currentIdx].scores,gg.dice) as any});
    if(id===`yz_cat_${gid}`){
      const cat=inter.values[0] as Cat;gg.players[gg.currentIdx].scores[cat]=score(cat,gg.dice);
      // Next turn
      gg.currentIdx=(gg.currentIdx+1)%gg.players.length;
      if(gg.currentIdx===0)gg.round++;
      if(gg.round>13){
        gg.done=true;players.forEach(p=>sessions.delete(p.id));col.stop();
        const totals=gg.players.map(p=>({id:p.id,total:total(p.scores)})).sort((a,b)=>b.total-a.total);
        const winner=totals[0];
        if(bet>0){
          if(gg.players.length===1){const bonus=score('yahtzee',gg.dice)>0?bet*2:bet;addPoints(winner.id,gg.guildId,bonus);}
          else{addPoints(winner.id,gg.guildId,bet*gg.players.length);gg.players.slice(1).forEach(p=>recordLoss(p.id,gg.guildId,bet));}
        }
        return inter.update({embeds:[new EmbedBuilder().setTitle('🎲 Yahtzee — Game Over!').setColor('#57f287')
          .setDescription(`**🏆 Winner: <@${winner.id}>** with **${winner.total}** points!\n\n${gg.players.map(p=>`<@${p.id}>: ${total(p.scores)} pts\n${scoreStr(p.scores,gg.dice)}`).join('\n\n')}${bet>0?`\n\n🪙 Winner gets **${bet*gg.players.length}** coins!`:''}`)
          .setTimestamp()],components:[]});
      }
      gg.dice=roll5();gg.held=Array(5).fill(false);gg.rollsLeft=2;
      return inter.update({embeds:[gameEmbed(gg)],components:buildDiceButtons(gid,gg.dice,gg.held,gg.rollsLeft) as any});
    }
  });
  col.on('end',(_,r)=>{if(r==='time'){if(bet>0)players.forEach(p=>addPoints(p.id,ix.guildId!,bet));players.forEach(p=>sessions.delete(p.id));ix.editReply({embeds:[new EmbedBuilder().setColor('#ed4245').setDescription('Game expired. Bets refunded.')],components:[]}).catch(()=>{});}});
}

export default {
  data: new SlashCommandBuilder().setName('yahtzee').setDescription('Play Yahtzee — roll, hold, score! 🎲').setDMPermission(false)
    .addSubcommand(s=>s.setName('solo').setDescription('Play solo').addIntegerOption(o=>o.setName('bet').setDescription('Bet coins').setMinValue(1)))
    .addSubcommand(s=>s.setName('pvp').setDescription('PvP (2-4 players)').addUserOption(o=>o.setName('player2').setDescription('Player 2').setRequired(true)).addUserOption(o=>o.setName('player3').setDescription('Player 3')).addUserOption(o=>o.setName('player4').setDescription('Player 4')).addIntegerOption(o=>o.setName('bet').setDescription('Bet coins each').setMinValue(1))),

  async execute(ix:ChatInputCommandInteraction){
    const lang=(getGuild(ix.guildId!)?.language||'en') as Language;
    const sub=ix.options.getSubcommand();const { bet, warning: betWarning } = validateBet(ix.options.getInteger('bet') ?? 0, ix.guildId!);
    const players:User[]=[ix.user];
    if(sub==='pvp'){
      const p2=ix.options.getUser('player2',true);const p3=ix.options.getUser('player3');const p4=ix.options.getUser('player4');
      if(p2.bot||p2.id===ix.user.id)return ix.reply({embeds:[new EmbedBuilder().setColor('#ed4245').setDescription('❌ Invalid player.')],flags:MessageFlags.Ephemeral});
      players.push(p2);if(p3&&!p3.bot&&!players.find(p=>p.id===p3.id))players.push(p3);if(p4&&!p4.bot&&!players.find(p=>p.id===p4.id))players.push(p4);
    }
    if(bet>0){for(const p of players){if(!reservePoints(p.id,ix.guildId!,bet)){players.forEach(pp=>addPoints(pp.id,ix.guildId!,bet));return ix.reply({embeds:[new EmbedBuilder().setColor('#ed4245').setDescription(`❌ ${p.username}
    if (betWarning) { await interaction.followUp({ content: betWarning, ephemeral: true }).catch(() => {}); } has insufficient coins.`)],flags:MessageFlags.Ephemeral});}}}
    const row=sub==='pvp'?new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('yz_acc').setLabel('All Ready? Start!').setStyle(ButtonStyle.Success)):null;
    await ix.reply({embeds:[new EmbedBuilder().setColor('#f0c040').setDescription(`🎲 Starting Yahtzee${players.length>1?' PvP':' solo'}...`)],components:row?[row]:[]});
    await runGame(ix,players,bet,lang);
  },
};
