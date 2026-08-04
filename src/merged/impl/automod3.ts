/**
 * /automod3 — Erweiterte AutoMod-Features (Runde 3).
 *
 * Features:
 *   - Punishment Profiles: 1./2./3rd violation = X
 *   - Regex-Filter
 *   - Spam-Threshold (Nachrichten pro Sekunde)
 *   - Anti-Mass-Ping
 *   - Phishing-Link-Filter
 *   - Anti-mass-DM (flags users sending many DMs)
 */

import {
  SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';
import { requireAdmin } from '../../utils/guards';
import { success, error, info } from '../../utils/embeds';
import db from '../../database/db';

db.exec(`
  CREATE TABLE IF NOT EXISTS automod3_config (
    guild_id              TEXT PRIMARY KEY,
    punishment_profile    TEXT DEFAULT '{"1":"warn","2":"timeout_1h","3":"ban"}',
    regex_filters         TEXT DEFAULT '[]',
    spam_threshold        INTEGER DEFAULT 5,
    spam_window_seconds   INTEGER DEFAULT 3,
    anti_mass_ping        INTEGER DEFAULT 0,
    mass_ping_limit       INTEGER DEFAULT 5,
    phishing_filter       INTEGER DEFAULT 0,
    anti_mass_dm          INTEGER DEFAULT 0
  );
`);

export interface Automod3Config {
  guild_id: string;
  punishment_profile: string;
  regex_filters: string;
  spam_threshold: number;
  spam_window_seconds: number;
  anti_mass_ping: number;
  mass_ping_limit: number;
  phishing_filter: number;
  anti_mass_dm: number;
}

export function getAutomod3Config(guildId: string): Automod3Config {
  let row = db.prepare('SELECT * FROM automod3_config WHERE guild_id = ?').get(guildId) as Automod3Config | undefined;
  if (!row) {
    db.prepare('INSERT INTO automod3_config (guild_id) VALUES (?)').run(guildId);
    row = db.prepare('SELECT * FROM automod3_config WHERE guild_id = ?').get(guildId) as Automod3Config;
  }
  return row;
}

function updateConfig(guildId: string, patch: Partial<Automod3Config>) {
  getAutomod3Config(guildId);
  const keys = Object.keys(patch).filter(k => k !== 'guild_id');
  if (keys.length === 0) return;
  const sets = keys.map(k => `${k} = ?`).join(', ');
  const vals = keys.map(k => (patch as Record<string, unknown>)[k] ?? null);
  db.prepare(`UPDATE automod3_config SET ${sets} WHERE guild_id = ?`).run(...vals, guildId);
}

export default {
  data: new SlashCommandBuilder()
    .setName('automod3')
    .setDescription('Advanced AutoMod features: regex filters, punishment profiles, spam, phishing')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)

    .addSubcommand(s => s.setName('punishment').setDescription('Set punishment profile')
      .addStringOption(o => o.setName('first').setDescription('1st violation')
        .setRequired(true)
        .addChoices(
          { name: 'Delete only', value: 'delete' },
          { name: 'Warning', value: 'warn' },
          { name: '10min Timeout', value: 'timeout_10m' },
          { name: '1h Timeout', value: 'timeout_1h' },
          { name: 'Kick', value: 'kick' },
        ))
      .addStringOption(o => o.setName('second').setDescription('2nd violation')
        .setRequired(true)
        .addChoices(
          { name: 'Delete only', value: 'delete' },
          { name: 'Warning', value: 'warn' },
          { name: '10min Timeout', value: 'timeout_10m' },
          { name: '1h Timeout', value: 'timeout_1h' },
          { name: 'Kick', value: 'kick' },
          { name: 'Ban', value: 'ban' },
        ))
      .addStringOption(o => o.setName('third').setDescription('3rd violation')
        .setRequired(true)
        .addChoices(
          { name: '1h Timeout', value: 'timeout_1h' },
          { name: '24h Timeout', value: 'timeout_24h' },
          { name: 'Kick', value: 'kick' },
          { name: 'Ban', value: 'ban' },
        )))

    .addSubcommand(s => s.setName('regex-add').setDescription('Add a regex filter (blocks patterns like W_0_R_T)')
      .addStringOption(o => o.setName('pattern').setDescription('Regular expression (without //)').setRequired(true))
      .addStringOption(o => o.setName('name').setDescription('Name/description for this filter').setRequired(true)))

    .addSubcommand(s => s.setName('regex-list').setDescription('Show active regex filters'))

    .addSubcommand(s => s.setName('regex-remove').setDescription('Remove a regex filter')
      .addIntegerOption(o => o.setName('index').setDescription('Index from /automod3 regex-list').setRequired(true)))

    .addSubcommand(s => s.setName('spam').setDescription('Configure spam threshold')
      .addIntegerOption(o => o.setName('messages').setDescription('Max messages in time window (default: 5)')
        .setMinValue(2).setMaxValue(30).setRequired(true))
      .addIntegerOption(o => o.setName('seconds').setDescription('Time window in seconds (default: 3)')
        .setMinValue(1).setMaxValue(10)))

    .addSubcommand(s => s.setName('masspings').setDescription('Configure anti-mass-ping')
      .addBooleanOption(o => o.setName('enabled').setDescription('On/Off').setRequired(true))
      .addIntegerOption(o => o.setName('limit').setDescription('Max mentions per message (default: 5)')
        .setMinValue(2).setMaxValue(20)))

    .addSubcommand(s => s.setName('phishing').setDescription('Enable phishing link filter')
      .addBooleanOption(o => o.setName('enabled').setDescription('On/Off').setRequired(true)))

    .addSubcommand(s => s.setName('massdm').setDescription('Enable anti-mass-DM protection')
      .addBooleanOption(o => o.setName('enabled').setDescription('On/Off').setRequired(true)))

    .addSubcommand(s => s.setName('status').setDescription('Show current configuration')),

  async execute(ix: ChatInputCommandInteraction) {
    if (!await requireAdmin(ix)) return;
    const sub = ix.options.getSubcommand();
    const gid = ix.guildId!;

    if (sub === 'punishment') {
      const profile = {
        '1': ix.options.getString('first', true),
        '2': ix.options.getString('second', true),
        '3': ix.options.getString('third', true),
      };
      updateConfig(gid, { punishment_profile: JSON.stringify(profile) });
      return ix.reply({
        embeds: [success('⚖️ Punishment Profile Set',
          `**1st violation:** ${profile['1']}\n**2nd violation:** ${profile['2']}\n**3rd violation:** ${profile['3']}\n\n` +
          `*Applies to all AutoMod violations (BadWords, Caps, Spam, etc.)*`,
        )],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'regex-add') {
      const pattern = ix.options.getString('pattern', true);
      const name = ix.options.getString('name', true);
      // Validate regex
      try { new RegExp(pattern, 'i'); } catch {
        return ix.reply({ embeds: [error('Invalid Regex', `The pattern \`${pattern}\` is not a valid regular expression.`)], flags: MessageFlags.Ephemeral });
      }
      const config = getAutomod3Config(gid);
      const filters = JSON.parse(config.regex_filters) as { pattern: string; name: string }[];
      if (filters.length >= 20) {
        return ix.reply({ embeds: [error('Limit reached', 'Maximum 20 regex filters allowed.')], flags: MessageFlags.Ephemeral });
      }
      filters.push({ pattern, name });
      updateConfig(gid, { regex_filters: JSON.stringify(filters) });
      return ix.reply({
        embeds: [success('✅ Regex filter added', `**Name:** ${name}\n**Pattern:** \`${pattern}\``)],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'regex-list') {
      const config = getAutomod3Config(gid);
      const filters = JSON.parse(config.regex_filters) as { pattern: string; name: string }[];
      if (filters.length === 0) {
        return ix.reply({ embeds: [info('Regex Filters', 'No regex filters configured.')], flags: MessageFlags.Ephemeral });
      }
      return ix.reply({
        embeds: [success('🔍 Active Regex Filters',
          filters.map((f, i) => `**${i + 1}.** ${f.name}: \`${f.pattern}\``).join('\n'),
        )],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'regex-remove') {
      const idx = ix.options.getInteger('index', true) - 1;
      const config = getAutomod3Config(gid);
      const filters = JSON.parse(config.regex_filters) as { pattern: string; name: string }[];
      if (idx < 0 || idx >= filters.length) {
        return ix.reply({ embeds: [error('Error', 'Invalid index.')], flags: MessageFlags.Ephemeral });
      }
      const removed = filters.splice(idx, 1)[0];
      updateConfig(gid, { regex_filters: JSON.stringify(filters) });
      return ix.reply({ embeds: [success('🗑️ Filter removed', `**${removed.name}** (\`${removed.pattern}\`) was removed.`)], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'spam') {
      const messages = ix.options.getInteger('messages', true);
      const seconds = ix.options.getInteger('seconds') ?? 3;
      updateConfig(gid, { spam_threshold: messages, spam_window_seconds: seconds });
      return ix.reply({
        embeds: [success('📊 Spam Threshold Set', `Max. **${messages}** messages in **${seconds}** seconds per user.`)],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'masspings') {
      const enabled = ix.options.getBoolean('enabled', true);
      const limit = ix.options.getInteger('limit') ?? 5;
      updateConfig(gid, { anti_mass_ping: enabled ? 1 : 0, mass_ping_limit: limit });
      return ix.reply({
        embeds: [success(`Anti-Mass-Ping ${enabled ? '✅ Enabled' : '❌ Disabled'}`,
          enabled ? `Messages with more than **${limit}** mentions will be deleted.` : '',
        )],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'phishing') {
      const enabled = ix.options.getBoolean('enabled', true);
      updateConfig(gid, { phishing_filter: enabled ? 1 : 0 });
      return ix.reply({
        embeds: [success(`Phishing-Filter ${enabled ? '✅ Enabled' : '❌ Disabled'}`,
          enabled ? 'Known phishing/malware links are automatically removed.' : '',
        )],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'massdm') {
      const enabled = ix.options.getBoolean('enabled', true);
      updateConfig(gid, { anti_mass_dm: enabled ? 1 : 0 });
      return ix.reply({
        embeds: [success(`Anti-Mass-DM ${enabled ? '✅ Enabled' : '❌ Disabled'}`,
          enabled ? 'Users who send many DMs are automatically muted.' : '',
        )],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'status') {
      const config = getAutomod3Config(gid);
      const profile = JSON.parse(config.punishment_profile);
      const filters = JSON.parse(config.regex_filters) as { name: string }[];
      return ix.reply({
        embeds: [success('⚙️ AutoMod3 Status',
          [
            `**Punishment-Profil:** 1.=${profile['1']} | 2.=${profile['2']} | 3.=${profile['3']}`,
            `**Regex Filters:** ${filters.length} active`,
            `**Spam Limit:** ${config.spam_threshold} messages / ${config.spam_window_seconds}s`,
            `**Anti-Mass-Ping:** ${config.anti_mass_ping ? `✅ (max. ${config.mass_ping_limit} Mentions)` : '❌'}`,
            `**Phishing-Filter:** ${config.phishing_filter ? '✅' : '❌'}`,
            `**Anti-Mass-DM:** ${config.anti_mass_dm ? '✅' : '❌'}`,
          ].join('\n'),
        )],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
