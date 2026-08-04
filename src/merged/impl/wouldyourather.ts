import { getLocalized, Language } from '../../utils/localization';
import { getGuild } from '../../database/db';
/**
 * /wouldyourather — Would You Rather? with voting, categories, and PvP debates
 */
import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, ComponentType, ButtonInteraction, MessageFlags,
} from 'discord.js';

const QUESTIONS: Record<string, [string,string][]> = {
  fun: [
    ['Always speak in rhymes','Always speak in a different accent'],
    ['Have no internet for a month','Have no food for a week (magically survive)'],
    ['Be able to fly but only 1 meter off the ground','Be invisible but only when no one is looking'],
    ['Know every language','Know every instrument'],
    ['Always be 10 minutes late','Always be 20 minutes early'],
    ['Have a rewind button for your life','Have a pause button'],
    ['Live in the past','Live in the future'],
    ['Always be itchy','Always feel slightly dizzy'],
    ['Have legs as long as fingers','Have fingers as long as legs'],
    ['Eat pizza every day','Never eat pizza again'],
  ],
  deep: [
    ['Be very famous but hated','Be unknown but loved'],
    ['Know when you will die','Know how you will die'],
    ['Have unlimited money but no friends','Have great friends but always be broke'],
    ['Live 200 years in the past','Live 200 years in the future'],
    ['Be able to read minds but not speak','Speak any language but not hear'],
    ['Always tell the truth','Always tell lies'],
    ['Lose all memories from the past','Never make new memories'],
    ['Be the smartest person alive','Be the happiest person alive'],
    ['Have one real loyal friend','Have 1000 fake friends'],
    ['Fix your biggest mistake','Know your biggest upcoming mistake'],
  ],
  cursed: [
    ['Smell like cheese forever','Have the hiccups every hour'],
    ['Only be able to whisper','Only be able to yell'],
    ['Have hands for feet','Have feet for hands'],
    ['Sweat mayonnaise','Cry ranch dressing'],
    ['Only eat hot food cold','Only eat cold food hot'],
    ['Have a permanent unibrow','Have permanent raccoon eyes'],
    ['Bark like a dog when nervous','Meow when happy'],
    ['Be chased by a goose every day','Be stared at by ducks 24/7'],
    ['Never close your eyes','Never open your mouth wide'],
    ['Age only from neck up','Age only from neck down'],
  ],
};

export default {
  data: new SlashCommandBuilder()
    .setName('wouldyourather')
    .setDescription('Would You Rather? — vote, debate, survive! 🤔')
    .setDMPermission(false)
    .addStringOption(o=>o.setName('category').setDescription('Question category').addChoices({name:'Fun',value:'fun'},{name:'Deep',value:'deep'},{name:'Cursed 😈',value:'cursed'}))
    .addIntegerOption(o=>o.setName('rounds').setDescription('Number of questions (1-10, default 5)').setMinValue(1).setMaxValue(10)),

  async execute(ix: ChatInputCommandInteraction) {
    const cat = ix.options.getString('category') || 'fun';
    const rounds = ix.options.getInteger('rounds') ?? 5;
    const pool = [...QUESTIONS[cat]].sort(()=>Math.random()-.5).slice(0, rounds);

    let round = 0;
    const votes = new Map<string, Map<string,'a'|'b'>>();
    const gid = `wyr_${ix.user.id}_${Date.now()}`;

    const runRound = async (interaction: any, roundIdx: number, update: boolean) => {
      const [optA, optB] = pool[roundIdx];
      const voteMap = new Map<string,'a'|'b'>();
      votes.set(String(roundIdx), voteMap);

      const embed = () => {
        const aCount = [...voteMap.values()].filter(v=>v==='a').length;
        const bCount = [...voteMap.values()].filter(v=>v==='b').length;
        const total = aCount + bCount;
        const bar = (n: number) => total > 0 ? '█'.repeat(Math.round((n/total)*10)) : '';
        return new EmbedBuilder()
          .setTitle(`🤔 Would You Rather? (${roundIdx+1}/${rounds})`)
          .setColor('#9b59b6')
          .setDescription(`**A)** ${optA}\n\n**B)** ${optB}`)
          .addFields(
            {name:`🅰️ Option A — ${aCount} vote${aCount!==1?'s':''}`,value:`\`${bar(aCount)}\` ${total>0?Math.round((aCount/total)*100)+'%':'0%'}`,inline:true},
            {name:`🅱️ Option B — ${bCount} vote${bCount!==1?'s':''}`,value:`\`${bar(bCount)}\` ${total>0?Math.round((bCount/total)*100)+'%':'0%'}`,inline:true},
          )
          .setFooter({text:'Vote! Results show live. Next button after 15s.'});
      };

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`wyr_a_${gid}_${roundIdx}`).setLabel('🅰️ Option A').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`wyr_b_${gid}_${roundIdx}`).setLabel('🅱️ Option B').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`wyr_next_${gid}_${roundIdx}`).setLabel('➡️ Next').setStyle(ButtonStyle.Secondary),
      );

      const msg = update
        ? await interaction.update({embeds:[embed()],components:[row],fetchReply:true})
        : await interaction.reply({embeds:[embed()],components:[row],fetchReply:true});

      const col = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: b=>b.customId.includes(`${gid}_${roundIdx}`),
        time: 120_000,
      });

      return new Promise<boolean>(resolve => {
        col.on('collect', async(btn: ButtonInteraction) => {
          if (btn.customId === `wyr_next_${gid}_${roundIdx}`) {
            col.stop(); resolve(true); return btn.deferUpdate();
          }
          const choice = btn.customId.startsWith(`wyr_a_`) ? 'a' : 'b';
          voteMap.set(btn.user.id, choice);
          await btn.update({embeds:[embed()],components:[row]});
        });
        col.on('end', ()=>resolve(false));
      });
    };

    for (let i = 0; i < rounds; i++) {
      await runRound(i===0?ix:null, i, i>0);
    }

    // Final summary
    const summary = pool.map(([a,b],i)=>{
      const vm = votes.get(String(i))!;
      const aV=[...vm.values()].filter(v=>v==='a').length;
      const bV=[...vm.values()].filter(v=>v==='b').length;
      const winner=aV>bV?`🅰️ (${aV}v)`:`🅱️ (${bV}v)`;
      return `**Q${i+1}:** ${a} vs ${b}\n→ ${winner} won`;
    }).join('\n\n');

    await ix.editReply({
      embeds:[new EmbedBuilder().setTitle('🤔 Would You Rather? — Results').setColor('#57f287').setDescription(summary).setTimestamp()],
      components:[],
    });
  },
};
