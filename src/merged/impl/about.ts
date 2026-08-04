/**
 * /about — Bot info, stats, invite link — fully translated
 */
import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
} from 'discord.js';
import { getGuild } from '../../database/db';
import { getLocalized, Language } from '../../utils/localization';
import { BotClient } from '../../utils/types';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require('../../../package.json') as { version: string };

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m ${s % 60}s`;
}

export default {
  data: new SlashCommandBuilder()
    .setName('about')
    .setDescription('About MultiBotV2 — features, stats & invite link'),

  async execute(ix: ChatInputCommandInteraction) {
    const lang = (getGuild(ix.guildId!)?.language || 'en') as Language;
    const t = (k: string, v?: Record<string, string>) => getLocalized(k, lang, v);
    const client = ix.client;

    const guildCount   = client.guilds.cache.size;
    const userCount    = client.guilds.cache.reduce((acc, g) => acc + (g.memberCount || 0), 0);
    // Read from the live command collection instead of a hand-maintained
    // number — that hardcoded value (80 + 19 games = 99) had already drifted
    // from the real, deployed count (86) by the time this got noticed.
    const commandCount = (client as BotClient).commands?.size || client.application?.commands.cache.size || 86;
    const uptime       = formatUptime(process.uptime() * 1000);
    const ping         = Math.round(client.ws.ping);

    const embed = new EmbedBuilder()
      .setTitle(t('about.title'))
      .setColor('#5865f2')
      .setThumbnail(client.user?.displayAvatarURL({ size: 256 }) ?? null)
      .setDescription(
        `${t('about.desc')}\n\n` +
        `${t('about.free')}`,
      )
      .addFields(
        {
          name: `📋 ${t('about.features')}`,
          value: [
            '🎫 Ticket System',
            '🛡️ Security Engine, Anti-Nuke, Anti-Raid, AutoMod, Ultra-Mode',
            '💰 Economy + Casino',
            '🎮 19 Games (Higher/Lower, Battleship, UNO, Yahtzee...)',
            '🎉 Party Games (Ghosts Against Discord, Memelord, Truth or Dare...)',
            '📢 Welcome, Giveaways, Polls',
            `🌍 ${t('about.language_en_only')}`,
          ].join('\n'),
          inline: false,
        },
        { name: `📊 ${t('about.servers')}`,  value: guildCount.toLocaleString(),  inline: true },
        { name: `👥 ${t('about.users')}`,    value: userCount.toLocaleString(),    inline: true },
        { name: `⚙️ ${t('about.commands')}`, value: `${commandCount}+`,            inline: true },
        { name: `⏱️ ${t('about.uptime')}`,   value: uptime,                        inline: true },
        { name: `🏓 ${t('about.ping')}`,     value: `${ping}ms`,                   inline: true },
        { name: `🛠️ ${t('about.tech')}`,     value: 'TypeScript · discord.js v14 · SQLite · chess.js', inline: true },
        { name: `📦 ${t('about.version')}`,  value: `v${pkg.version}`,             inline: true },
      )
      .setFooter({ text: 'MultiBotV2 • Free forever • No premium tier' })
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel(t('about.invite'))
        .setStyle(ButtonStyle.Link)
        .setURL('https://discord.com/oauth2/authorize?client_id=1498679223223844977&permissions=8&scope=bot+applications.commands')
        .setEmoji('➕'),
    );

    await ix.reply({ embeds: [embed], components: [row] });
  },
};
