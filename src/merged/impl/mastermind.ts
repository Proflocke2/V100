/**
 * /mastermind — Classic code-breaking game, PvE + PvP (codemaker vs codebreaker)
 * 4 pegs, 6 colors, 10 guesses. After each guess: 🔴 = right color+position, ⚪ = right color wrong position
 */
import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ButtonBuilder, ButtonStyle,
  ComponentType, ButtonInteraction, User, MessageFlags,
} from 'discord.js';
import { getGuild } from '../../database/db';
import { reservePoints, addPoints, recordLoss } from '../../economy/db/EconomyDB';
import { sendChallenge } from '../../utils/pvpChallenge';
import { validateBet } from '../../utils/betHelper';

const COLORS=['🔴','🟠','🟡','🟢','🔵','🟣'];
const COLOR_NAMES=['Red','Orange','Yellow','Green','Blue','Purple'];
const MAX_GUESSES=10; const CODE_LEN=4;

function randomCode():string[]{return Array.from({length:CODE_LEN},()=>COLORS[Math.floor(Math.random()*COLORS.length)]);}

function evaluate(code:string[],guess:string[]):{black:number,white:number}{
  let black=0,white=0;
  const cu=[...code],gu=[...guess];
  // Black pegs (exact)
  for(let i=0;i<CODE_LEN;i++) if(gu[i]===cu[i]){black++;cu[i]=gu[i]='x';}
  // White pegs (color in wrong pos)
  for(let i=0;i<CODE_LEN;i++){if(gu[i]==='x')continue;const j=cu.indexOf(gu[i]);if(j!==-1){white++;cu[j]='x';}}
  return{black,white};
}

interface MMGame{
  code:string[]; guesses:string[][]; results:{black:number,white:number}[];
  currentGuess:string[]; done:boolean; won:boolean;
  makerId:string; breakerId:string; pvp:boolean; bet:number; guildId:string; createdAt:number;
}

const sessions=new Map<string,MMGame>();
setInterval(()=>{const now=Date.now();sessions.forEach((v,k)=>{if(now-v.createdAt>20*60_000)sessions.delete(k);});},10*60_000);

function historyStr(g:MMGame):string{
  if(!g.guesses.length) return '*No guesses yet.*';
  return g.guesses.map((guess,i)=>{
    const{black,white}=g.results[i];
    return `${i+1}. ${guess.join('')} → ${'🔴'.repeat(black)}${'⚪'.repeat(white)}${black===0&&white===0?'🔲 Nothing':''}`;
  }).join('\n');
}

function gameEmbed(g:MMGame):EmbedBuilder{
  const guessStr=g.currentGuess.map((c,i)=>c||`[${i+1}]`).join(' ');
  return new EmbedBuilder().setTitle('🔐 Mastermind').setColor('#9b59b6')
    .setDescription(
      `**Crack the ${CODE_LEN}-color code!**\n\`🔴=right color+position  ⚪=right color wrong position\`\n\n`+
      `**History (${g.guesses.length}/${MAX_GUESSES} guesses):**\n${historyStr(g)}\n\n`+
      `**Current guess:** ${guessStr}\n`+
      `**Colors:** ${COLORS.map((c,i)=>c+COLOR_NAMES[i][0]).join(' ')}`,
    )
    .addFields(
      {name:'Guesses left',value:`${MAX_GUESSES-g.guesses.length}`,inline:true},
      ...(g.bet>0?[{name:'Bet',value:`🪙 ${g.bet}`,inline:true}]:[]),
    ).setFooter({text:'Fill all 4 pegs using the dropdowns, then click Submit'});
}

function buildInputRows(gid:string,currentGuess:string[]):ActionRowBuilder<StringSelectMenuBuilder|ButtonBuilder>[]{
  const rows:ActionRowBuilder<any>[]=[];
  // 4 peg dropdowns
  for(let peg=0;peg<CODE_LEN;peg++){
    rows.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder().setCustomId(`mm_peg_${gid}_${peg}`)
        .setPlaceholder(`Peg ${peg+1}${currentGuess[peg]?`: ${currentGuess[peg]}`:''}`)
        .addOptions(COLORS.map((c,i)=>new StringSelectMenuOptionBuilder().setLabel(COLOR_NAMES[i]).setValue(c).setEmoji(c).setDefault(currentGuess[peg]===c)))
    ));
  }
  rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`mm_submit_${gid}`).setLabel('✅ Submit Guess').setStyle(ButtonStyle.Success).setDisabled(currentGuess.some(c=>!c)),
    new ButtonBuilder().setCustomId(`mm_clear_${gid}`).setLabel('🗑️ Clear').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`mm_hint_${gid}`).setLabel('💡 Hint (−1 guess)').setStyle(ButtonStyle.Primary),
  ));
  return rows;
}

async function runGame(ix:ChatInputCommandInteraction,code:string[],breakerId:string,makerId:string,pvp:boolean,bet:number):Promise<void>{
  const gid=`mm_${breakerId}_${Date.now()}`;
  const g:MMGame={code,guesses:[],results:[],currentGuess:Array(CODE_LEN).fill(''),done:false,won:false,makerId,breakerId,pvp,bet,guildId:ix.guildId!,createdAt:Date.now()};
  sessions.set(breakerId,g);
  const msg=await ix.editReply({embeds:[gameEmbed(g)],components:buildInputRows(gid,g.currentGuess) as any});
  const col=msg.createMessageComponentCollector({filter:b=>b.user.id===breakerId&&b.customId.includes(gid),time:15*60_000});
  col.on('collect',async(inter:any)=>{
    const gg=sessions.get(breakerId);if(!gg||gg.done)return inter.deferUpdate();
    const id=inter.customId;
    if(id.startsWith(`mm_peg_${gid}_`)){
      const peg=+id.split('_')[3];gg.currentGuess[peg]=inter.values[0];
      return inter.update({embeds:[gameEmbed(gg)],components:buildInputRows(gid,gg.currentGuess) as any});
    }
    if(id===`mm_clear_${gid}`){gg.currentGuess=Array(CODE_LEN).fill('');return inter.update({embeds:[gameEmbed(gg)],components:buildInputRows(gid,gg.currentGuess) as any});}
    if(id===`mm_hint_${gid}`){
      // Reveal one correct color in correct position (costs a guess)
      const unknown=gg.code.map((c,i)=>({c,i})).filter(({i})=>!gg.guesses.some(g=>g[i]===gg.code[i]));
      if(unknown.length){const{c,i}=unknown[Math.floor(Math.random()*unknown.length)];gg.currentGuess[i]=c;gg.guesses.push([...gg.code.map((_,j)=>j===i?c:'❓')]);gg.results.push({black:0,white:0});}
      return inter.update({embeds:[gameEmbed(gg)],components:buildInputRows(gid,gg.currentGuess) as any});
    }
    if(id===`mm_submit_${gid}`){
      if(gg.currentGuess.some(c=>!c))return inter.reply({content:'Fill all 4 pegs first!',flags:MessageFlags.Ephemeral});
      const result=evaluate(gg.code,[...gg.currentGuess]);
      gg.guesses.push([...gg.currentGuess]);gg.results.push(result);gg.currentGuess=Array(CODE_LEN).fill('');
      if(result.black===CODE_LEN){
        gg.done=true;gg.won=true;sessions.delete(breakerId);col.stop();
        if(bet>0){addPoints(breakerId,gg.guildId,bet*2);if(pvp)recordLoss(makerId,gg.guildId,bet);}
        return inter.update({embeds:[new EmbedBuilder().setTitle('🎉 Code cracked!').setColor('#57f287').setDescription(`You cracked **${gg.code.join('')}** in **${gg.guesses.length}** guesses!${bet>0?`\n🪙 +${bet*2} coins!`:''}\n\n${historyStr(gg)}`)],components:[]});
      }
      if(gg.guesses.length>=MAX_GUESSES){
        gg.done=true;sessions.delete(breakerId);col.stop();
        if(bet>0){recordLoss(breakerId,gg.guildId,bet);if(pvp)addPoints(makerId,gg.guildId,bet*2);}
        return inter.update({embeds:[new EmbedBuilder().setTitle('❌ Out of guesses!').setColor('#ed4245').setDescription(`The code was: **${gg.code.join('')}**${bet>0?`\n🪙 -${bet} coins.`:''}\n\n${historyStr(gg)}`)],components:[]});
      }
      await inter.update({embeds:[gameEmbed(gg)],components:buildInputRows(gid,gg.currentGuess) as any});
    }
  });
  col.on('end',(_,r)=>{if(r==='time'){if(bet>0)addPoints(breakerId,ix.guildId!,bet);sessions.delete(breakerId);ix.editReply({embeds:[new EmbedBuilder().setColor('#ed4245').setDescription(`Time's up! Code was: ${code.join('')}`)],components:[]}).catch(()=>{});}});
}

export default {
  data: new SlashCommandBuilder().setName('mastermind').setDescription('Mastermind — crack the secret color code! 🔐').setDMPermission(false)
    .addSubcommand(s=>s.setName('solo').setDescription('Play vs AI (AI sets the code)').addIntegerOption(o=>o.setName('bet').setDescription('Bet coins').setMinValue(1)))
    .addSubcommand(s=>s.setName('pvp').setDescription('PvP — one player sets the code, other cracks it')
      .addUserOption(o=>o.setName('codebreaker').setDescription('Who cracks the code').setRequired(true))
      .addIntegerOption(o=>o.setName('bet').setDescription('Bet coins each').setMinValue(1))),

  async execute(ix:ChatInputCommandInteraction){
    const sub=ix.options.getSubcommand();const { bet, warning: betWarning } = validateBet(ix.options.getInteger('bet') ?? 0, ix.guildId!);
    if(sub==='solo'){
      if(bet>0&&!reservePoints(ix.user.id,ix.guildId!,bet))return ix.reply({embeds:[new EmbedBuilder().setColor('#ed4245').setDescription('❌ Insufficient coins.')],flags:MessageFlags.Ephemeral});

    if (betWarning) {
      await ix.followUp({ content: betWarning, ephemeral: true }).catch(() => {});
    }      await ix.reply({embeds:[new EmbedBuilder().setColor('#9b59b6').setDescription('🔐 Generating code...')],components:[]});
      return runGame(ix,randomCode(),ix.user.id,'AI',false,bet);
    }
    const breaker=ix.options.getUser('codebreaker',true);
    if(breaker.bot||breaker.id===ix.user.id)return ix.reply({embeds:[new EmbedBuilder().setColor('#ed4245').setDescription('❌ Invalid player.')],flags:MessageFlags.Ephemeral});
    // PvP: challenge flow with bet negotiation
    return sendChallenge({
      ix, opponent:breaker, gameName:'Mastermind', gameEmoji:'🔐',
      proposedBet:bet, lang:(sub==='pvp'?'en':'en') as any,
      onAccepted:async(finalBet)=>{
        // Maker sets code via ephemeral dropdowns
        await ix.editReply({embeds:[new EmbedBuilder().setColor('#9b59b6').setTitle('🔐 Set Your Code').setDescription(`Set your secret 4-color code (only you can see this):`)],components:[]});
        const gid2=`mm_set_${ix.user.id}_${Date.now()}`;const codeInput2:string[]=Array(CODE_LEN).fill('');
        const rows2:ActionRowBuilder<any>[]=[];
        for(let p=0;p<CODE_LEN;p++)rows2.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId(`mm_set_${gid2}_${p}`).setPlaceholder(`Peg ${p+1}`).addOptions(COLORS.map((c,i)=>new StringSelectMenuOptionBuilder().setLabel(COLOR_NAMES[i]).setValue(c).setEmoji(c)))));
        rows2.push(new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`mm_setok_${gid2}`).setLabel('✅ Set Code').setStyle(ButtonStyle.Success).setDisabled(true)));
        const setMsg2=await ix.followUp({embeds:[new EmbedBuilder().setColor('#9b59b6').setDescription(`Choose your 4-peg secret code:\n${codeInput2.map((c,i)=>c||`[${i+1}]`).join(' ')}`)],components:rows2 as any,flags:MessageFlags.Ephemeral});
        const setCol2=setMsg2.createMessageComponentCollector({filter:b=>b.user.id===ix.user.id&&b.customId.includes(gid2),time:2*60_000});
        setCol2.on('collect',async(inter:any)=>{
          const id=inter.customId;
          if(id.startsWith(`mm_set_${gid2}_`)){const p=+id.split('_')[3];codeInput2[p]=inter.values[0];}
          const allSet2=codeInput2.every(c=>c);
          if(id===`mm_setok_${gid2}`){setCol2.stop();await inter.update({embeds:[new EmbedBuilder().setColor('#57f287').setDescription(`Code set! <@${breaker.id}> is now trying to crack it...`)],components:[]});await runGame(ix,[...codeInput2],breaker.id,ix.user.id,true,finalBet);return;}
          await inter.update({embeds:[new EmbedBuilder().setColor('#9b59b6').setDescription(`Your code so far: ${codeInput2.map((c,i)=>c||`[${i+1}]`).join(' ')}`)],components:rows2.map(r=>{if((r.components[0] as any).data?.type===2)return new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`mm_setok_${gid2}`).setLabel('✅ Set Code').setStyle(ButtonStyle.Success).setDisabled(!allSet2));return r;}) as any});
        });
      },
    });
  },
};
