/**
 * /uno — UNO 2-4 players, full rules, Economy bets
 * Cards played via Select Menu. Private hand via ephemeral button.
 */
import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder, ComponentType, ButtonInteraction, User,
  MessageFlags,
} from 'discord.js';
import { getGuild } from '../../database/db';
import { Language } from '../../utils/localization';
import { reservePoints, addPoints, recordLoss } from '../../economy/db/EconomyDB';
import { sendChallenge } from '../../utils/pvpChallenge';
import { validateBet } from '../../utils/betHelper';

type Color='red'|'green'|'blue'|'yellow'|'wild';
type Value='0'|'1'|'2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'|'skip'|'rev'|'+2'|'wild'|'+4';
interface Card{color:Color;value:Value;}
interface UGame{deck:Card[];pile:Card[];hands:Map<string,Card[]>;players:string[];idx:number;dir:1|-1;activeColor:Color;pending:number;done:boolean;bet:number;guildId:string;createdAt:number;}

const CE:Record<Color,string>={red:'🔴',green:'🟢',blue:'🔵',yellow:'🟡',wild:'🌈'};
const VL:Partial<Record<Value,string>>={skip:'⛔',rev:'🔄','+2':'+2',wild:'🌈','+4':'+4'};
function cs(c:Card){return`${CE[c.color]}${VL[c.value]??c.value}`;}

function mkDeck():Card[]{
  const cols:Color[]=['red','green','blue','yellow'];const vals:Value[]=['0','1','2','3','4','5','6','7','8','9','skip','rev','+2'];
  const d:Card[]=[];cols.forEach(color=>{vals.forEach(value=>{d.push({color,value});if(value!=='0')d.push({color,value});});});
  for(let i=0;i<4;i++){d.push({color:'wild',value:'wild'});d.push({color:'wild',value:'+4'});}
  return shuffle(d);
}
function shuffle<T>(a:T[]):T[]{const b=[...a];for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]];}return b;}
function canPlay(c:Card,top:Card,ac:Color){return c.color==='wild'||c.color===ac||c.value===top.value;}
function drawCard(g:UGame):Card{if(!g.deck.length){const top=g.pile.pop()!;g.deck=shuffle(g.pile);g.pile=[top];}return g.deck.pop()!;}
function drawN(g:UGame,id:string,n:number){for(let i=0;i<n;i++)g.hands.get(id)!.push(drawCard(g));}
function nextIdx(g:UGame){return(g.idx+g.dir+g.players.length)%g.players.length;}

const sessions=new Map<string,UGame>();
setInterval(()=>{const now=Date.now();sessions.forEach((v,k)=>{if(now-v.createdAt>45*60_000)sessions.delete(k);});},15*60_000);

function buildPlayMenu(gid:string,hand:Card[],top:Card,ac:Color):ActionRowBuilder<StringSelectMenuBuilder|ButtonBuilder>[]{
  const opts=hand.slice(0,25).map((c,i)=>new StringSelectMenuOptionBuilder().setLabel(`${cs(c)}${canPlay(c,top,ac)?'':' ✗'}`).setValue(String(i)).setEmoji(CE[c.color]));
  return[
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder().setCustomId(`uno_play_${gid}`).setPlaceholder('Select a card to play').addOptions(opts)) as any,
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`uno_draw_${gid}`).setLabel('🃏 Draw card').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`uno_hand_${gid}`).setLabel('👁 View my hand').setStyle(ButtonStyle.Primary),
    ) as any,
  ];
}

function buildColorPick(gid:string):ActionRowBuilder<ButtonBuilder>[]{
  return[new ActionRowBuilder<ButtonBuilder>().addComponents((['red','green','blue','yellow'] as Color[]).map(c=>new ButtonBuilder().setCustomId(`uno_col_${gid}_${c}`).setLabel(`${CE[c]} ${c}`).setStyle(ButtonStyle.Secondary)))];
}

function gameEmbed(g:UGame):EmbedBuilder{
  const top=g.pile[g.pile.length-1];const cur=g.players[g.idx];
  return new EmbedBuilder().setTitle('🃏 UNO').setColor(0xed4245)
    .setDescription(`**Top card:** ${cs(top)} (active: ${CE[g.activeColor]})\n**Turn:** <@${cur}>\n${g.pending>0?`\n⚠️ Stack penalty: **${g.pending}** cards — play +2/+4 or draw!`:''}\n\n${g.players.map(p=>`<@${p}>: **${g.hands.get(p)!.length}** cards`).join('\n')}`)
    .addFields(...(g.bet>0?[{name:'Prize pot',value:`🪙 ${g.bet*g.players.length}`,inline:true}]:[]))
    .setFooter({text:'Use "View my hand" to see your cards privately'});
}

async function startUno(ix:ChatInputCommandInteraction,players:User[],bet:number,lang:Language){
  const gid=`uno_${ix.user.id}_${Date.now()}`;
  const deck=mkDeck();const hands=new Map<string,Card[]>();
  players.forEach(p=>{hands.set(p.id,[]);for(let i=0;i<7;i++)hands.get(p.id)!.push(deck.pop()!);});
  let first=deck.pop()!;while(first.color==='wild'){deck.unshift(first);first=deck.pop()!;}
  const g:UGame={deck,pile:[first],hands,players:players.map(p=>p.id),idx:0,dir:1,activeColor:first.color as Color,pending:0,done:false,bet,guildId:ix.guildId!,createdAt:Date.now()};
  players.forEach(p=>sessions.set(p.id,g));
  const msg=await ix.editReply({embeds:[gameEmbed(g)],components:buildPlayMenu(gid,hands.get(g.players[0])!,first,g.activeColor) as any});
  const col=msg.createMessageComponentCollector({filter:b=>b.customId.includes(gid)&&g.players.includes(b.user.id),time:40*60_000});

  col.on('collect',async(inter:any)=>{
    const gg=sessions.get(inter.user.id);if(!gg||gg.done)return inter.deferUpdate();
    const cur=gg.players[gg.idx];const id=inter.customId;

    if(id===`uno_hand_${gid}`){
      const hand=gg.hands.get(inter.user.id)!;const top=gg.pile[gg.pile.length-1];
      const playable=hand.filter(c=>canPlay(c,top,gg.activeColor));
      return inter.reply({content:`**Your hand (${hand.length} cards):**\n${hand.map(c=>cs(c)).join('  ')}\n\n**Playable:** ${playable.map(c=>cs(c)).join('  ')||'None — draw!'}`,flags:MessageFlags.Ephemeral});
    }
    if(inter.user.id!==cur)return inter.reply({content:'Not your turn!',flags:MessageFlags.Ephemeral});

    if(id===`uno_draw_${gid}`){
      drawN(gg,cur,Math.max(1,gg.pending));gg.pending=0;gg.idx=nextIdx(gg);
      return inter.update({embeds:[gameEmbed(gg)],components:buildPlayMenu(gid,gg.hands.get(gg.players[gg.idx])!,gg.pile[gg.pile.length-1],gg.activeColor) as any});
    }

    if(id===`uno_play_${gid}`){
      const ci=+inter.values[0];const hand=gg.hands.get(cur)!;const card=hand[ci];const top=gg.pile[gg.pile.length-1];
      if(!canPlay(card,top,gg.activeColor))return inter.reply({content:`Cannot play ${cs(card)} on ${cs(top)} (active: ${CE[gg.activeColor]}).`,flags:MessageFlags.Ephemeral});
      if(gg.pending>0&&card.value!=='+2'&&card.value!=='+4')return inter.reply({content:`Must play +2/+4 to stack or draw ${gg.pending} cards.`,flags:MessageFlags.Ephemeral});
      hand.splice(ci,1);gg.pile.push(card);if(card.color!=='wild')gg.activeColor=card.color;

      if(hand.length===0){
        gg.done=true;players.forEach(p=>sessions.delete(p.id));col.stop();
        if(bet>0){addPoints(cur,gg.guildId,bet*gg.players.length);gg.players.filter(p=>p!==cur).forEach(p=>recordLoss(p,gg.guildId,bet));}
        return inter.update({embeds:[new EmbedBuilder().setTitle('🃏 UNO — Game Over!').setColor('#57f287').setDescription(`🎉 <@${cur}> wins — played all cards!${bet>0?`\n\n🪙 <@${cur}> wins **${bet*gg.players.length}** coins!`:''}\n\n**Remaining hands:**\n${gg.players.filter(p=>p!==cur).map(p=>`<@${p}>: ${gg.hands.get(p)!.map(c=>cs(c)).join(' ')}`).join('\n')}`)],components:[]});
      }
      if(hand.length===1){/* UNO shout — handled client side */}

      switch(card.value){
        case'skip':gg.idx=nextIdx(gg);break;
        case'rev':gg.dir=(gg.dir*-1) as 1|-1;if(gg.players.length===2)gg.idx=nextIdx(gg);break;
        case'+2':gg.pending+=2;break;case'+4':gg.pending+=4;break;
      }

      if(card.color==='wild'){
        await inter.update({embeds:[new EmbedBuilder().setTitle('🌈 Choose Color').setColor('#f0c040').setDescription(`<@${cur}> played ${cs(card)}! Choose the active color:`)],components:buildColorPick(gid)});
        const colc=msg.createMessageComponentCollector({componentType:ComponentType.Button,filter:b=>b.user.id===cur&&b.customId.startsWith(`uno_col_${gid}`),time:30_000,max:1});
        colc.on('collect',async(cb:ButtonInteraction)=>{
          gg.activeColor=cb.customId.split('_')[3] as Color;gg.idx=nextIdx(gg);
          await cb.update({embeds:[gameEmbed(gg)],components:buildPlayMenu(gid,gg.hands.get(gg.players[gg.idx])!,gg.pile[gg.pile.length-1],gg.activeColor) as any});
        });
        colc.on('end',(_,r)=>{if(r==='time'){gg.activeColor='red';gg.idx=nextIdx(gg);ix.editReply({embeds:[gameEmbed(gg)],components:buildPlayMenu(gid,gg.hands.get(gg.players[gg.idx])!,gg.pile[gg.pile.length-1],gg.activeColor) as any}).catch(()=>{});}});
        return;
      }

      gg.idx=nextIdx(gg);
      await inter.update({embeds:[gameEmbed(gg)],components:buildPlayMenu(gid,gg.hands.get(gg.players[gg.idx])!,gg.pile[gg.pile.length-1],gg.activeColor) as any});
    }
  });
  col.on('end',(_,r)=>{if(r==='time'){const gg=sessions.get(ix.user.id);if(gg&&!gg.done){if(bet>0)players.forEach(p=>addPoints(p.id,ix.guildId!,bet));players.forEach(p=>sessions.delete(p.id));ix.editReply({embeds:[new EmbedBuilder().setColor('#ed4245').setDescription('Game expired. Bets refunded.')],components:[]}).catch(()=>{});}}});
}

export default {
  data: new SlashCommandBuilder().setName('uno').setDescription('Play UNO — 2-4 players! 🃏').setDMPermission(false)
    .addUserOption(o=>o.setName('player2').setDescription('Player 2').setRequired(true))
    .addUserOption(o=>o.setName('player3').setDescription('Player 3 (optional)'))
    .addUserOption(o=>o.setName('player4').setDescription('Player 4 (optional)'))
    .addIntegerOption(o=>o.setName('bet').setDescription('Bet coins each (optional)').setMinValue(1)),

  async execute(ix:ChatInputCommandInteraction){
    const lang=(getGuild(ix.guildId!)?.language||'en') as Language;
    const { bet, warning: betWarning } = validateBet(ix.options.getInteger('bet') ?? 0, ix.guildId!);
    const players:User[]=[ix.user];
    const p2=ix.options.getUser('player2',true);const p3=ix.options.getUser('player3');const p4=ix.options.getUser('player4');
    if(p2.bot||p2.id===ix.user.id)return ix.reply({embeds:[new EmbedBuilder().setColor('#ed4245').setDescription('❌ Invalid player.')],flags:MessageFlags.Ephemeral});
    players.push(p2);if(p3&&!p3.bot&&!players.find(p=>p.id===p3.id))players.push(p3);if(p4&&!p4.bot&&!players.find(p=>p.id===p4.id))players.push(p4);
    if(bet>0){for(const p of players){if(!reservePoints(p.id,ix.guildId!,bet)){players.forEach(pp=>addPoints(pp.id,ix.guildId!,bet));return ix.reply({embeds:[new EmbedBuilder().setColor('#ed4245').setDescription(`❌ ${p.username}
    if (betWarning) { await interaction.followUp({ content: betWarning, ephemeral: true }).catch(() => {}); } has insufficient coins.`)],flags:MessageFlags.Ephemeral});}}}
    // Challenge message for other players
    const row=new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('uno_start').setLabel('Start Game 🃏').setStyle(ButtonStyle.Success));
    const msg=await ix.reply({embeds:[new EmbedBuilder().setTitle('🃏 UNO').setColor(0xed4245).setDescription(`${players.map(p=>`<@${p.id}>`).join(', ')} — UNO game!${bet>0?`\n💰 Bet: **${bet}** coins each`:''}\n\n<@${ix.user.id}> click Start when ready!`)],components:[row],fetchReply:true});
    const col=msg.createMessageComponentCollector({componentType:ComponentType.Button,filter:b=>b.user.id===ix.user.id&&b.customId==='uno_start',time:60_000,max:1});
    col.on('collect',async(btn:ButtonInteraction)=>{await btn.update({embeds:[new EmbedBuilder().setColor(0xed4245).setDescription('🃏 Dealing cards...')],components:[]});await startUno(ix,players,bet,lang);});
    col.on('end',(_,r)=>{if(r==='time')ix.editReply({embeds:[new EmbedBuilder().setColor('#ed4245').setDescription('Lobby expired.')],components:[]}).catch(()=>{});});
  },
};
