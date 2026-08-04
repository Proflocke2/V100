/**
 * /warnconfig — Configure warn escalation thresholds per guild.
 * Extends the existing warn system with configurable thresholds.
 */
import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import db from '../../database/db';
import { requireAdmin } from '../../utils/guards';
import { success, error } from '../../utils/embeds';

function initTable() {
  db.exec(`CREATE TABLE IF NOT EXISTS warn_config (
    guild_id TEXT PRIMARY KEY,
    mute_threshold INTEGER DEFAULT 3,
    mute_duration_minutes INTEGER DEFAULT 60,
    ban_threshold INTEGER DEFAULT 5,
    kick_threshold INTEGER DEFAULT 0
  )`);
}

function getConfig(guildId: string) {
  initTable();
  let row = db.prepare('SELECT * FROM warn_config WHERE guild_id=?').get(guildId) as any;
  if (!row) {
    db.prepare('INSERT OR IGNORE INTO warn_config (guild_id) VALUES (?)').run(guildId);
    row = db.prepare('SELECT * FROM warn_config WHERE guild_id=?').get(guildId);
  }
  return row;
}

export { getConfig as getWarnConfig };

export default {
  data: new SlashCommandBuilder()
    .setName('warnconfig')
    .setDescription('Configure warn escalation thresholds')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName('view').setDescription('View current escalation config'))
    .addSubcommand(s => s.setName('set').setDescription('Set escalation thresholds')
      .addIntegerOption(o => o.setName('mute_at').setDescription('Warn count to trigger mute (0 = off)').setMinValue(0))
      .addIntegerOption(o => o.setName('mute_minutes').setDescription('Mute duration in minutes').setMinValue(1))
      .addIntegerOption(o => o.setName('kick_at').setDescription('Warn count to trigger kick (0 = off)').setMinValue(0))
      .addIntegerOption(o => o.setName('ban_at').setDescription('Warn count to trigger ban (0 = off)').setMinValue(0))),

  async execute(ix: ChatInputCommandInteraction) {
    if (!await requireAdmin(ix)) return;
    const sub = ix.options.getSubcommand();
    const guildId = ix.guildId!;

    if (sub === 'view') {
      const c = getConfig(guildId);
      return ix.reply({ embeds: [new EmbedBuilder().setTitle('⚙️ Warn Escalation Config').setColor('#fee75c')
        .addFields(
          { name: 'Mute at', value: c.mute_threshold === 0 ? 'Disabled' : `${c.mute_threshold} warns`, inline: true },
          { name: 'Mute Duration', value: `${c.mute_duration_minutes} min`, inline: true },
          { name: 'Kick at', value: c.kick_threshold === 0 ? 'Disabled' : `${c.kick_threshold} warns`, inline: true },
          { name: 'Ban at', value: c.ban_threshold === 0 ? 'Disabled' : `${c.ban_threshold} warns`, inline: true },
        )
        .setFooter({ text: 'Use /warnconfig set to change thresholds' })] });
    }

    if (sub === 'set') {
      const mute = ix.options.getInteger('mute_at');
      const muteMin = ix.options.getInteger('mute_minutes');
      const kick = ix.options.getInteger('kick_at');
      const ban = ix.options.getInteger('ban_at');
      getConfig(guildId); // ensure row exists
      if (mute !== null) db.prepare('UPDATE warn_config SET mute_threshold=? WHERE guild_id=?').run(mute, guildId);
      if (muteMin !== null) db.prepare('UPDATE warn_config SET mute_duration_minutes=? WHERE guild_id=?').run(muteMin, guildId);
      if (kick !== null) db.prepare('UPDATE warn_config SET kick_threshold=? WHERE guild_id=?').run(kick, guildId);
      if (ban !== null) db.prepare('UPDATE warn_config SET ban_threshold=? WHERE guild_id=?').run(ban, guildId);
      const c = getConfig(guildId);
      return ix.reply({ embeds: [success('Config updated', `Mute at ${c.mute_threshold || 'off'} warns (${c.mute_duration_minutes}min) | Kick at ${c.kick_threshold || 'off'} | Ban at ${c.ban_threshold || 'off'}`)] });
    }
  },
};
