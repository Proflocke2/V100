/**
 * /inactivitykick — Auto-kick members inactive for N days (opt-in via config).
 * Activity is tracked via messageCreate. Manual scan runs on demand or via scheduler.
 */
import {
  SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, EmbedBuilder,
} from 'discord.js';
import db from '../../database/db';
import { requireAdmin } from '../../utils/guards';
import { success, error } from '../../utils/embeds';
import { BotClient } from '../../utils/types';

function initTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS inactivity_config (
      guild_id TEXT PRIMARY KEY,
      enabled INTEGER DEFAULT 0,
      days INTEGER DEFAULT 30,
      exempt_roles TEXT DEFAULT '[]',
      log_channel TEXT
    );
    CREATE TABLE IF NOT EXISTS member_activity (
      guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
      last_active INTEGER DEFAULT (unixepoch()),
      PRIMARY KEY (guild_id, user_id)
    );
  `);
}

export function recordActivity(guildId: string, userId: string) {
  try {
    initTable();
    db.prepare('INSERT INTO member_activity (guild_id, user_id, last_active) VALUES (?,?,?) ON CONFLICT(guild_id,user_id) DO UPDATE SET last_active=excluded.last_active')
      .run(guildId, userId, Math.floor(Date.now() / 1000));
  } catch {}
}

export async function runInactivityKick(client: BotClient) {
  initTable();
  const configs = db.prepare('SELECT * FROM inactivity_config WHERE enabled=1').all() as any[];
  for (const cfg of configs) {
    const thresholdSec = Math.floor(Date.now() / 1000) - cfg.days * 86400;
    const exemptRoles: string[] = JSON.parse(cfg.exempt_roles);
    const inactive = db.prepare('SELECT user_id FROM member_activity WHERE guild_id=? AND last_active < ?')
      .all(cfg.guild_id, thresholdSec) as any[];

    const guild = client.guilds.cache.get(cfg.guild_id);
    if (!guild) continue;

    let kicked = 0;
    for (const row of inactive) {
      const member = await guild.members.fetch(row.user_id).catch(() => null);
      if (!member) continue;
      if (member.permissions.has(PermissionFlagsBits.ManageMessages)) continue;
      if (exemptRoles.some(r => member.roles.cache.has(r))) continue;
      await member.kick(`Inactivity kick: no activity in ${cfg.days} days`).catch(() => {});
      kicked++;
    }

    if (kicked > 0 && cfg.log_channel) {
      const ch = guild.channels.cache.get(cfg.log_channel);
      if (ch?.isTextBased()) {
        await (ch as any).send({ embeds: [new EmbedBuilder().setTitle('🦵 Inactivity Kick').setColor('#ed4245')
          .setDescription(`Kicked **${kicked}** member(s) inactive for ${cfg.days}+ days.`).setTimestamp()] });
      }
    }
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName('inactivitykick')
    .setDescription('Configure automatic inactivity kicks')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName('enable').setDescription('Enable inactivity kick')
      .addIntegerOption(o => o.setName('days').setDescription('Days of inactivity before kick').setRequired(true).setMinValue(7).setMaxValue(365))
      .addChannelOption(o => o.setName('log_channel').setDescription('Channel for kick logs')))
    .addSubcommand(s => s.setName('disable').setDescription('Disable inactivity kick'))
    .addSubcommand(s => s.setName('exempt').setDescription('Exempt a role from inactivity kick')
      .addRoleOption(o => o.setName('role').setDescription('Role to exempt').setRequired(true)))
    .addSubcommand(s => s.setName('run').setDescription('Manually trigger inactivity kick scan'))
    .addSubcommand(s => s.setName('status').setDescription('View current config')),

  async execute(ix: ChatInputCommandInteraction) {
    if (!await requireAdmin(ix)) return;
    initTable();
    const sub = ix.options.getSubcommand();
    const guildId = ix.guildId!;

    if (sub === 'enable') {
      const days = ix.options.getInteger('days', true);
      const logCh = ix.options.getChannel('log_channel');
      db.prepare('INSERT INTO inactivity_config (guild_id, enabled, days, log_channel) VALUES (?,1,?,?) ON CONFLICT(guild_id) DO UPDATE SET enabled=1, days=excluded.days, log_channel=COALESCE(excluded.log_channel, log_channel)')
        .run(guildId, days, logCh?.id ?? null);
      return ix.reply({ embeds: [success('Inactivity kick enabled', `Members inactive for **${days} days** will be kicked.${logCh ? `\nLog: <#${logCh.id}>` : ''}`)] });
    }

    if (sub === 'disable') {
      db.prepare('UPDATE inactivity_config SET enabled=0 WHERE guild_id=?').run(guildId);
      return ix.reply({ embeds: [success('Inactivity kick disabled')] });
    }

    if (sub === 'exempt') {
      const role = ix.options.getRole('role', true);
      let cfg = db.prepare('SELECT * FROM inactivity_config WHERE guild_id=?').get(guildId) as any;
      if (!cfg) { db.prepare('INSERT OR IGNORE INTO inactivity_config (guild_id) VALUES (?)').run(guildId); cfg = db.prepare('SELECT * FROM inactivity_config WHERE guild_id=?').get(guildId); }
      const exempt: string[] = JSON.parse(cfg.exempt_roles);
      if (!exempt.includes(role.id)) exempt.push(role.id);
      db.prepare('UPDATE inactivity_config SET exempt_roles=? WHERE guild_id=?').run(JSON.stringify(exempt), guildId);
      return ix.reply({ embeds: [success('Role exempted', `<@&${role.id}> is now exempt from inactivity kicks.`)] });
    }

    if (sub === 'status') {
      const cfg = db.prepare('SELECT * FROM inactivity_config WHERE guild_id=?').get(guildId) as any;
      if (!cfg) return ix.reply({ embeds: [new EmbedBuilder().setTitle('Inactivity Kick').setDescription('Not configured. Use `/inactivitykick enable`.')] });
      const exempt: string[] = JSON.parse(cfg.exempt_roles);
      return ix.reply({ embeds: [new EmbedBuilder().setTitle('🦵 Inactivity Kick Config').setColor('#5865f2')
        .addFields(
          { name: 'Status', value: cfg.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
          { name: 'Threshold', value: `${cfg.days} days`, inline: true },
          { name: 'Log Channel', value: cfg.log_channel ? `<#${cfg.log_channel}>` : 'None', inline: true },
          { name: 'Exempt Roles', value: exempt.length ? exempt.map((r: string) => `<@&${r}>`).join(', ') : 'None' },
        )] });
    }

    if (sub === 'run') {
      await ix.deferReply({ ephemeral: true });
      await runInactivityKick(ix.client as BotClient);
      return ix.editReply({ embeds: [success('Scan complete', 'Inactivity kick scan finished.')] });
    }
  },
};
