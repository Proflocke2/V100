import {
  SlashCommandBuilder, ChatInputCommandInteraction, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, EmbedBuilder, ComponentType, ButtonInteraction,
  User, MessageFlags,
} from 'discord.js';
import { getGuild } from '../../database/db';
import { getLocalized, Language } from '../../utils/localization';
import { reservePoints, addPoints, recordLoss } from '../../economy/db/EconomyDB';
import { sendChallenge } from '../../utils/pvpChallenge';
import { validateBet } from '../../utils/betHelper';

type Cell = 'X'|'O'|null;

function makeGrid(): Cell[] { return Array(9).fill(null); }

function checkWinner(g: Cell[]): Cell|'draw'|null {
  const lines=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for(const[a,b,c] of lines) if(g[a]&&g[a]===g[b]&&g[a]===g[c]) return g[a];
  if(g.every(c=>c)) return'draw';
  return null;
}

function minimax(g:Cell[],isMax:boolean,depth=0):number{
  const w=checkWinner(g);
  if(w==='O') return 10-depth; if(w==='X') return depth-10; if(w==='draw') return 0;
  if(isMax){let b=-Infinity;for(let i=0;i<9;i++){if(!g[i]){g[i]='O';b=Math.max(b,minimax(g,false,depth+1));g[i]=null;}}return b;}
  let b=Infinity;for(let i=0;i<9;i++){if(!g[i]){g[i]='X';b=Math.min(b,minimax(g,true,depth+1));g[i]=null;}}return b;
}

function bestMove(g:Cell[]):number{
  let best=-Infinity,move=-1;
  for(let i=0;i<9;i++){if(!g[i]){g[i]='O';const v=minimax(g,false);g[i]=null;if(v>best){best=v;move=i;}}}
  return move;
}

function buildRows(grid:Cell[],disabled=false):ActionRowBuilder<ButtonBuilder>[]{
  const rows:ActionRowBuilder<ButtonBuilder>[]=[];
  for(let r=0;r<3;r++){
    const row=new ActionRowBuilder<ButtonBuilder>();
    for(let c=0;c<3;c++){
      const i=r*3+c,cell=grid[i];
      row.addComponents(new ButtonBuilder().setCustomId(`ttt_${i}`).setLabel(cell==='X'?'❌':cell==='O'?'⭕':'⬛').setStyle(cell==='X'?ButtonStyle.Danger:cell==='O'?ButtonStyle.Primary:ButtonStyle.Secondary).setDisabled(disabled||!!cell));
    }
    rows.push(row);
  }
  return rows;
}

async function startGame(ix: ChatInputCommandInteraction, opponent: User, bet: number, lang: Language): Promise<void> {
  const t = (k: string, v?: Record<string,string>) => getLocalized(k, lang, v);
  const grid = makeGrid();
  let currentPlayer: 'X'|'O' = 'X';
  const players: Record<string, User> = { X: ix.user, O: opponent };

  const betLine = bet > 0 ? `\n💰 **${bet}** coins each — winner takes **${bet*2}**!` : '';
  const embed = () => new EmbedBuilder()
    .setTitle('❌⭕ Tic-Tac-Toe')
    .setColor('#5865f2')
    .setDescription(
      `❌ <@${ix.user.id}> vs ⭕ <@${opponent.id}>${betLine}\n\n` +
      `**Turn:** ${currentPlayer === 'X' ? `❌ <@${ix.user.id}>` : `⭕ <@${opponent.id}>`}`,
    );

  const msg = await ix.followUp({ embeds: [embed()], components: buildRows(grid), fetchReply: true }) as any;
  const col = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120_000 });

  const finish = async (winner: Cell|'draw') => {
    col.stop();
    let color: string; let desc: string;
    if (winner === 'draw') {
      color = '#fee75c'; desc = t('game.draw');
      if (bet > 0) { addPoints(ix.user.id, ix.guildId!, bet); addPoints(opponent.id, ix.guildId!, bet); desc += '\n' + t('game.betsRefunded'); }
    } else if (winner === 'X') {
      color = '#57f287';
      if (bet > 0) { addPoints(ix.user.id, ix.guildId!, bet * 2); recordLoss(opponent.id, ix.guildId!, bet); }
      desc = t('game.won', { user: `❌ <@${ix.user.id}>` }) + (bet > 0 ? '\n' + t('game.winCoins', { n: String(bet * 2) }) : '');
    } else {
      color = '#ed4245';
      if (bet > 0) { addPoints(opponent.id, ix.guildId!, bet * 2); recordLoss(ix.user.id, ix.guildId!, bet); }
      desc = t('game.won', { user: `⭕ <@${opponent.id}>` }) + (bet > 0 ? '\n' + t('game.winCoins', { n: String(bet * 2) }) : '');
    }
    await msg.edit({ embeds: [new EmbedBuilder().setTitle('❌⭕ Tic-Tac-Toe').setColor(color as any).setDescription(desc)], components: buildRows(grid, true) });
  };

  col.on('collect', async (btn: ButtonInteraction) => {
    const allowedId = currentPlayer === 'X' ? players.X.id : players.O.id;
    if (btn.user.id !== allowedId) return btn.reply({ content: t('game.notYourTurn'), flags: MessageFlags.Ephemeral });
    const idx = +btn.customId.split('_')[1];
    if (grid[idx]) return btn.reply({ content: 'Already taken!', flags: MessageFlags.Ephemeral });
    grid[idx] = currentPlayer;
    await btn.deferUpdate();
    const w = checkWinner(grid);
    if (w) return finish(w);
    currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
    await msg.edit({ embeds: [embed()], components: buildRows(grid) });
  });

  col.on('end', (_, reason) => {
    if (reason === 'time') {
      if (bet > 0) { addPoints(ix.user.id, ix.guildId!, bet); addPoints(opponent.id, ix.guildId!, bet); }
      msg.edit({ embeds: [new EmbedBuilder().setColor('#ed4245').setDescription(t('game.expired') + ' ' + t('game.betsRefunded'))], components: buildRows(grid, true) }).catch(() => {});
    }
  });
}

export default {
  data: new SlashCommandBuilder()
    .setName('tictactoe')
    .setDescription('Play Tic-Tac-Toe ❌⭕')
    .setDMPermission(false)
    .addUserOption(o=>o.setName('opponent').setDescription('Opponent (leave empty for AI)'))
    .addIntegerOption(o=>o.setName('bet').setDescription('Bet coins (winner takes all)').setMinValue(1)),

  async execute(ix:ChatInputCommandInteraction){
    const lang=(getGuild(ix.guildId!)?.language||'en') as Language;
    const t=(k:string,v?:Record<string,string>)=>getLocalized(k,lang,v);
    const opponent=ix.options.getUser('opponent');
    const vsAI=!opponent;
    const { bet, warning: betWarning } = validateBet(ix.options.getInteger('bet') ?? 0, ix.guildId!);

    // Validate opponent
    if(!vsAI&&opponent&&(opponent.bot||opponent.id===ix.user.id))
      return ix.reply({embeds:[new EmbedBuilder().setColor('#ed4245').setDescription(t('game.invalidOpp'))],flags:MessageFlags.Ephemeral});

    // PvP: challenge flow with mutual bet agreement
    if(!vsAI&&opponent){
      return sendChallenge({
        ix, opponent, gameName:'Tic-Tac-Toe', gameEmoji:'❌⭕',
        proposedBet:bet, lang,
        onAccepted:async(finalBet)=>{
          await startGame(ix,opponent,finalBet,lang);
        },
      });
    }

    // PvE: reserve bet immediately
    if(bet>0&&!reservePoints(ix.user.id,ix.guildId!,bet))
      return ix.reply({embeds:[new EmbedBuilder().setColor('#ed4245').setDescription(t('game.noCoins'))],flags:MessageFlags.Ephemeral});

    const grid=makeGrid();
    let currentPlayer:'X'|'O'='X';
    const players:Record<string,User>={X:ix.user};

    const betLine=bet>0?`\n💰 **${bet}** coins each — winner takes **${bet*2}**!`:'';

    const embed=()=>new EmbedBuilder()
      .setTitle('❌⭕ Tic-Tac-Toe')
      .setColor('#5865f2')
      .setDescription(
        `${vsAI?`❌ <@${ix.user.id}> vs 🤖 AI`:`❌ <@${players.X.id}> vs ⭕ <@${players.O?.id}>`}${betLine}\n\n`+
        `**Turn:** ${currentPlayer==='X'?`❌ <@${players.X.id}>`:vsAI?'🤖 AI':`⭕ <@${players.O?.id}>`}`,
      );

    if (betWarning) { await ix.followUp({ content: betWarning, ephemeral: true }).catch(() => {}); }
    const msg = await ix.reply({embeds:[embed()],components:buildRows(grid),fetchReply:true});
    const col=msg.createMessageComponentCollector({componentType:ComponentType.Button,time:120_000});

    const finish=async(winner:Cell|'draw',updateFn:(opts:any)=>Promise<any>)=>{
      col.stop();
      let desc:string; let color:string;
      if(winner==='draw'){
        color='#fee75c'; desc=t('game.draw');
        if(bet>0){addPoints(ix.user.id,ix.guildId!,bet);if(!vsAI&&opponent)addPoints(opponent.id,ix.guildId!,bet);}
        desc+=bet>0?'\n'+t('game.betsRefunded'):'';
      } else if(winner==='X'){
        color='#57f287';
        const winnerUser=players.X;
        const loserUser=vsAI?null:players.O;
        if(bet>0){addPoints(winnerUser.id,ix.guildId!,bet*2);if(loserUser)recordLoss(loserUser.id,ix.guildId!,bet);}
        desc=t('game.won',{user:`❌ <@${winnerUser.id}>`})+(bet>0?'\n'+t('game.winCoins',{n:String(bet*2)}):'');
      } else {
        color='#ed4245';
        const winnerUser=vsAI?null:players.O;
        const loserUser=players.X;
        if(bet>0&&winnerUser){addPoints(winnerUser.id,ix.guildId!,bet*2);recordLoss(loserUser.id,ix.guildId!,bet);}
        else if(bet>0&&vsAI) recordLoss(loserUser.id,ix.guildId!,bet);
        desc=vsAI?`🤖 AI wins!${bet>0?'\n'+t('game.loseCoins',{n:String(bet)}):''}`:t('game.won',{user:`⭕ <@${winnerUser?.id}>`})+(bet>0?'\n'+t('game.winCoins',{n:String(bet*2)}):'');
      }
      await updateFn({embeds:[new EmbedBuilder().setTitle('❌⭕ Tic-Tac-Toe').setColor(color as any).setDescription(desc)],components:buildRows(grid,true)});
    };

    const doAiMove=async()=>{
      const move=bestMove(grid); if(move===-1) return;
      grid[move]='O';
      const w=checkWinner(grid);
      if(w) return finish(w,(opts)=>ix.editReply(opts));
      currentPlayer='X';
      await ix.editReply({embeds:[embed()],components:buildRows(grid)});
    };

    col.on('collect',async(btn:ButtonInteraction)=>{
      const allowedId=currentPlayer==='X'?players.X.id:(!vsAI?players.O?.id:null);
      if(btn.user.id!==allowedId) return btn.reply({content:t('game.notYourTurn'),flags:MessageFlags.Ephemeral});
      const idx=+btn.customId.split('_')[1];
      if(grid[idx]) return btn.reply({content:'Already taken!',flags:MessageFlags.Ephemeral});
      grid[idx]=currentPlayer;
      await btn.deferUpdate();
      const w=checkWinner(grid);
      if(w) return finish(w,(opts)=>ix.editReply(opts));
      currentPlayer=currentPlayer==='X'?'O':'X';
      await ix.editReply({embeds:[embed()],components:buildRows(grid)});
      if(vsAI&&currentPlayer==='O'){await new Promise(r=>setTimeout(r,800));await doAiMove();}
    });

    col.on('end',(_,reason)=>{
      if(reason==='time'){
        if(bet>0){addPoints(ix.user.id,ix.guildId!,bet);if(!vsAI&&opponent)addPoints(opponent.id,ix.guildId!,bet);}
        ix.editReply({embeds:[new EmbedBuilder().setColor('#ed4245').setDescription(t('game.expired')+' '+t('game.betsRefunded'))],components:buildRows(grid,true)}).catch(()=>{});
      }
    });
  },
};
