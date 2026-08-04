import { requirePermission } from '../../utils/guards';
/**
 * /backup — versioned snapshot management.
 *
 * Subcommands: create, list, restore, delete, export, import, migrate
 */

import {
  SlashCommandBuilder, ChatInputCommandInteraction, AttachmentBuilder,
  PermissionFlagsBits, EmbedBuilder, MessageFlags, ChannelType,
} from 'discord.js';
import { success, error, info } from '../../utils/embeds';
import { tGuild } from '../../i18n';
import * as Service from '../../modules/backup/service';
import * as Repo from '../../modules/backup/repository';
import { runMigrations, currentVersion, latestKnownVersion } from '../../modules/backup/migrations';
import { readFileSync } from 'fs';
import { setGuildValue } from '../../database/db';

export default {
  data: new SlashCommandBuilder()
    .setName('bot-backup').setDescription('Versioned configuration snapshots')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

    .addSubcommand(s => s.setName('create').setDescription('Create a new snapshot of all server configs'))
    .addSubcommand(s => s.setName('list').setDescription('List snapshots for this server'))

    .addSubcommand(s => s.setName('restore').setDescription('Restore a snapshot by version')
      .addStringOption(o => o.setName('version').setDescription('Snapshot version (see /backup list)').setRequired(true)))

    .addSubcommand(s => s.setName('delete').setDescription('Delete a snapshot record (file kept on disk)')
      .addStringOption(o => o.setName('version').setDescription('Snapshot version').setRequired(true)))

    .addSubcommand(s => s.setName('export').setDescription('Export a snapshot as JSON file')
      .addStringOption(o => o.setName('version').setDescription('Snapshot version').setRequired(true)))

    .addSubcommand(s => s.setName('import').setDescription('Import a snapshot JSON file')
      .addAttachmentOption(o => o.setName('file').setDescription('A previously exported snapshot JSON').setRequired(true)))

    .addSubcommand(s => s.setName('migrate').setDescription('Run pending schema migrations'))

    .addSubcommand(s => s.setName('auto-enable').setDescription('Turn on automatic backups')
      .addStringOption(o => o.setName('interval').setDescription('How often to back up').setRequired(true)
        .addChoices(
          { name: 'Every 15 minutes', value: '15' },
          { name: 'Every 30 minutes', value: '30' },
          { name: 'Every hour',       value: '60' },
          { name: 'Every 6 hours',    value: '360' },
          { name: 'Daily',            value: '1440' },
          { name: 'Weekly',           value: '10080' },
        ))
      // NOTE: All required options MUST come before any optional ones —
      // Discord's server-side validation rejects the entire bulk command
      // registration otherwise (APPLICATION_COMMAND_OPTIONS_REQUIRED_INVALID),
      // which silently left every guild on its old command set. discord.js
      // does NOT catch this locally.
      .addStringOption(o => o.setName('delivery').setDescription('Where the backup file goes').setRequired(true)
        .addChoices({ name: 'Post in a channel', value: 'channel' }, { name: 'Send as a DM (download locally)', value: 'dm' }))
      .addIntegerOption(o => o.setName('custom_minutes').setDescription('Custom interval in minutes — overrides the choice above (min. 15)').setMinValue(15).setMaxValue(43200))
      .addChannelOption(o => o.setName('channel').setDescription('Channel to post in (required if delivery = channel) — file is ready to download, no export needed')
        .addChannelTypes(ChannelType.GuildText))
      .addUserOption(o => o.setName('recipient').setDescription('Who gets the DM (required if delivery = dm, default: you)')))

    .addSubcommand(s => s.setName('auto-disable').setDescription('Turn off automatic backups'))

    .addSubcommand(s => s.setName('auto-status').setDescription('Show the current automatic-backup settings')),

  async execute(ix: ChatInputCommandInteraction) {
    if (!await requirePermission(ix, PermissionFlagsBits.Administrator)) return;
    const sub = ix.options.getSubcommand();
    const gid = ix.guildId!;
    await ix.deferReply({ flags: MessageFlags.Ephemeral });

    if (sub === 'create') {
      try {
        const r = Service.createSnapshot(gid);
        return ix.editReply({
          embeds: [success(
            tGuild(gid, 'backup.create.created'),
            tGuild(gid, 'backup.create.details', {
              version: r.version, tables: r.tables, rows: r.rows, file: r.file,
            }),
          )],
        });
      } catch (e) {
        return ix.editReply({
          embeds: [error(tGuild(gid, 'backup.create.failed', { reason: errMsg(e) }))],
        });
      }
    }

    if (sub === 'list') {
      const rows = Repo.listForGuild(gid);
      if (rows.length === 0) {
        return ix.editReply({ embeds: [info(tGuild(gid, 'backup.list.title'), tGuild(gid, 'backup.list.empty'))] });
      }
      const e = new EmbedBuilder().setTitle(tGuild(gid, 'backup.list.title')).setColor('#5865f2');
      for (const r of rows.slice(0, 20)) {
        e.addFields({
          name: `\`${r.version}\``,
          value: tGuild(gid, 'backup.list.row', {
            version: r.version,
            created: `<t:${r.created_at}:R>`,
            rows: r.rows,
          }),
        });
      }
      return ix.editReply({ embeds: [e] });
    }

    if (sub === 'restore') {
      const version = ix.options.getString('version', true);
      const meta = Repo.getByVersion(gid, version);
      if (!meta) return ix.editReply({ embeds: [error(tGuild(gid, 'backup.restore.not_found', { version }))] });
      try {
        const r = Service.restoreSnapshot(gid, version);
        return ix.editReply({
          embeds: [success(tGuild(gid, 'backup.restore.done', { rows: r.rows, failed: r.failed }))],
        });
      } catch (e) {
        return ix.editReply({ embeds: [error(tGuild(gid, 'backup.restore.failed', { reason: errMsg(e) }))] });
      }
    }

    if (sub === 'delete') {
      const version = ix.options.getString('version', true);
      const meta = Repo.getByVersion(gid, version);
      if (!meta) return ix.editReply({ embeds: [error(tGuild(gid, 'backup.delete.not_found'))] });
      Service.deleteSnapshot(gid, version);
      return ix.editReply({ embeds: [success(tGuild(gid, 'backup.delete.ok', { version }))] });
    }

    if (sub === 'export') {
      const version = ix.options.getString('version', true);
      const meta = Repo.getByVersion(gid, version);
      if (!meta) return ix.editReply({ embeds: [error(tGuild(gid, 'backup.restore.not_found', { version }))] });
      const buf = Buffer.from(readFileSync(meta.file_path));
      const att = new AttachmentBuilder(buf, { name: `snapshot-${gid}-${version}.json` });
      const e = new EmbedBuilder()
        .setTitle(tGuild(gid, 'backup.export.title'))
        .setDescription(`\`${version}\` • ${meta.rows} rows`)
        .setColor('#5865f2')
        .setFooter({ text: tGuild(gid, 'backup.export.footer') });
      return ix.editReply({ embeds: [e], files: [att] });
    }

    if (sub === 'import') {
      const att = ix.options.getAttachment('file', true);
      if (!att.name?.endsWith('.json')) {
        return ix.editReply({ embeds: [error(tGuild(gid, 'backup.import.invalid'))] });
      }
      try {
        const text = await fetch(att.url).then(r => r.text());
        const r = Service.importSnapshotJson(gid, text);
        return ix.editReply({
          embeds: [success(tGuild(gid, 'backup.import.ok', { version: r.version, rows: r.rows }))],
        });
      } catch (e) {
        const m = errMsg(e);
        if (m === 'wrong-guild') {
          return ix.editReply({ embeds: [error(tGuild(gid, 'backup.import.wrong_guild', { guild: '?' }))] });
        }
        return ix.editReply({ embeds: [error(tGuild(gid, 'backup.import.invalid'))] });
      }
    }

    if (sub === 'migrate') {
      try {
        const before = currentVersion();
        const r = runMigrations();
        const after  = currentVersion();
        if (r.applied.length === 0) {
          return ix.editReply({ embeds: [success(tGuild(gid, 'backup.migrate.up_to_date', { version: after }))] });
        }
        return ix.editReply({
          embeds: [success(tGuild(gid, 'backup.migrate.done', { to: after }), `Applied: ${r.applied.join(', ')}`)],
        });
      } catch (e) {
        return ix.editReply({ embeds: [error(tGuild(gid, 'backup.migrate.failed', { version: latestKnownVersion(), reason: errMsg(e) }))] });
      }
    }

    if (sub === 'auto-enable') {
      const intervalChoice  = ix.options.getString('interval', true);
      const customMinutes   = ix.options.getInteger('custom_minutes');
      const intervalMinutes = Math.max(15, customMinutes ?? parseInt(intervalChoice, 10));
      const delivery  = ix.options.getString('delivery', true) as 'channel' | 'dm';
      const channel   = ix.options.getChannel('channel');
      const recipient = ix.options.getUser('recipient');

      if (delivery === 'channel' && !channel) {
        return ix.editReply({ embeds: [error(tGuild(gid, 'backup.auto.missing_channel'))] });
      }

      setGuildValue(gid, 'backup_auto_enabled', 1);
      setGuildValue(gid, 'backup_auto_interval_minutes', intervalMinutes);
      setGuildValue(gid, 'backup_auto_delivery', delivery);
      if (delivery === 'channel') setGuildValue(gid, 'backup_auto_channel', channel!.id);
      if (delivery === 'dm')      setGuildValue(gid, 'backup_auto_recipient', (recipient ?? ix.user).id);

      const target = delivery === 'channel' ? `<#${channel!.id}>` : `<@${(recipient ?? ix.user).id}>`;
      return ix.editReply({
        embeds: [success(tGuild(gid, 'backup.auto.enabled', { interval: formatInterval(intervalMinutes), delivery, target }))],
      });
    }

    if (sub === 'auto-disable') {
      setGuildValue(gid, 'backup_auto_enabled', 0);
      return ix.editReply({ embeds: [success(tGuild(gid, 'backup.auto.disabled'))] });
    }

    if (sub === 'auto-status') {
      const cfg = Repo.getAutoBackupConfig(gid);
      if (!cfg.enabled) {
        return ix.editReply({ embeds: [info(tGuild(gid, 'backup.auto.status_title'), tGuild(gid, 'backup.auto.status_off'))] });
      }
      const target = cfg.delivery === 'channel'
        ? (cfg.channel ? `<#${cfg.channel}>` : '*(not set)*')
        : (cfg.recipient ? `<@${cfg.recipient}>` : '*(not set)*');
      const last = cfg.lastRunTs ? `<t:${cfg.lastRunTs}:R>` : 'never yet';
      return ix.editReply({
        embeds: [info(tGuild(gid, 'backup.auto.status_title'), tGuild(gid, 'backup.auto.status_on', {
          interval: formatInterval(cfg.intervalMinutes), delivery: cfg.delivery, target, last,
        }))],
      });
    }
  },
};

/** Human-readable interval, e.g. 15 → "Every 15 minutes", 1440 → "Daily", 10080 → "Weekly", 90 → "Every 1h 30m". */
function formatInterval(minutes: number): string {
  if (minutes === 1440) return 'Daily';
  if (minutes === 10080) return 'Weekly';
  if (minutes < 60) return `Every ${minutes} minutes`;
  if (minutes % 60 === 0) return `Every ${minutes / 60}h`;
  return `Every ${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
