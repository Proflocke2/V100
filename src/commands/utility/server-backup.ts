/**
 * /server-backup — live Discord SERVER structure backup (roles, channels,
 * permissions, current ban list) + optional ongoing chat-message logging.
 *
 * Deliberately separate from /backup, which backs up the BOT's own state
 * (configs, economy, ticket transcripts, mod-history, etc). This command
 * is about the server's own Discord entities — different data, different
 * risk profile (restore writes live to Discord), kept fully apart on
 * purpose, including its own DB tables and its own snapshot files
 * (server-backups/ vs backups/).
 */

import {
  SlashCommandBuilder, ChatInputCommandInteraction, AttachmentBuilder,
  PermissionFlagsBits, EmbedBuilder, MessageFlags, ChannelType,
  ButtonBuilder, ButtonStyle, ActionRowBuilder,
} from 'discord.js';
import { requireAdmin } from '../../utils/guards';
import { success, error, info } from '../../utils/embeds';
import { setGuildValue } from '../../database/db';
import * as Structure from '../../modules/serverBackup/structure';
import * as Repo from '../../modules/serverBackup/repository';
import * as Messages from '../../modules/serverBackup/messages';
import { readFileSync } from 'fs';

export default {
  data: new SlashCommandBuilder()
    .setName('server-backup')
    .setDescription('Back up the live Discord structure (roles/channels/bans) — separate from /backup [Admins only]')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

    .addSubcommand(s => s.setName('create').setDescription('Snapshot the current roles, channels, permissions, and ban list'))
    .addSubcommand(s => s.setName('list').setDescription('List server-structure snapshots for this server'))
    .addSubcommand(s => s.setName('restore').setDescription('Restore a snapshot LIVE to Discord (asks for confirmation)')
      .addStringOption(o => o.setName('version').setDescription('Snapshot version (see /server-backup list)').setRequired(true)))
    .addSubcommand(s => s.setName('delete').setDescription('Delete a snapshot record (file kept on disk)')
      .addStringOption(o => o.setName('version').setDescription('Snapshot version').setRequired(true)))
    .addSubcommand(s => s.setName('export').setDescription('Export a snapshot as a JSON file')
      .addStringOption(o => o.setName('version').setDescription('Snapshot version').setRequired(true)))

    .addSubcommand(s => s.setName('auto-enable').setDescription('Turn on automatic server-structure backups')
      .addStringOption(o => o.setName('interval').setDescription('How often to back up').setRequired(true)
        .addChoices(
          { name: 'Every hour',    value: '60' },
          { name: 'Every 6 hours', value: '360' },
          { name: 'Daily',         value: '1440' },
          { name: 'Weekly',        value: '10080' },
        ))
      .addStringOption(o => o.setName('delivery').setDescription('Where the backup file goes').setRequired(true)
        .addChoices({ name: 'Post in a channel', value: 'channel' }, { name: 'Send as a DM', value: 'dm' }))
      .addIntegerOption(o => o.setName('custom_minutes').setDescription('Custom interval in minutes — overrides the choice above (min. 60)').setMinValue(60).setMaxValue(43200))
      .addChannelOption(o => o.setName('channel').setDescription('Channel to post in (required if delivery = channel)').addChannelTypes(ChannelType.GuildText))
      .addUserOption(o => o.setName('recipient').setDescription('Who gets the DM (required if delivery = dm, default: you)')))
    .addSubcommand(s => s.setName('auto-disable').setDescription('Turn off automatic server-structure backups'))
    .addSubcommand(s => s.setName('auto-status').setDescription('Show the current automatic server-backup settings'))

    .addSubcommandGroup(g => g
      .setName('messages')
      .setDescription('Ongoing chat-message logging (separate opt-in, off by default)')
      .addSubcommand(s => s.setName('enable').setDescription('Start logging all chat messages in this server from now on')
        .addIntegerOption(o => o.setName('retention_days').setDescription('Auto-delete logged messages after this many days (0 = keep forever, default 90)').setMinValue(0).setMaxValue(3650)))
      .addSubcommand(s => s.setName('disable').setDescription('Stop logging chat messages (existing logged messages are kept until retention prunes them)'))
      .addSubcommand(s => s.setName('status').setDescription('Show message-logging status and how many messages are stored'))),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!await requireAdmin(interaction)) return;
    const group = interaction.options.getSubcommandGroup(false);
    const sub   = interaction.options.getSubcommand();
    const gid   = interaction.guildId!;

    if (group === 'messages') {
      if (sub === 'enable') {
        const retentionDays = interaction.options.getInteger('retention_days') ?? 90;
        setGuildValue(gid, 'server_backup_messages_enabled', 1);
        setGuildValue(gid, 'server_backup_messages_retention_days', retentionDays);
        await interaction.reply({
          embeds: [success(
            'Message logging enabled',
            `Chat messages in every channel will be logged **from now on** (no backfill of older history).\n` +
            `Retention: ${retentionDays === 0 ? '**kept forever**' : `auto-deleted after **${retentionDays} days**`}.\n\n` +
            `⚠️ This is separate from \`/data delete\` — a user's logged messages ARE included in that GDPR deletion.`,
          )],
          ephemeral: true,
        });
        return;
      }
      if (sub === 'disable') {
        setGuildValue(gid, 'server_backup_messages_enabled', 0);
        await interaction.reply({ embeds: [success('Message logging disabled', 'Already-logged messages are kept until retention prunes them, or delete them yourself via retention_days = 0 → re-enable, or contact support for a manual purge.')], ephemeral: true });
        return;
      }
      // status
      const cfg = Messages.getMessageLogConfig(gid);
      const count = Messages.countLoggedMessages(gid);
      await interaction.reply({
        embeds: [info('💬 Message logging status', cfg.enabled
          ? `**On** — ${count.toLocaleString('en-US')} messages stored. Retention: ${cfg.retentionDays === 0 ? 'forever' : `${cfg.retentionDays} days`}.`
          : `**Off** — ${count.toLocaleString('en-US')} messages still stored from when it was previously on.`)],
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const guild = interaction.guild!;

    if (sub === 'create') {
      try {
        const r = await Structure.createStructureSnapshot(guild);
        return interaction.editReply({
          embeds: [success('Server-structure snapshot created', `\`${r.version}\` — ${r.roles} roles, ${r.channels} channels, ${r.bans} bans. File: \`${r.file}\``)],
        });
      } catch (e) {
        return interaction.editReply({ embeds: [error('Snapshot failed', errMsg(e))] });
      }
    }

    if (sub === 'list') {
      const rows = Repo.listForGuild(gid);
      if (!rows.length) return interaction.editReply({ embeds: [info('Server-structure snapshots', 'No snapshots yet — run `/server-backup create` to take your first live Discord structure snapshot (roles, channels, bans).')] });
      const e = new EmbedBuilder().setTitle('🏗️ Server-structure snapshots').setColor('#ff6b35');
      for (const r of rows.slice(0, 20)) {
        e.addFields({ name: `\`${r.version}\``, value: `<t:${r.created_at}:R> — ${r.roles} roles, ${r.channels} channels, ${r.bans} bans` });
      }
      return interaction.editReply({ embeds: [e] });
    }

    if (sub === 'restore') {
      const version = interaction.options.getString('version', true);
      const meta = Repo.getByVersion(gid, version);
      if (!meta) return interaction.editReply({ embeds: [error('Not found', `No snapshot \`${version}\`.`)] });

      const confirmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`sbackup:restore_confirm:${version}`).setLabel('⚠️ Yes, restore live').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('sbackup:restore_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
      );
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor('#ed4245')
          .setTitle('⚠️ This writes LIVE to Discord')
          .setDescription(
            `Restoring \`${version}\` (${meta.roles} roles, ${meta.channels} channels, ${meta.bans} bans) will:\n` +
            `• Recreate any role/channel that no longer exists\n` +
            `• Update settings/permissions on ones that still do\n` +
            `• Re-apply every ban in the snapshot\n\n` +
            `Nothing currently on the server gets **deleted** — this only creates/updates/re-bans. Still, permission changes on existing roles/channels take effect immediately. Are you sure?`,
          )],
        components: [confirmRow],
      });
    }

    if (sub === 'delete') {
      const version = interaction.options.getString('version', true);
      const meta = Repo.getByVersion(gid, version);
      if (!meta) return interaction.editReply({ embeds: [error('Not found', `No snapshot \`${version}\`.`)] });
      Structure.deleteStructureSnapshot(gid, version);
      return interaction.editReply({ embeds: [success('Deleted', `Snapshot record \`${version}\` removed (file kept on disk).`)] });
    }

    if (sub === 'export') {
      const version = interaction.options.getString('version', true);
      const meta = Repo.getByVersion(gid, version);
      if (!meta) return interaction.editReply({ embeds: [error('Not found', `No snapshot \`${version}\`.`)] });
      const buf = Buffer.from(readFileSync(meta.file_path));
      const att = new AttachmentBuilder(buf, { name: `server-backup-${gid}-${version}.json` });
      return interaction.editReply({
        embeds: [new EmbedBuilder().setTitle('📦 Server-structure export').setDescription(`\`${version}\``).setColor('#ff6b35')],
        files: [att],
      });
    }

    if (sub === 'auto-enable') {
      const intervalChoice = interaction.options.getString('interval', true);
      const customMinutes  = interaction.options.getInteger('custom_minutes');
      const intervalMinutes = Math.max(60, customMinutes ?? parseInt(intervalChoice, 10));
      const delivery  = interaction.options.getString('delivery', true) as 'channel' | 'dm';
      const channel   = interaction.options.getChannel('channel');
      const recipient = interaction.options.getUser('recipient');

      if (delivery === 'channel' && !channel) return interaction.editReply({ embeds: [error('Missing channel', 'Pick a channel for delivery = channel.')] });

      setGuildValue(gid, 'server_backup_auto_enabled', 1);
      setGuildValue(gid, 'server_backup_auto_interval_minutes', intervalMinutes);
      setGuildValue(gid, 'server_backup_auto_delivery', delivery);
      if (delivery === 'channel') setGuildValue(gid, 'server_backup_auto_channel', channel!.id);
      if (delivery === 'dm')      setGuildValue(gid, 'server_backup_auto_recipient', (recipient ?? interaction.user).id);

      const target = delivery === 'channel' ? `<#${channel!.id}>` : `<@${(recipient ?? interaction.user).id}>`;
      return interaction.editReply({ embeds: [success('Auto server-backup enabled', `Every ${formatInterval(intervalMinutes)}, delivered to ${target}. Note: this only snapshots — restoring is always manual and requires confirmation.`)] });
    }

    if (sub === 'auto-disable') {
      setGuildValue(gid, 'server_backup_auto_enabled', 0);
      return interaction.editReply({ embeds: [success('Auto server-backup disabled')] });
    }

    if (sub === 'auto-status') {
      const cfg = Repo.getAutoServerBackupConfig(gid);
      if (!cfg.enabled) return interaction.editReply({ embeds: [info('Auto server-backup', 'Currently off.')] });
      const target = cfg.delivery === 'channel' ? (cfg.channel ? `<#${cfg.channel}>` : '*(not set)*') : (cfg.recipient ? `<@${cfg.recipient}>` : '*(not set)*');
      const last = cfg.lastRunTs ? `<t:${cfg.lastRunTs}:R>` : 'never yet';
      return interaction.editReply({ embeds: [info('Auto server-backup', `Every ${formatInterval(cfg.intervalMinutes)} → ${cfg.delivery} (${target}). Last run: ${last}.`)] });
    }
  },
};

function formatInterval(minutes: number): string {
  if (minutes === 1440) return 'daily';
  if (minutes === 10080) return 'weekly';
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
