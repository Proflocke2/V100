import {
  SlashCommandBuilder, ChatInputCommandInteraction, ChannelType,
  EmbedBuilder, PermissionFlagsBits,
} from 'discord.js';
import { requireAdmin } from '../../utils/guards';
import { success, error, info } from '../../utils/embeds';
import {
  setPartnerConfig, getPartnerConfig, getWeekCounts, resetWeekCounts,
} from '../../modules/partnerTracking/service';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default {
  data: new SlashCommandBuilder()
    .setName('partners')
    .setDescription('Partner-link tracking and weekly activity report')

    .addSubcommand(s => s.setName('setup').setDescription('Configure partner tracking [Admin only]')
      .addChannelOption(o => o.setName('partners_channel').setDescription('Channel where staff post partner links').setRequired(true).addChannelTypes(ChannelType.GuildText))
      .addChannelOption(o => o.setName('report_channel').setDescription('Channel where the weekly report is posted').setRequired(true).addChannelTypes(ChannelType.GuildText))
      .addStringOption(o => o.setName('post_day').setDescription('Day of week the report posts (UTC)').setRequired(true)
        .addChoices(...DAYS.map((d, i) => ({ name: d, value: String(i) }))))
      .addIntegerOption(o => o.setName('post_hour').setDescription('UTC hour the report posts (0–23)').setRequired(true).setMinValue(0).setMaxValue(23)))

    .addSubcommand(s => s.setName('status').setDescription('Show this week\'s counts and config'))

    .addSubcommand(s => s.setName('report').setDescription('[Admin] Post this week\'s report now without waiting'))

    .addSubcommand(s => s.setName('reset').setDescription('[Admin] Reset this week\'s counts without posting a report')),

  async execute(interaction: ChatInputCommandInteraction) {
    const sub = interaction.options.getSubcommand();
    const gid = interaction.guildId!;

    if (sub === 'setup') {
      if (!await requireAdmin(interaction)) return;
      const pc  = interaction.options.getChannel('partners_channel', true);
      const rc  = interaction.options.getChannel('report_channel', true);
      const day = parseInt(interaction.options.getString('post_day', true), 10);
      const hour = interaction.options.getInteger('post_hour', true);
      setPartnerConfig(gid, pc.id, rc.id, day, hour);
      return interaction.reply({
        embeds: [success('Partner tracking configured',
          `Partners channel: <#${pc.id}>\nReport channel: <#${rc.id}>\nWeekly report posts every **${DAYS[day]}** at **${hour}:00 UTC**.`)],
        ephemeral: true,
      });
    }

    const cfg = getPartnerConfig(gid);

    if (sub === 'status') {
      if (!cfg) return interaction.reply({ embeds: [info('Partner tracking not set up', 'Run `/partners setup` to configure which channel to monitor and where to post the weekly report.')], ephemeral: true });
      const rows = getWeekCounts(gid);
      const medals = ['🥇', '🥈', '🥉'];
      const lines = rows.length
        ? rows.map((r, i) => `${medals[i] ?? `${i + 1}.`} <@${r.userId}> — **${r.count}**`)
        : ['No partner posts this week yet.'];
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setTitle('🤝 Partner Activity — This Week')
          .setColor('#ff6b35')
          .setDescription(lines.join('\n'))
          .addFields(
            { name: 'Partners channel', value: `<#${cfg.partners_channel}>`, inline: true },
            { name: 'Weekly report',    value: `<#${cfg.report_channel}> — ${DAYS[cfg.post_day]} ${cfg.post_hour}:00 UTC`, inline: true },
          )],
        ephemeral: true,
      });
    }

    if (sub === 'report') {
      if (!await requireAdmin(interaction)) return;
      if (!cfg) return interaction.reply({ embeds: [error('Partner tracking not configured', 'Run `/partners setup partners_channel:#channel report_channel:#channel post_day:Monday post_hour:9`.')], ephemeral: true });
      const rows = getWeekCounts(gid);
      const medals = ['🥇', '🥈', '🥉'];
      const lines = rows.length
        ? rows.map((r, i) => `${medals[i] ?? `${i + 1}.`} <@${r.userId}> — **${r.count}** partner post${r.count === 1 ? '' : 's'}`)
        : ['No partner posts recorded this week.'];
      const ch = interaction.guild?.channels.cache.get(cfg.report_channel);
      if (ch && ch.isTextBased()) {
        await ch.send({
          embeds: [new EmbedBuilder()
            .setTitle('🤝 Partner Activity (Manual Report)')
            .setColor('#ff6b35')
            .setDescription(lines.join('\n'))
            .setTimestamp()],
        }).catch(() => {});
      }
      return interaction.reply({ embeds: [success('Report posted', `Sent to <#${cfg.report_channel}>.`)], ephemeral: true });
    }

    if (sub === 'reset') {
      if (!await requireAdmin(interaction)) return;
      if (!cfg) return interaction.reply({ embeds: [error('Partner tracking not configured', 'Run `/partners setup partners_channel:#channel report_channel:#channel post_day:Monday post_hour:9`.')], ephemeral: true });
      resetWeekCounts(gid);
      return interaction.reply({ embeds: [success('Counts reset', 'This week\'s partner counts have been cleared.')], ephemeral: true });
    }
  },
};
