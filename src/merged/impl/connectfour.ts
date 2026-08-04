/**
 * /connectfour — Classic PvP Connect Four + variants:
 *   classic    — 6×7 standard
 *   large      — 8×9 board
 *   chess960   — random column order each game
 *   connectris — after 3 pieces, bottom row auto-clears like Tetris gravity
 *   pve        — vs AI (any variant)
 */
import {
  SlashCommandBuilder, ChatInputCommandInteraction, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, EmbedBuilder, ComponentType, ButtonInteraction,
  User, MessageFlags,
} from 'discord.js';
import { getGuild } from '../../database/db';
import { reservePoints, addPoints, recordLoss } from '../../economy/db/EconomyDB';
import { sendChallenge } from '../../utils/pvpChallenge';
import { validateBet } from '../../utils/betHelper';
import { getLocalized, Language } from '../../utils/localization';

type Variant = 'classic'|'large'|'chess960'|'connectris';
type Board = string[][];

const EMPTY='⬛'; const P1='🔴'; const P2='🟡';

function dims(v:Variant):[number,number]{ return v==='large'?[8,9]:[6,7]; }

function makeBoard(v:Variant):Board{
  const[r,c]=dims(v); return Array.from({length:r},()=>Array(c).fill(EMPTY));
}

function drop(b:Board,col:number,piece:string):boolean{
  for(let r=b.length-1;r>=0;r--) if(b[r][col]===EMPTY){b[r][col]=piece;return true;}
  return false;
}

function applyGravity(b:Board):void{
  // Pull all pieces down after connectris clear
  for(let c=0;c<b[0].length;c++){
    const pieces=b.map(r=>r[c]).filter(x=>x!==EMPTY);
    for(let r=0;r<b.length;r++) b[r][c]=r<b.length-pieces.length?EMPTY:pieces[r-(b.length-pieces.length)];
  }
}

function connectrisClear(b:Board):boolean{
  // Clear any full row after every 3rd piece placed
  let cleared=false;
  for(let r=b.length-1;r>=0;r--){
    if(b[r].every(c=>c!==EMPTY)){ b[r].fill(EMPTY); cleared=true; }
  }
  if(cleared) applyGravity(b);
  return cleared;
}

function checkWin(b:Board,piece:string):boolean{
  const R=b.length,C=b[0].length;
  for(let r=0;r<R;r++) for(let c=0;c<C-3;c++) if([0,1,2,3].every(i=>b[r][c+i]===piece)) return true;
  for(let r=0;r<R-3;r++) for(let c=0;c<C;c++) if([0,1,2,3].every(i=>b[r+i][c]===piece)) return true;
  for(let r=0;r<R-3;r++) for(let c=0;c<C-3;c++) if([0,1,2,3].every(i=>b[r+i][c+i]===piece)) return true;
  for(let r=3;r<R;r++) for(let c=0;c<C-3;c++) if([0,1,2,3].every(i=>b[r-i][c+i]===piece)) return true;
  return false;
}

function isDraw(b:Board):boolean{ return b[0].every(c=>c!==EMPTY); }

function render(b:Board,colOrder?:number[]):string{
  const C=b[0].length;
  const nums=['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣'];
  const header=(colOrder||Array.from({length:C},(_,i)=>i)).map(i=>nums[i]).join('');
  return b.map(r=>r.join('')).join('\n')+'\n'+header;
}

function aiMove(b:Board,piece:string):number{
  const opp=piece===P1?P2:P1; const C=b[0].length;
  // Win
  for(let c=0;c<C;c++){ const t=b.map(r=>[...r]); if(drop(t,c,piece)&&checkWin(t,piece)) return c; }
  // Block
  for(let c=0;c<C;c++){ const t=b.map(r=>[...r]); if(drop(t,c,opp)&&checkWin(t,opp)) return c; }
  // Center preference
  const center=Math.floor(C/2);
  if(b[0][center]===EMPTY) return center;
  const opts=Array.from({length:C},(_,i)=>i).filter(c=>b[0][c]===EMPTY);
  return opts[Math.floor(Math.random()*opts.length)]??0;
}

function buildButtons(b:Board,gid:string,disabled=false):ActionRowBuilder<ButtonBuilder>[]{
  const C=b[0].length; const rows:ActionRowBuilder<ButtonBuilder>[]=[];
  const perRow=Math.ceil(C/2);
  for(let start=0;start<C;start+=perRow){
    const row=new ActionRowBuilder<ButtonBuilder>();
    for(let c=start;c<Math.min(start+perRow,C);c++){
      row.addComponents(new ButtonBuilder().setCustomId(`cf_${gid}_${c}`).setLabel(`${c+1}`).setStyle(b[0][c]===EMPTY?ButtonStyle.Secondary:ButtonStyle.Primary).setDisabled(disabled||b[0][c]!==EMPTY));
    }
    rows.push(row);
  }
  return rows;
}

const VARIANT_DESC:Record<Variant,string>={
  classic:'Classic 6×7 Connect Four',
  large:'Large 8×9 board — more strategy',
  chess960:'Columns shuffled randomly each game',
  connectris:'Full rows clear automatically (Tetris gravity!)',
};

async function runConnectFour(ix: ChatInputCommandInteraction, p2User: User, variant: Variant, bet: number): Promise<void> {
  const board = makeBoard(variant);
  const colOrder = variant === 'chess960' ? Array.from({length: board[0].length}, (_, i) => i).sort(() => Math.random() - .5) : undefined;
  let current = P1; let moveCount = 0;
  const gid = `cf_${ix.user.id}_${Date.now()}`;
  const players: {[k:string]: User|null} = {[P1]: ix.user, [P2]: p2User};

  const embed = () => new EmbedBuilder()
    .setTitle(`🔴🟡 Connect Four${variant !== 'classic' ? ` — ${variant.charAt(0).toUpperCase() + variant.slice(1)}` : ''}`)
    .setColor('#5865f2')
    .setDescription(render(board, colOrder))
    .addFields(
      {name: 'Turn', value: `${current} ${players[current]?.username ?? ''}`, inline: true},
      {name: 'Variant', value: VARIANT_DESC[variant], inline: true},
      ...(bet > 0 ? [{name: 'Bet', value: `🪙 ${bet}`, inline: true}] : []),
    );

  const msg = await ix.followUp({embeds: [embed()], components: buildButtons(board, gid), fetchReply: true}) as any;
  const col = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (b: ButtonInteraction) => b.customId.startsWith(`cf_${gid}`),
    time: 10 * 60_000,
  });

  col.on('collect', async (btn: ButtonInteraction) => {
    if (btn.user.id !== players[current]?.id) return btn.reply({content: 'Not your turn!', flags: MessageFlags.Ephemeral});
    const rawCol = +btn.customId.split('_')[2];
    const actualCol = colOrder ? colOrder[rawCol] : rawCol;
    if (!drop(board, actualCol, current)) return btn.reply({content: 'Column full!', flags: MessageFlags.Ephemeral});
    moveCount++;
    if (variant === 'connectris' && moveCount % 3 === 0) connectrisClear(board);

    if (checkWin(board, current)) {
      const winnerId = players[current]?.id;
      if (bet > 0 && winnerId) {
        addPoints(winnerId, ix.guildId!, bet * 2);
        const loserId = current === P1 ? players[P2]?.id : players[P1]?.id;
        if (loserId) recordLoss(loserId, ix.guildId!, bet);
      }
      await btn.update({embeds: [embed().setTitle(`${current} ${players[current]?.username} wins! 🎉`)], components: buildButtons(board, gid, true)});
      return col.stop();
    }
    if (isDraw(board)) {
      if (bet > 0) { addPoints(ix.user.id, ix.guildId!, bet); addPoints(p2User.id, ix.guildId!, bet); }
      await btn.update({embeds: [embed().setTitle('🤝 Draw!')], components: buildButtons(board, gid, true)});
      return col.stop();
    }

    current = current === P1 ? P2 : P1;
    await btn.update({embeds: [embed()], components: buildButtons(board, gid)});
  });

  col.on('end', (_, r) => {
    if (r === 'time') {
      if (bet > 0) { addPoints(ix.user.id, ix.guildId!, bet); addPoints(p2User.id, ix.guildId!, bet); }
      msg.edit({embeds: [new EmbedBuilder().setColor('#ed4245').setDescription('Game expired. Bets refunded.')], components: []}).catch(() => {});
    }
  });
}

export default {
  data: new SlashCommandBuilder()
    .setName('connectfour')
    .setDescription('Connect Four + variants 🔴🟡')
    .setDMPermission(false)
    .addSubcommand(s=>s.setName('pvp').setDescription('Challenge a player')
      .addUserOption(o=>o.setName('opponent').setDescription('Opponent').setRequired(true))
      .addStringOption(o=>o.setName('variant').setDescription('Game variant').addChoices(
        {name:'Classic 6×7',value:'classic'},{name:'Large 8×9',value:'large'},
        {name:'Chess960 (shuffled)',value:'chess960'},{name:'Connectris (Tetris gravity)',value:'connectris'},
      ))
      .addIntegerOption(o=>o.setName('bet').setDescription('Bet coins each').setMinValue(1)))
    .addSubcommand(s=>s.setName('pve').setDescription('Play vs AI')
      .addStringOption(o=>o.setName('variant').setDescription('Game variant').addChoices(
        {name:'Classic 6×7',value:'classic'},{name:'Large 8×9',value:'large'},
        {name:'Chess960 (shuffled)',value:'chess960'},{name:'Connectris (Tetris gravity)',value:'connectris'},
      ))
      .addIntegerOption(o=>o.setName('bet').setDescription('Bet coins').setMinValue(1))),

  async execute(ix:ChatInputCommandInteraction){
    const lang=(getGuild(ix.guildId!)?.language||'en') as Language;
    const sub=ix.options.getSubcommand();
    const variant=(ix.options.getString('variant')||'classic') as Variant;
    const { bet, warning: betWarning } = validateBet(ix.options.getInteger('bet') ?? 0, ix.guildId!);
    const vsAI=sub==='pve';

    let p2User:User|null=null;
    if(!vsAI){
      p2User=ix.options.getUser('opponent',true);
      if(p2User.bot||p2User.id===ix.user.id) return ix.reply({content:'Invalid opponent.',flags:MessageFlags.Ephemeral});
    }

    // PvP: challenge flow
    if(!vsAI&&p2User){
      return sendChallenge({
        ix, opponent:p2User, gameName:`Connect Four — ${variant}`, gameEmoji:'🔴🟡',
        proposedBet:bet, lang:(getGuild(ix.guildId!)?.language||'en') as any,
        onAccepted:async(finalBet)=>{
          await runConnectFour(ix,p2User!,variant,finalBet);
        },
      });
    }

    // PvE
    if(bet>0&&!reservePoints(ix.user.id,ix.guildId!,bet))
      return ix.reply({embeds:[new EmbedBuilder().setColor('#ed4245').setDescription('❌ Insufficient coins.')],flags:MessageFlags.Ephemeral});

    const board=makeBoard(variant);
    const colOrder=variant==='chess960'?Array.from({length:board[0].length},(_,i)=>i).sort(()=>Math.random()-.5):undefined;
    let current=P1; let moveCount=0;
    const gid=`cf_${ix.user.id}_${Date.now()}`;
    const players:{[k:string]:User|null}={[P1]:ix.user,[P2]:vsAI?null:p2User};

    const embed=()=>new EmbedBuilder()
      .setTitle(`🔴🟡 Connect Four${variant!=='classic'?` — ${variant.charAt(0).toUpperCase()+variant.slice(1)}`:''}`)
      .setColor('#5865f2')
      .setDescription(render(board,colOrder))
      .addFields(
        {name:'Turn',value:`${current} ${vsAI&&current===P2?'AI':players[current]?.username??''}`,inline:true},
        {name:'Variant',value:VARIANT_DESC[variant],inline:true},
        ...(bet>0?[{name:'Bet',value:`🪙 ${bet}`,inline:true}]:[]),
      );

    if (betWarning) { await ix.followUp({ content: betWarning, ephemeral: true }).catch(() => {}); }
    const msg=await ix.reply({embeds:[embed()],components:buildButtons(board,gid),fetchReply:true});
    const col=msg.createMessageComponentCollector({componentType:ComponentType.Button,filter:b=>b.customId.startsWith(`cf_${gid}`),time:10*60_000});

    col.on('collect',async(btn:ButtonInteraction)=>{
      // Turn guard
      if(!vsAI&&btn.user.id!==players[current]?.id) return btn.reply({content:'Not your turn!',flags:MessageFlags.Ephemeral});
      if(vsAI&&current===P2) return btn.deferUpdate();
      if(vsAI&&btn.user.id!==ix.user.id) return btn.reply({content:'Not your game.',flags:MessageFlags.Ephemeral});

      const rawCol=+btn.customId.split('_')[2];
      const actualCol=colOrder?colOrder[rawCol]:rawCol;
      if(!drop(board,actualCol,current)) return btn.reply({content:'Column full!',flags:MessageFlags.Ephemeral});
      moveCount++;

      // Connectris gravity
      if(variant==='connectris'&&moveCount%3===0) connectrisClear(board);

      if(checkWin(board,current)){
        const winnerId=players[current]?.id;
        if(bet>0&&winnerId){
          addPoints(winnerId,ix.guildId!,bet*(vsAI?2:2));
          const loserId=current===P1?(vsAI?null:players[P2]?.id):players[P1]?.id;
          if(loserId) recordLoss(loserId,ix.guildId!,bet);
        }
        await btn.update({embeds:[embed().setTitle(`${current} ${vsAI&&current===P2?'AI':players[current]?.username} wins! 🎉`)],components:buildButtons(board,gid,true)});
        return col.stop();
      }
      if(isDraw(board)){
        if(bet>0){addPoints(ix.user.id,ix.guildId!,bet);if(!vsAI&&p2User)addPoints(p2User.id,ix.guildId!,bet);}
        await btn.update({embeds:[embed().setTitle('🤝 Draw!')],components:buildButtons(board,gid,true)});
        return col.stop();
      }

      current=current===P1?P2:P1;
      await btn.update({embeds:[embed()],components:buildButtons(board,gid)});

      // AI move
      if(vsAI&&current===P2){
        setTimeout(async()=>{
          const aiCol=aiMove(board,P2); drop(board,aiCol,P2); moveCount++;
          if(variant==='connectris'&&moveCount%3===0) connectrisClear(board);
          if(checkWin(board,P2)){
            if(bet>0) recordLoss(ix.user.id,ix.guildId!,bet);
            await ix.editReply({embeds:[embed().setTitle('🤖 AI wins!')],components:buildButtons(board,gid,true)});
            col.stop(); return;
          }
          if(isDraw(board)){
            if(bet>0)addPoints(ix.user.id,ix.guildId!,bet);
            await ix.editReply({embeds:[embed().setTitle('🤝 Draw!')],components:buildButtons(board,gid,true)});
            col.stop(); return;
          }
          current=P1;
          await ix.editReply({embeds:[embed()],components:buildButtons(board,gid)}).catch(()=>{});
        },800);
      }
    });

    col.on('end',(_,r)=>{
      if(r==='time'){
        if(bet>0){addPoints(ix.user.id,ix.guildId!,bet);if(!vsAI&&p2User)addPoints(p2User.id,ix.guildId!,bet);}
        ix.editReply({embeds:[new EmbedBuilder().setColor('#ed4245').setDescription('Game expired. Bets refunded.')],components:[]}).catch(()=>{});
      }
    });
  },
};
