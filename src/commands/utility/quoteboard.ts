import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits,
  MessageContextMenuCommandInteraction, ApplicationCommandType, ContextMenuCommandBuilder,
} from 'discord.js';
import db from '../../database/db';
import { requireAdmin } from '../../utils/guards';
import { success, error } from '../../utils/embeds';

function initTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS quoteboard_config (
      guild_id TEXT PRIMARY KEY, channel_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL, channel_id TEXT NOT NULL,
      author_id TEXT NOT NULL, pinned_by TEXT NOT NULL,
      content TEXT NOT NULL, jump_url TEXT,
      pinned_at INTEGER DEFAULT (unixepoch())
    );
  `);
}

export default {
  data: new SlashCommandBuilder()
    .setName('quoteboard')
    .setDescription('Manage the quote board')
    .addSubcommand(s => s.setName('setup').setDescription('[Admin] Set the quote board channel')
      .addChannelOption(o => o.setName('channel').setDescription('Quote board channel').setRequired(true)))
    .addSubcommand(s => s.setName('pin').setDescription('Pin a message as a quote')
      .addStringOption(o => o.setName('message_id').setDescription('Message ID to quote').setRequired(true))
      .addStringOption(o => o.setName('channel').setDescription('Channel ID where the message is (default: current)')))
    .addSubcommand(s => s.setName('list').setDescription('Show recent quotes'))
    .addSubcommand(s => s.setName('disable').setDescription('[Admin] Disable quote board')),

  async execute(ix: ChatInputCommandInteraction) {
    initTable();
    const sub = ix.options.getSubcommand();
    const guildId = ix.guildId!;

    if (sub === 'setup') {
      if (!await requireAdmin(ix)) return;
      const ch = ix.options.getChannel('channel', true);
      db.prepare('INSERT INTO quoteboard_config (guild_id, channel_id) VALUES (?,?) ON CONFLICT(guild_id) DO UPDATE SET channel_id=excluded.channel_id').run(guildId, ch.id);
      return ix.reply({ embeds: [success('Quote board set', `Quotes will be posted in <#${ch.id}>`)] });
    }

    if (sub === 'disable') {
      if (!await requireAdmin(ix)) return;
      db.prepare('DELETE FROM quoteboard_config WHERE guild_id=?').run(guildId);
      return ix.reply({ embeds: [success('Quote board disabled')] });
    }

    if (sub === 'pin') {
      const cfg = db.prepare('SELECT * FROM quoteboard_config WHERE guild_id=?').get(guildId) as any;
      if (!cfg) return ix.reply({ embeds: [error('Quoteboard not set up', 'An admin needs to run `/quoteboard setup channel:#channel` to enable the quoteboard.')], ephemeral: true });

      const msgId = ix.options.getString('message_id', true);
      const chId = ix.options.getString('channel') ?? ix.channelId;
      const ch = await ix.guild?.channels.fetch(chId).catch(() => null);
      if (!ch?.isTextBased()) return ix.reply({ embeds: [error('Channel not found')], ephemeral: true });

      const targetMsg = await (ch as any).messages.fetch(msgId).catch(() => null);
      if (!targetMsg) return ix.reply({ embeds: [error('Message not found')], ephemeral: true });
      if (!targetMsg.content && targetMsg.embeds.length === 0)
        return ix.reply({ embeds: [error('Message has no text content')], ephemeral: true });

      const content = targetMsg.content || '[Embed message]';

      db.prepare('INSERT INTO quotes (guild_id, channel_id, author_id, pinned_by, content, jump_url) VALUES (?,?,?,?,?,?)')
        .run(guildId, cfg.channel_id, targetMsg.author.id, ix.user.id, content, targetMsg.url);

      const boardChannel = await ix.guild?.channels.fetch(cfg.channel_id).catch(() => null);
      if (boardChannel?.isTextBased()) {
        const embed = new EmbedBuilder()
          .setColor('#faa61a')
          .setTitle('💬 Quote')
          .setDescription(`"${content}"`)
          .addFields(
            { name: 'Author', value: `<@${targetMsg.author.id}>`, inline: true },
            { name: 'Pinned by', value: `<@${ix.user.id}>`, inline: true },
          )
          .setTimestamp()
          .setFooter({ text: `#${(ch as any).name ?? 'unknown'}` });
        if (targetMsg.url) embed.setURL(targetMsg.url);
        await (boardChannel as any).send({ embeds: [embed] });
      }

      return ix.reply({ embeds: [success('Quote pinned!', `Posted in <#${cfg.channel_id}>`)] });
    }

    if (sub === 'list') {
      const quotes = db.prepare('SELECT * FROM quotes WHERE guild_id=? ORDER BY pinned_at DESC LIMIT 10').all(guildId) as any[];
      if (!quotes.length) return ix.reply({ embeds: [new EmbedBuilder().setTitle('💬 Quote Board').setDescription('No quotes yet.')], ephemeral: true });
      const embed = new EmbedBuilder().setTitle('💬 Recent Quotes').setColor('#faa61a')
        .setDescription(quotes.map((q, i) => `**${i + 1}.** *"${q.content.slice(0, 100)}${q.content.length > 100 ? '…' : ''}"*\n— <@${q.author_id}> | pinned by <@${q.pinned_by}>`).join('\n\n'));
      return ix.reply({ embeds: [embed] });
    }
  },
};
