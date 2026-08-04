/**
 * /battleship — PvE & PvP with ship placement phase + single board view + Economy
 *
 * Flow:
 *   1. Placement phase: player places 5 ships via dropdown (pick row A-J, col 1-10, direction)
 *   2. Battle phase: single embed showing YOUR board + shots on enemy, select coordinate to shoot
 */
import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder, ComponentType, ButtonInteraction,
  User, MessageFlags,
} from 'discord.js';
import { getGuild } from '../../database/db';
import { Language } from '../../utils/localization';
import { reservePoints, addPoints, recordLoss } from '../../economy/db/EconomyDB';
import { sendChallenge } from '../../utils/pvpChallenge';
import { validateBet } from '../../utils/betHelper';

// ── Types ─────────────────────────────────────────────────────────────────────

type Cell = 'empty'|'ship'|'hit'|'miss';
type Board = Cell[][];
const COLS = 'ABCDEFGHIJ'.split('');
const SIZE = 10;
const SHIPS = [{n:'Carrier',s:5},{n:'Battleship',s:4},{n:'Cruiser',s:3},{n:'Submarine',s:3},{n:'Destroyer',s:2}];

interface BSGame {
  p1:Board; p2:Board;
  p1Id:string; p2Id:string;
  pvp:boolean; bet:number; guildId:string;
  done:boolean; turn:'p1'|'p2';
  // Placement phase
  placing: boolean;
  p1Placed: boolean; p2Placed: boolean;
  createdAt:number;
}

const sessions = new Map<string, BSGame>();
setInterval(()=>{ const now=Date.now(); sessions.forEach((v,k)=>{ if(now-v.createdAt>35*60_000) sessions.delete(k); }); }, 10*60_000);

// ── Board helpers ─────────────────────────────────────────────────────────────

function mkBoard(): Board { return Array.from({length:SIZE}, ()=>Array(SIZE).fill('empty') as Cell[]); }

function canPlace(b:Board, r:number, c:number, size:number, horiz:boolean): boolean {
  for(let i=0;i<size;i++){
    const nr=horiz?r:r+i, nc=horiz?c+i:c;
    if(nr<0||nr>=SIZE||nc<0||nc>=SIZE) return false;
    if(b[nr][nc]!=='empty') return false;
    // Check adjacency
    for(const[dr,dc] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]]){
      const ar=nr+dr, ac=nc+dc;
      if(ar>=0&&ar<SIZE&&ac>=0&&ac<SIZE&&b[ar][ac]==='ship') return false;
    }
  }
  return true;
}

function placeShip(b:Board, r:number, c:number, size:number, horiz:boolean): void {
  for(let i=0;i<size;i++){ const nr=horiz?r:r+i, nc=horiz?c+i:c; b[nr][nc]='ship'; }
}

function randBoard(): Board {
  const b=mkBoard();
  SHIPS.forEach(s=>{ while(true){ const h=Math.random()<.5, r=Math.floor(Math.random()*(h?SIZE:SIZE-s.s+1)), c=Math.floor(Math.random()*(h?SIZE-s.s+1:SIZE)); if(canPlace(b,r,c,s.s,h)){placeShip(b,r,c,s.s,h);break;} } });
  return b;
}

function shipsLeft(b:Board): number { return b.flat().filter(c=>c==='ship').length; }

function aiShoot(b:Board): [number,number] {
  const hits:[number,number][]=[];
  for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++) if(b[r][c]==='hit') hits.push([r,c]);
  if(hits.length){
    const[hr,hc]=hits[Math.floor(Math.random()*hits.length)];
    const cands:[number,number][]=[];
    for(const[dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]){ const nr=hr+dr,nc=hc+dc; if(nr>=0&&nr<SIZE&&nc>=0&&nc<SIZE&&(b[nr][nc]==='empty'||b[nr][nc]==='ship')) cands.push([nr,nc]); }
    if(cands.length) return cands[Math.floor(Math.random()*cands.length)];
  }
  const u:[number,number][]=[];
  for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++) if(b[r][c]==='empty'||b[r][c]==='ship') u.push([r,c]);
  return u[Math.floor(Math.random()*u.length)];
}

// ── Render ────────────────────────────────────────────────────────────────────

function cellIcon(c:Cell, revealShips=false): string {
  if(c==='hit')  return '💥';
  if(c==='miss') return '〰️';
  if(c==='ship') return revealShips ? '🚢' : '🌊';
  return '🌊';
}

/** Render both boards side by side in one embed */
function boardStr(myBoard:Board, enemyBoard:Board): string {
  const header = '`  A B C D E F G H I J`';
  const rows = myBoard.map((row, i) => {
    const myRow  = row.map(c=>cellIcon(c, true)).join('');
    const enRow  = enemyBoard[i].map(c=>cellIcon(c, false)).join('');
    const rNum   = String(i+1).padStart(2);
    return `\`${rNum}\`${myRow}  \`${rNum}\`${enRow}`;
  });
  return `**Your fleet** (🚢=ship 💥=hit 〰️=miss)\n${header}\n${rows.join('\n')}\n\n**Enemy waters** (shoot here)\n${header}\n${rows.join('\n').replace(/my/g,'en')}`;
}

/** Cleaner: two separate boards stacked vertically */
function twoBoards(myBoard:Board, enemyBoard:Board): string {
  const header = '`   A  B  C  D  E  F  G  H  I  J`';
  const myRows  = myBoard.map((row,i)=>  '`'+String(i+1).padStart(2)+'`'+row.map(c=>cellIcon(c,true)).join(''));
  const enRows  = enemyBoard.map((row,i)=>'`'+String(i+1).padStart(2)+'`'+row.map(c=>cellIcon(c,false)).join(''));
  return `**🚢 Your fleet:**\n${header}\n${myRows.join('\n')}\n\n**🎯 Enemy waters:**\n${header}\n${enRows.join('\n')}`;
}

// ── Ship placement UI ─────────────────────────────────────────────────────────

interface PlaceState { board:Board; shipIdx:number; row:number|null; col:number|null; horiz:boolean|null; }

async function runPlacement(
  ix: ChatInputCommandInteraction,
  userId: string,
  gid: string,
  onDone: (board:Board)=>void,
): Promise<void> {
  const state: PlaceState = { board:mkBoard(), shipIdx:0, row:null, col:null, horiz:null };

  const ship = ()=>SHIPS[state.shipIdx];

  const statusEmbed = ()=>new EmbedBuilder()
    .setTitle('🚢 Place Your Ships')
    .setColor('#1a6eb0')
    .setDescription(
      `**Ship:** ${ship().n} (size ${ship().s})\n\n`+
      `**Steps:**\n`+
      `${state.row!==null?'✅':'⬜'} 1. Select ROW (A-J)\n`+
      `${state.col!==null?'✅':'⬜'} 2. Select COLUMN (1-10)\n`+
      `${state.horiz!==null?'✅':'⬜'} 3. Select DIRECTION\n\n`+
      `**Your board so far:**\n`+
      mkBoard().map((_,r)=>'`'+String(r+1).padStart(2)+'`'+state.board[r].map(c=>cellIcon(c,true)).join('')).join('\n'),
    )
    .setFooter({text:`Ship ${state.shipIdx+1}/${SHIPS.length} — place all ships to start`});

  // Row select (A-J = 0-9)
  const rowMenu = ()=>new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder().setCustomId(`bs_row_${gid}`)
      .setPlaceholder(`Step 1: Select row${state.row!==null?` ✅ (${state.row+1} selected)`:''}`)
      .addOptions(Array.from({length:10},(_,i)=>new StringSelectMenuOptionBuilder().setLabel(`Row ${i+1}`).setValue(String(i)).setDefault(state.row===i)))
  );
  // Col select (A-J)
  const colMenu = ()=>new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder().setCustomId(`bs_col_${gid}`)
      .setPlaceholder(`Step 2: Select column${state.col!==null?` ✅ (${COLS[state.col]} selected)`:''}`)
      .addOptions(COLS.map((l,i)=>new StringSelectMenuOptionBuilder().setLabel(`Column ${l}`).setValue(String(i)).setDefault(state.col===i)))
  );
  // Direction select
  const dirMenu = ()=>new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder().setCustomId(`bs_dir_${gid}`)
      .setPlaceholder(`Step 3: Direction${state.horiz!==null?` ✅ (${state.horiz?'Horizontal':'Vertical'})`:''}`)
      .addOptions([
        new StringSelectMenuOptionBuilder().setLabel('→ Horizontal').setValue('h').setDefault(state.horiz===true),
        new StringSelectMenuOptionBuilder().setLabel('↓ Vertical').setValue('v').setDefault(state.horiz===false),
      ])
  );
  const confirmBtn = ()=>new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`bs_confirm_${gid}`).setLabel('✅ Place Ship').setStyle(ButtonStyle.Success)
      .setDisabled(state.row===null||state.col===null||state.horiz===null),
    new ButtonBuilder().setCustomId(`bs_random_${gid}`).setLabel('🎲 Random placement').setStyle(ButtonStyle.Secondary),
  );

  const buildComponents = ()=>[rowMenu(), colMenu(), dirMenu(), confirmBtn()];

  const msg = await ix.followUp({
    embeds:[statusEmbed()],
    components: buildComponents() as any,
    flags: MessageFlags.Ephemeral,
  });

  const col = msg.createMessageComponentCollector({
    filter: b=>b.user.id===userId && b.customId.includes(gid),
    time: 5*60_000,
  });

  col.on('collect', async(inter:any)=>{
    const id = inter.customId;

    if(id===`bs_row_${gid}`)    { state.row   = +inter.values[0]; }
    if(id===`bs_col_${gid}`)    { state.col   = +inter.values[0]; }
    if(id===`bs_dir_${gid}`)    { state.horiz = inter.values[0]==='h'; }

    if(id===`bs_random_${gid}`){
      state.board = randBoard();
      col.stop('done');
      await inter.update({embeds:[new EmbedBuilder().setColor('#57f287').setDescription('🎲 Ships placed randomly! Game starting...')],components:[]});
      onDone(state.board);
      return;
    }

    if(id===`bs_confirm_${gid}`){
      const r=state.row!, c=state.col!, h=state.horiz!;
      if(!canPlace(state.board,r,c,ship().s,h)){
        await inter.reply({content:`❌ Can't place ${ship().n} there — out of bounds or overlapping. Try a different spot.`,flags:MessageFlags.Ephemeral});
        return;
      }
      placeShip(state.board,r,c,ship().s,h);
      state.shipIdx++;
      state.row=null; state.col=null; state.horiz=null;

      if(state.shipIdx>=SHIPS.length){
        col.stop('done');
        await inter.update({embeds:[new EmbedBuilder().setColor('#57f287').setDescription('✅ All ships placed! Waiting for game to start...')],components:[]});
        onDone(state.board);
        return;
      }
      await inter.update({embeds:[statusEmbed()],components: buildComponents() as any});
      return;
    }

    await inter.update({embeds:[statusEmbed()],components: buildComponents() as any});
  });

  col.on('end',(_,reason)=>{
    if(reason==='time') {
      // Random fallback on timeout
      state.board = randBoard();
      onDone(state.board);
    }
  });
}

// ── Battle phase ──────────────────────────────────────────────────────────────

function buildShootMenu(enemyBoard:Board, gid:string, tag:string): ActionRowBuilder<StringSelectMenuBuilder>[] {
  const opts: StringSelectMenuOptionBuilder[] = [];
  for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++){
    if(enemyBoard[r][c]==='hit'||enemyBoard[r][c]==='miss') continue;
    opts.push(new StringSelectMenuOptionBuilder().setLabel(`${COLS[c]}${r+1}`).setValue(`${r},${c}`));
  }
  if(!opts.length) opts.push(new StringSelectMenuOptionBuilder().setLabel('No targets').setValue('none'));
  return [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder().setCustomId(`bs_shoot_${gid}_${tag}`).setPlaceholder('🎯 Select coordinate to shoot').addOptions(opts.slice(0,25))
  )];
}

function battleEmbed(g:BSGame, myBoard:Board, enemyBoard:Board, lastShot='', turn=''):EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('🎯 Battleship')
    .setColor('#1a6eb0')
    .setDescription(twoBoards(myBoard, enemyBoard))
    .addFields(
      {name:'Enemy ships left', value:`🚢 ${shipsLeft(enemyBoard)}`, inline:true},
      {name:'Your ships left',  value:`🚢 ${shipsLeft(myBoard)}`,    inline:true},
      ...(g.bet>0?[{name:'Bet',value:`🪙 ${g.bet}`,inline:true}]:[]),
      ...(lastShot?[{name:'Last shot',value:lastShot}]:[]),
      ...(turn?[{name:'Turn',value:turn}]:[]),
    );
}

async function startBattle(ix:ChatInputCommandInteraction, g:BSGame, gid:string):Promise<void> {
  const firstId = g.p1Id;
  const myBoard = g.p1Id===firstId ? g.p1 : g.p2;
  const enBoard = g.p1Id===firstId ? g.p2 : g.p1;

  const embed = battleEmbed(g, myBoard, enBoard, '', `<@${firstId}>'s turn!`);
  const msg = await ix.editReply({
    embeds:[embed],
    components: buildShootMenu(enBoard, gid, 'p1') as any,
  });

  const col = msg.createMessageComponentCollector({
    filter: s=>(s.user.id===g.p1Id||s.user.id===g.p2Id) && s.customId.includes(gid),
    time: 30*60_000,
  });

  col.on('collect', async(sel:any)=>{
    const gg = sessions.get(sel.user.id); if(!gg||gg.done) return sel.deferUpdate();
    const isP1 = sel.user.id===gg.p1Id;
    if((gg.turn==='p1'&&!isP1)||(gg.turn==='p2'&&isP1)) return sel.reply({content:'Not your turn!',flags:MessageFlags.Ephemeral});

    const val = sel.values[0]; if(val==='none') return sel.deferUpdate();
    const[r,c] = val.split(',').map(Number);
    const target = isP1?gg.p2:gg.p1;
    const my     = isP1?gg.p1:gg.p2;
    const cell   = target[r][c];
    if(cell==='hit'||cell==='miss') return sel.reply({content:'Already shot there!',flags:MessageFlags.Ephemeral});

    target[r][c] = cell==='ship'?'hit':'miss';
    const shotResult = `${sel.user.username} → ${COLS[c]}${r+1}: ${target[r][c]==='hit'?'💥 Hit!':'〰️ Miss!'}`;

    // Win check
    if(shipsLeft(target)===0){
      gg.done=true; sessions.delete(gg.p1Id); sessions.delete(gg.p2Id); col.stop();
      const winnerId=isP1?gg.p1Id:gg.p2Id, loserId=isP1?gg.p2Id:gg.p1Id;
      if(gg.bet>0){ addPoints(winnerId,gg.guildId,gg.bet*2); recordLoss(loserId,gg.guildId,gg.bet); }
      return sel.update({
        embeds:[new EmbedBuilder().setTitle(`🎉 <@${winnerId}> wins!`).setColor('#57f287')
          .setDescription(`All enemy ships sunk!\n${shotResult}${gg.bet>0?`\n\n🪙 +${gg.bet*2} coins!`:''}\n\n**Enemy board:**\n`+
            mkBoard().map((_,i)=>'`'+String(i+1).padStart(2)+'`'+target[i].map(c=>cellIcon(c,true)).join('')).join('\n'))
          .setTimestamp()],
        components:[],
      });
    }

    // AI turn for PvE
    if(!gg.pvp){
      const[ar,ac]=aiShoot(gg.p1);
      const aiCell=gg.p1[ar][ac]; gg.p1[ar][ac]=aiCell==='ship'?'hit':'miss';
      const aiResult=`AI → ${COLS[ac]}${ar+1}: ${gg.p1[ar][ac]==='hit'?'💥 Hit!':'〰️ Miss!'}`;
      if(shipsLeft(gg.p1)===0){
        gg.done=true; sessions.delete(gg.p1Id); col.stop();
        if(gg.bet>0) recordLoss(gg.p1Id,gg.guildId,gg.bet);
        return sel.update({embeds:[new EmbedBuilder().setTitle('🤖 AI wins!').setColor('#ed4245').setDescription(`AI sank all your ships!\n${aiResult}${gg.bet>0?`\n\n🪙 -${gg.bet} coins.`:''}\n\n**Your board:**\n`+gg.p1.map((row,i)=>'`'+String(i+1).padStart(2)+'`'+row.map(c=>cellIcon(c,true)).join('')).join('\n'))],components:[]});
      }
      return sel.update({embeds:[battleEmbed(gg,gg.p1,gg.p2,`${shotResult}\n${aiResult}`,`Your turn!`)],components:buildShootMenu(gg.p2,gid,'p1') as any});
    }

    // PvP turn swap
    gg.turn = gg.turn==='p1'?'p2':'p1';
    const nextId = gg.turn==='p1'?gg.p1Id:gg.p2Id;
    const nextMy = gg.turn==='p1'?gg.p1:gg.p2;
    const nextEn = gg.turn==='p1'?gg.p2:gg.p1;
    await sel.update({embeds:[battleEmbed(gg,nextMy,nextEn,shotResult,`<@${nextId}>'s turn!`)],components:buildShootMenu(nextEn,gid,gg.turn) as any});
  });

  col.on('end',(_,r)=>{
    if(r==='time'){
      const gg=sessions.get(ix.user.id);
      if(gg&&!gg.done){
        if(gg.bet>0){ addPoints(gg.p1Id,gg.guildId,gg.bet); if(gg.pvp) addPoints(gg.p2Id,gg.guildId,gg.bet); }
        sessions.delete(gg.p1Id); if(gg.pvp) sessions.delete(gg.p2Id);
        ix.editReply({embeds:[new EmbedBuilder().setColor('#ed4245').setDescription('Game expired. Bets refunded.')],components:[]}).catch(()=>{});
      }
    }
  });
}

// ── Command ───────────────────────────────────────────────────────────────────

export default {
  data: new SlashCommandBuilder()
    .setName('battleship')
    .setDescription('Battleship — place ships & sink the enemy fleet! 🎯')
    .setDMPermission(false)
    .addSubcommand(s=>s.setName('pve').setDescription('Play vs AI')
      .addIntegerOption(o=>o.setName('bet').setDescription('Bet coins').setMinValue(1))
      .addStringOption(o=>o.setName('placement').setDescription('Ship placement').addChoices({name:'Manual (choose yourself)',value:'manual'},{name:'Random',value:'random'}).setRequired(false)))
    .addSubcommand(s=>s.setName('pvp').setDescription('Challenge a player')
      .addUserOption(o=>o.setName('opponent').setDescription('Opponent').setRequired(true))
      .addIntegerOption(o=>o.setName('bet').setDescription('Bet coins each').setMinValue(1))),

  async execute(ix:ChatInputCommandInteraction){
    const lang=(getGuild(ix.guildId!)?.language||'en') as Language;
    const sub=ix.options.getSubcommand();
    const { bet, warning: betWarning } = validateBet(ix.options.getInteger('bet') ?? 0, ix.guildId!);

    if(sub==='pve'){
      if(bet>0&&!reservePoints(ix.user.id,ix.guildId!,bet))
        return ix.reply({embeds:[new EmbedBuilder().setColor('#ed4245').setDescription('❌ Insufficient coins.')],flags:MessageFlags.Ephemeral});

    if (betWarning) {
      await ix.followUp({ content: betWarning, ephemeral: true }).catch(() => {});
    }
      const placement = ix.options.getString('placement')??'manual';
      const gid = `bs_${ix.user.id}_${Date.now()}`;

      await ix.reply({embeds:[new EmbedBuilder().setColor('#1a6eb0').setDescription('🎯 Battleship vs AI — starting...')],components:[]});

      const g:BSGame={p1:mkBoard(),p2:randBoard(),p1Id:ix.user.id,p2Id:'AI',pvp:false,bet,guildId:ix.guildId!,done:false,turn:'p1',placing:true,p1Placed:false,p2Placed:true,createdAt:Date.now()};
      sessions.set(ix.user.id,g);

      if(placement==='random'){
        g.p1=randBoard(); g.p1Placed=true; g.placing=false;
        await startBattle(ix,g,gid);
      } else {
        await runPlacement(ix,ix.user.id,gid,async(board)=>{
          g.p1=board; g.p1Placed=true; g.placing=false;
          await startBattle(ix,g,gid);
        });
      }
      return;
    }

    // PvP
    const opp=ix.options.getUser('opponent',true);
    if(opp.bot||opp.id===ix.user.id)
      return ix.reply({embeds:[new EmbedBuilder().setColor('#ed4245').setDescription('❌ Invalid opponent.')],flags:MessageFlags.Ephemeral});

    return sendChallenge({
      ix, opponent:opp, gameName:'Battleship', gameEmoji:'🎯',
      proposedBet:bet, lang,
      onAccepted:async(finalBet)=>{
        const gid=`bsp_${ix.user.id}_${Date.now()}`;
        const g:BSGame={p1:mkBoard(),p2:mkBoard(),p1Id:ix.user.id,p2Id:opp.id,pvp:true,bet:finalBet,guildId:ix.guildId!,done:false,turn:'p1',placing:true,p1Placed:false,p2Placed:false,createdAt:Date.now()};
        sessions.set(ix.user.id,g); sessions.set(opp.id,g);
        let p1Board:Board|null=null, p2Board:Board|null=null;
        const tryStart=async()=>{ if(!p1Board||!p2Board) return; g.p1=p1Board; g.p2=p2Board; g.placing=false; await startBattle(ix,g,gid); };
        await runPlacement(ix,ix.user.id,gid+'_p1',async(b)=>{ p1Board=b; await tryStart(); });
        await runPlacement(ix,opp.id,    gid+'_p2',async(b)=>{ p2Board=b; await tryStart(); });
      },
    });
  },
};
