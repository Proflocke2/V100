import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType,
  ButtonInteraction, User, MessageFlags,
} from 'discord.js';
import { getGuild } from '../../database/db';
import { getLocalized, Language } from '../../utils/localization';
import { reservePoints, addPoints, recordLoss } from '../../economy/db/EconomyDB';
import { sendChallenge } from '../../utils/pvpChallenge';
import { validateBet } from '../../utils/betHelper';

const choices = ['rock','paper','scissors'] as const;
type Choice = typeof choices[number];
const emoji: Record<Choice,string> = {rock:'🪨',paper:'📄',scissors:'✂️'};

function getResult(p:Choice,ai:Choice):'win'|'lose'|'draw'{
  if(p===ai) return'draw';
  if((p==='rock'&&ai==='scissors')||(p==='paper'&&ai==='rock')||(p==='scissors'&&ai==='paper')) return'win';
  return'lose';
}

function buildButtons(gid:string):ActionRowBuilder<ButtonBuilder>[]{
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`rps_rock_${gid}`).setLabel('🪨 Rock').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`rps_paper_${gid}`).setLabel('📄 Paper').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`rps_scissors_${gid}`).setLabel('✂️ Scissors').setStyle(ButtonStyle.Danger),
  )];
}

async function runRpsPvP(
  ix: ChatInputCommandInteraction, opp: User, finalBet: number,
  lang: Language, gid: string, t: (k: string, v?: Record<string,string>) => string,
): Promise<void> {
  const picks = new Map<string, Choice>();

  const msg = await ix.followUp({
    embeds: [new EmbedBuilder().setColor('#5865f2').setTitle('✊ Rock Paper Scissors PvP')
      .setDescription(`<@${ix.user.id}> vs <@${opp.id}>\n\nBoth players, choose your weapon! Picks are hidden until both choose.`)],
    components: buildButtons(gid),
    fetchReply: true,
  }) as any;

  const col = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (b: ButtonInteraction) => (b.user.id === ix.user.id || b.user.id === opp.id) && b.customId.includes(gid),
    time: 30_000,
  });

  col.on('collect', async (btn: ButtonInteraction) => {
    if (picks.has(btn.user.id)) return btn.reply({ content: 'You already picked!', flags: MessageFlags.Ephemeral });
    const choice = btn.customId.split('_')[1] as Choice;
    picks.set(btn.user.id, choice);
    await btn.reply({ content: `You chose ${emoji[choice]}! Waiting for opponent...`, flags: MessageFlags.Ephemeral });

    if (picks.size < 2) {
      await msg.edit({
        embeds: [new EmbedBuilder().setColor('#5865f2').setTitle('✊ Rock Paper Scissors PvP')
          .setDescription(`<@${ix.user.id}> vs <@${opp.id}>\n\n✅ **1/2 players have chosen** — waiting for the other...`)],
        components: buildButtons(gid),
      }).catch(() => {});
      return;
    }

    col.stop();
    const p1 = picks.get(ix.user.id)!;
    const p2 = picks.get(opp.id)!;
    const res = getResult(p1, p2);

    let color: string; let desc: string;
    const pickLine = `<@${ix.user.id}> ${emoji[p1]}  vs  <@${opp.id}> ${emoji[p2]}\n\n`;
    if (res === 'draw') {
      color = '#fee75c';
      if (finalBet > 0) { addPoints(ix.user.id, ix.guildId!, finalBet); addPoints(opp.id, ix.guildId!, finalBet); }
      desc = pickLine + t('game.draw') + (finalBet > 0 ? '\n' + t('game.betsRefunded') : '');
    } else if (res === 'win') {
      color = '#57f287';
      if (finalBet > 0) { addPoints(ix.user.id, ix.guildId!, finalBet * 2); recordLoss(opp.id, ix.guildId!, finalBet); }
      desc = pickLine + t('game.won', { user: `<@${ix.user.id}>` }) + (finalBet > 0 ? '\n' + t('game.winCoins', { n: String(finalBet * 2) }) : '');
    } else {
      color = '#ed4245';
      if (finalBet > 0) { addPoints(opp.id, ix.guildId!, finalBet * 2); recordLoss(ix.user.id, ix.guildId!, finalBet); }
      desc = pickLine + t('game.won', { user: `<@${opp.id}>` }) + (finalBet > 0 ? '\n' + t('game.winCoins', { n: String(finalBet * 2) }) : '');
    }

    await msg.edit({
      embeds: [new EmbedBuilder().setColor(color as any).setTitle('✊ Rock Paper Scissors PvP').setDescription(desc)],
      components: [],
    }).catch(() => {});
  });

  col.on('end', (_, r) => {
    if (r === 'time') {
      if (finalBet > 0) { addPoints(ix.user.id, ix.guildId!, finalBet); addPoints(opp.id, ix.guildId!, finalBet); }
      msg.edit({ embeds: [new EmbedBuilder().setColor('#ed4245').setDescription(t('game.expired') + ' ' + t('game.betsRefunded'))], components: [] }).catch(() => {});
    }
  });
}

export default {
  data: new SlashCommandBuilder()
    .setName('rps')
    .setDescription('Rock Paper Scissors ✊')
    .setDMPermission(false)
    .addSubcommand(s=>s.setName('play').setDescription('Play vs AI').addIntegerOption(o=>o.setName('bet').setDescription('Bet coins').setMinValue(1)))
    .addSubcommand(s=>s.setName('pvp').setDescription('Challenge another player').addUserOption(o=>o.setName('opponent').setDescription('Opponent').setRequired(true)).addIntegerOption(o=>o.setName('bet').setDescription('Bet coins each').setMinValue(1)))
    .addSubcommand(s=>s.setName('guide').setDescription('How to play')),

  async execute(ix:ChatInputCommandInteraction){
    const lang=(getGuild(ix.guildId!)?.language||'en') as Language;
    const t=(k:string,v?:Record<string,string>)=>getLocalized(k,lang,v);
    const sub=ix.options.getSubcommand();

    if(sub==='guide') return ix.reply({embeds:[new EmbedBuilder().setColor('#5865f2').setDescription(t('guide.rps'))],flags:MessageFlags.Ephemeral});

    const { bet, warning: betWarning } = validateBet(ix.options.getInteger('bet') ?? 0, ix.guildId!);
    const gid=`rps_${ix.user.id}_${Date.now()}`;

    if(sub==='pvp'){
      const opp=ix.options.getUser('opponent',true);
      if(opp.bot||opp.id===ix.user.id) return ix.reply({embeds:[new EmbedBuilder().setColor('#ed4245').setDescription(t('game.invalidOpp'))],flags:MessageFlags.Ephemeral});
      return sendChallenge({
        ix, opponent:opp, gameName:'Rock Paper Scissors', gameEmoji:'✊',
        proposedBet:bet, lang,
        onAccepted:async(finalBet)=>{
          await runRpsPvP(ix, opp, finalBet, lang, gid, t);
        },
      });
    }

    // PvE
    if(bet>0&&!reservePoints(ix.user.id,ix.guildId!,bet)) return ix.reply({embeds:[new EmbedBuilder().setColor('#ed4245').setDescription(t('game.noCoins'))],flags:MessageFlags.Ephemeral});

    if (betWarning) {
      await ix.followUp({ content: betWarning, ephemeral: true }).catch(() => {});
    }    const msg=await ix.reply({embeds:[new EmbedBuilder().setColor('#5865f2').setTitle('✊ Rock Paper Scissors').setDescription('Choose your weapon!')],components:buildButtons(gid),fetchReply:true});
    const col=msg.createMessageComponentCollector({componentType:ComponentType.Button,filter:b=>b.user.id===ix.user.id&&b.customId.includes(gid),time:30_000,max:1});
    col.on('collect',async(btn:ButtonInteraction)=>{
      const p=btn.customId.split('_')[1] as Choice;
      const ai=choices[Math.floor(Math.random()*3)];
      const res=getResult(p,ai);
      if(bet>0){if(res==='win')addPoints(ix.user.id,ix.guildId!,bet*2);else if(res==='lose')recordLoss(ix.user.id,ix.guildId!,bet);else addPoints(ix.user.id,ix.guildId!,bet);}
      await btn.update({embeds:[new EmbedBuilder().setColor(res==='draw'?'#fee75c':res==='win'?'#57f287':'#ed4245')
        .setTitle('✊ Rock Paper Scissors')
        .setDescription(`You: ${emoji[p]}  vs  AI: ${emoji[ai]}\n\n${res==='win'?t('game.won',{user:'You'}):res==='lose'?t('game.lost',{user:'You'}):t('game.draw')}${bet>0?'\n'+(res==='win'?t('game.winCoins',{n:String(bet*2)}):res==='lose'?t('game.loseCoins',{n:String(bet)}):t('game.betsRefunded')):''}`),],components:[]});
    });
    col.on('end',(_,r)=>{if(r==='time'){if(bet>0)addPoints(ix.user.id,ix.guildId!,bet);ix.editReply({embeds:[new EmbedBuilder().setColor('#ed4245').setDescription(t('game.expired'))],components:[]}).catch(()=>{});}});
  },
};
