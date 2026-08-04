/**
 * /userslow — Per-user slowmode. Intercepts messages from a specific user
 * and deletes them if sent too fast, without affecting the channel.
 * State stored in DB; enforcement in messageCreate event.
 */
import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, GuildMember } from 'discord.js';
import db from '../../database/db';
import { requireModerator } from '../../utils/guards';
import { success, error } from '../../utils/embeds';

function initTable() {
  db.exec(`CREATE TABLE IF NOT EXISTS user_slowmode (
    guild_id TEXT NOT NULL, user_id TEXT NOT NULL, channel_id TEXT NOT NULL,
    cooldown_seconds INTEGER NOT NULL, last_message INTEGER DEFAULT 0,
    moderator_id TEXT, set_at INTEGER DEFAULT (unixepoch()),
    PRIMARY KEY (guild_id, user_id, channel_id)
  )`);
}

export default {
  data: new SlashCommandBuilder()
    .setName('userslow')
    .setDescription('Apply per-user slowmode in a channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand(s => s.setName('set').setDescription('Set per-user slowmode')
      .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
      .addIntegerOption(o => o.setName('seconds').setDescription('Cooldown in seconds (0 = remove)').setRequired(true).setMinValue(0).setMaxValue(86400))
      .addChannelOption(o => o.setName('channel').setDescription('Channel (default: current)')))
    .addSubcommand(s => s.setName('list').setDescription('List active per-user slowmodes'))
    .addSubcommand(s => s.setName('remove').setDescription('Remove per-user slowmode')
      .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
      .addChannelOption(o => o.setName('channel').setDescription('Channel (default: current)'))),

  async execute(ix: ChatInputCommandInteraction) {
    if (!await requireModerator(ix)) return;
    initTable();
    const sub = ix.options.getSubcommand();
    const guildId = ix.guildId!;

    if (sub === 'set') {
      const target = ix.options.getMember('user') as GuildMember | null;
      const seconds = ix.options.getInteger('seconds', true);
      const channel = ix.options.getChannel('channel') ?? ix.channel;
      if (!target || !channel) return ix.reply({ embeds: [error('Invalid input')], ephemeral: true });

      if (seconds === 0) {
        db.prepare('DELETE FROM user_slowmode WHERE guild_id=? AND user_id=? AND channel_id=?').run(guildId, target.id, channel.id);
        return ix.reply({ embeds: [success('Slowmode removed', `<@${target.id}> in <#${channel.id}>`)] });
      }

      db.prepare(`INSERT INTO user_slowmode (guild_id, user_id, channel_id, cooldown_seconds, moderator_id) VALUES (?,?,?,?,?)
        ON CONFLICT(guild_id, user_id, channel_id) DO UPDATE SET cooldown_seconds=excluded.cooldown_seconds, moderator_id=excluded.moderator_id`)
        .run(guildId, target.id, channel.id, seconds, ix.user.id);
      return ix.reply({ embeds: [success('Per-user slowmode set', `<@${target.id}> in <#${channel.id}> — **${seconds}s** cooldown`)] });
    }

    if (sub === 'list') {
      const rows = db.prepare('SELECT * FROM user_slowmode WHERE guild_id=?').all(guildId) as any[];
      if (!rows.length) return ix.reply({ embeds: [success('No active user slowmodes')] });
      const lines = rows.map(r => `<@${r.user_id}> in <#${r.channel_id}> — ${r.cooldown_seconds}s`);
      return ix.reply({ embeds: [{ title: '🐢 User Slowmodes', description: lines.join('\n'), color: 0x5865f2 } as any] });
    }

    if (sub === 'remove') {
      const target = ix.options.getMember('user') as GuildMember | null;
      const channel = ix.options.getChannel('channel') ?? ix.channel;
      if (!target || !channel) return ix.reply({ embeds: [error('Invalid input')], ephemeral: true });
      db.prepare('DELETE FROM user_slowmode WHERE guild_id=? AND user_id=? AND channel_id=?').run(guildId, target.id, channel.id);
      return ix.reply({ embeds: [success('Slowmode removed', `<@${target.id}> in <#${channel.id}>`)] });
    }
  },
};
