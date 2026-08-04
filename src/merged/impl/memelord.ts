import { sendChallenge } from '../../utils/pvpChallenge';
import { getLocalized, Language } from '../../utils/localization';
import { getGuild } from '../../database/db';
/**
 * /memelord — Players write captions for meme templates, judge picks funniest
 */
import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType, ButtonInteraction,
  ModalSubmitInteraction, User, MessageFlags,
} from 'discord.js';

const MEME_TEMPLATES = [
  { name:'Drake Approves/Rejects',      prompt:'Complete: "Drake rejects: ___  Drake approves: ___"' },
  { name:'This Is Fine (Dog in fire)',  prompt:'Describe what "This Is Fine" means for your situation.' },
  { name:'Distracted Boyfriend',        prompt:'Label: Boyfriend = ___, Girlfriend = ___, Other Person = ___' },
  { name:'Two Buttons',                 prompt:'Two buttons the character is sweating over: Button 1 = ___, Button 2 = ___' },
  { name:'Change My Mind',              prompt:'"_____ [unpopular opinion]. Change my mind."' },
  { name:'Galaxy Brain',                prompt:'4 increasingly cursed thoughts leading to: ___' },
  { name:'Expanding Brain',             prompt:'Levels of brain: Normal → Enlightened → Galaxy → [Your cursed final level]' },
  { name:'Confused Math Lady',          prompt:'Explain something confusing in 1 sentence.' },
  { name:'Gru\'s Plan',                 prompt:'Step 1: ___ Step 2: ___ Step 3: Realize Step 2 is the same as Step 1.' },
  { name:'Panik / Kalm / Panik',        prompt:'Panik: ___ | Kalm: ___ | PANIK: ___' },
  { name:'Netflix: Are you still there?',prompt:'"Me watching ___. Netflix: Are you still there? Me after ___ hours: ___"' },
  { name:'Woman Yelling at Cat',        prompt:'Woman yelling about: ___. Cat smugly sitting there eating: ___' },
];

interface MLGame {
  players: string[]; judgeIdx: number; round: number; maxRounds: number;
  scores: Map<string,number>; template: typeof MEME_TEMPLATES[0];
  captions: Map<string,string>; phase:'caption'|'judge'; createdAt: number;
}
const sessions = new Map<string,MLGame>();
setInterval(()=>{const now=Date.now();sessions.forEach((v,k)=>{if(now-v.createdAt>90*60_000)sessions.delete(k);});},20*60_000);

function pickTemplate() { return MEME_TEMPLATES[Math.floor(Math.random()*MEME_TEMPLATES.length)]; }

export default {
  data: new SlashCommandBuilder()
    .setName('memelord')
    .setDescription('Memelord — write the funniest meme caption! 😂')
    .setDMPermission(false)
    .addUserOption(o=>o.setName('player2').setDescription('Player 2').setRequired(true))
    .addUserOption(o=>o.setName('player3').setDescription('Player 3'))
    .addUserOption(o=>o.setName('player4').setDescription('Player 4'))
    .addUserOption(o=>o.setName('player5').setDescription('Player 5'))
    .addIntegerOption(o=>o.setName('rounds').setDescription('Rounds (default 4)').setMinValue(2).setMaxValue(10)),

  async execute(ix: ChatInputCommandInteraction) {
    const players = [ix.user.id];
    for(const opt of ['player2','player3','player4','player5']) {
      const u = ix.options.getUser(opt);
      if(u && !u.bot && !players.includes(u.id)) players.push(u.id);
    }
    const maxRounds = ix.options.getInteger('rounds') ?? 4;
    const gid = `ml_${ix.user.id}_${Date.now()}`;
    const g: MLGame = {
      players, judgeIdx:0, round:1, maxRounds,
      scores: new Map(players.map(p=>[p,0])),
      template: pickTemplate(), captions: new Map(), phase:'caption', createdAt:Date.now(),
    };
    sessions.set(gid, g);

    const roundEmbed = () => new EmbedBuilder()
      .setTitle(`😂 Memelord — Round ${g.round}/${g.maxRounds}`)
      .setColor('#e67e22')
      .setDescription(
        `**Meme Template: ${g.template.name}**\n> ${g.template.prompt}\n\n`+
        `**Judge:** <@${g.players[g.judgeIdx]}>\n\n`+
        `**Submissions:** ${g.players.filter(p=>p!==g.players[g.judgeIdx]).map(p=>`<@${p}> ${g.captions.has(p)?'✅':'⏳'}`).join(' ')}\n\n`+
        `**Scores:** ${[...g.scores.entries()].map(([p,s])=>`<@${p}>: ${s}pt`).join(' | ')}`,
      );

    const captionBtn = () => new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`ml_caption_${gid}`).setLabel('✍️ Write Caption').setStyle(ButtonStyle.Primary),
    );

    const msg = await ix.reply({embeds:[roundEmbed()],components:[captionBtn()],fetchReply:true});
    const col = msg.createMessageComponentCollector({filter:b=>b.customId.includes(gid)&&g.players.includes(b.user.id),time:90*60_000});

    col.on('collect', async(btn: ButtonInteraction)=>{
      if(btn.customId === `ml_caption_${gid}`) {
        if(btn.user.id === g.players[g.judgeIdx]) return btn.reply({content:"You're the judge — wait for captions!",flags:MessageFlags.Ephemeral});
        if(g.captions.has(btn.user.id)) return btn.reply({content:'Already submitted!',flags:MessageFlags.Ephemeral});
        const modal = new ModalBuilder().setCustomId(`ml_modal_${gid}`).setTitle('Write Your Caption')
          .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder().setCustomId('caption').setLabel(g.template.prompt.slice(0,45))
              .setStyle(TextInputStyle.Paragraph).setRequired(true).setMinLength(3).setMaxLength(300)
          ));
        await btn.showModal(modal);
        const submitted = await btn.awaitModalSubmit({filter:m=>m.user.id===btn.user.id&&m.customId===`ml_modal_${gid}`,time:120_000}).catch(()=>null);
        if(!submitted) return;
        const caption = submitted.fields.getTextInputValue('caption');
        g.captions.set(btn.user.id, caption);
        await submitted.reply({content:`✅ Caption submitted: "${caption}"`,flags:MessageFlags.Ephemeral});
        const nonJudges = g.players.filter(p=>p!==g.players[g.judgeIdx]);
        if(nonJudges.every(p=>g.captions.has(p))) {
          g.phase='judge';
          const shuffled = [...g.captions.entries()].sort(()=>Math.random()-.5);
          const judgeMenu = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
            new StringSelectMenuBuilder().setCustomId(`ml_judge_${gid}`).setPlaceholder('🏆 Pick the funniest caption')
              .addOptions(shuffled.map(([,c],i)=>new StringSelectMenuOptionBuilder().setLabel(c.slice(0,100)).setValue(String(i))))
          );
          await ix.editReply({embeds:[new EmbedBuilder()
            .setTitle(`😂 Memelord — Round ${g.round}/${g.maxRounds} — JUDGING`)
            .setColor('#e67e22')
            .setDescription(`**Template: ${g.template.name}**\n> ${g.template.prompt}\n\n**Captions (judge picks!):**\n${shuffled.map(([,c],i)=>`${i+1}. ${c}`).join('\n\n')}\n\n<@${g.players[g.judgeIdx]}> — pick the funniest!`)],
            components:[judgeMenu]});
        } else {
          await ix.editReply({embeds:[roundEmbed()],components:[captionBtn()]});
        }
        return;
      }
    });

    const judgeCol = msg.createMessageComponentCollector({componentType:ComponentType.StringSelect,filter:s=>s.customId===`ml_judge_${gid}`&&s.user.id===g.players[g.judgeIdx],time:90*60_000});
    judgeCol.on('collect', async(sel:any)=>{
      const shuffled = [...g.captions.entries()].sort(()=>Math.random()-.5);
      const [winnerId, winCaption] = shuffled[+sel.values[0]];
      g.scores.set(winnerId,(g.scores.get(winnerId)??0)+1);
      await sel.update({embeds:[new EmbedBuilder().setTitle('🏆 Funniest Caption!').setColor('#f1c40f')
        .setDescription(`**Template: ${g.template.name}**\n\n🥇 **"${winCaption}"**\nby <@${winnerId}>\n\n**Scores:** ${[...g.scores.entries()].map(([p,s])=>`<@${p}>: **${s}pt**`).join(' | ')}`)],components:[]});
      g.round++; g.captions.clear();
      if(g.round > g.maxRounds){
        col.stop();judgeCol.stop();
        const sorted=[...g.scores.entries()].sort((a,b)=>b[1]-a[1]);
        return setTimeout(()=>ix.editReply({embeds:[new EmbedBuilder().setTitle('😂 Memelord — Game Over!').setColor('#57f287')
          .setDescription(`🏆 **MEMELORD: <@${sorted[0][0]}> (${sorted[0][1]}pts)**\n\n${sorted.map(([p,s],i)=>`${i===0?'🥇':i===1?'🥈':'🥉'} <@${p}>: ${s}pts`).join('\n')}`)
          .setTimestamp()],components:[]}),3000);
      }
      g.judgeIdx=(g.judgeIdx+1)%g.players.length; g.template=pickTemplate(); g.phase='caption';
      setTimeout(()=>ix.editReply({embeds:[roundEmbed()],components:[captionBtn()]}),3000);
    });
  },
};
