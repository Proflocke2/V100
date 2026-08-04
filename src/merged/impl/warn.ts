import { getWarnConfig } from './warnconfig';
import { requireModerator } from '../../utils/guards';
/**
 * /warn — Verwarnt einen User.
 *
 * UI: button-based warn system with a modal for entering the reason.
 * Auto-Eskalation: 3 Warns → Timeout, 5 Warns → Ban.
 */

import {
  SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits,
  GuildMember, EmbedBuilder, MessageFlags,
  ButtonBuilder, ButtonStyle, ActionRowBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ButtonInteraction,
} from 'discord.js';
import db, { getGuild, logModAction } from '../../database/db';
import { recordModAction } from '../../modules/staffActivity/service';
import { error } from '../../utils/embeds';

export default {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a user')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName('user').setDescription('User to warn').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for the warning').setRequired(true)),

  async execute(ix: ChatInputCommandInteraction) {
    if (!await requireModerator(ix)) return;
    const target = ix.options.getMember('user') as GuildMember | null;
    const reason = ix.options.getString('reason', true);

    if (!target) {
      return ix.reply({ embeds: [error('User not found.')], flags: MessageFlags.Ephemeral });
    }
    if (target.id === ix.user.id) {
      return ix.reply({ embeds: [error('You cannot warn yourself.')], flags: MessageFlags.Ephemeral });
    }
    if (target.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return ix.reply({ embeds: [error('You cannot warn admins.')], flags: MessageFlags.Ephemeral });
    }

    // logModAction() runs first so the case number it hands back can be
    // stored on the warnings row too — keeps both tables referencing the
    // same case, so /history can show "Case #N" next to a warn without a
    // fragile timestamp-based join between the two tables.
    const caseNumber = logModAction(ix.guildId!, target.id, ix.user.id, 'warn', reason);
    recordModAction(ix.guildId!, ix.user.id, 'warn');

    db.prepare('INSERT INTO warnings (guild_id, user_id, moderator_id, reason, case_number) VALUES (?, ?, ?, ?, ?)')
      .run(ix.guildId, target.id, ix.user.id, reason, caseNumber);

    const count = (db.prepare('SELECT COUNT(*) as c FROM warnings WHERE guild_id = ? AND user_id = ?')
      .get(ix.guildId, target.id) as { c: number }).c;

    // Auto-escalation (configurable via /warnconfig). Each triggered action
    // gets logged as its own case too — attributed to the moderator whose
    // warn tipped the threshold, since a human decision (issuing that warn)
    // is what caused it, even though the kick/ban/timeout itself ran
    // automatically.
    const warnCfg = getWarnConfig(ix.guildId!);
    let escalation = '';
    if (warnCfg.ban_threshold > 0 && count >= warnCfg.ban_threshold) {
      await ix.guild?.members.ban(target, { reason: `Auto-ban: ${count} warnings` }).catch(() => {});
      const escCase = logModAction(ix.guildId!, target.id, ix.user.id, 'ban', `Auto-ban: ${count} warnings (triggered by Case #${caseNumber})`);
      escalation = `🔨 **Auto-Ban** triggered (${count} warnings). *Case #${escCase}*`;
    } else if (warnCfg.kick_threshold > 0 && count >= warnCfg.kick_threshold) {
      await ix.guild?.members.kick(target, `Auto-kick: ${count} warnings`).catch(() => {});
      const escCase = logModAction(ix.guildId!, target.id, ix.user.id, 'kick', `Auto-kick: ${count} warnings (triggered by Case #${caseNumber})`);
      escalation = `👢 **Auto-Kick** triggered (${count} warnings). *Case #${escCase}*`;
    } else if (warnCfg.mute_threshold > 0 && count >= warnCfg.mute_threshold) {
      const ms = warnCfg.mute_duration_minutes * 60 * 1000;
      await target.timeout(ms, `Auto-mute: ${count} warnings`).catch(() => {});
      const escCase = logModAction(ix.guildId!, target.id, ix.user.id, 'timeout', `Auto-mute: ${count} warnings (triggered by Case #${caseNumber})`, ms);
      escalation = `⏱️ **Auto-Mute** (${warnCfg.mute_duration_minutes}min) triggered (${count} warnings). *Case #${escCase}*`;
    }

    // Try to DM the warned user
    const dmEmbed = new EmbedBuilder()
      .setTitle(`⚠️ You were warned in **${ix.guild?.name}**`)
      .setColor('#fee75c')
      .addFields(
        { name: 'Reason',   value: reason,       inline: true },
        { name: 'Warning',  value: `${count}/5`, inline: true },
        { name: 'Moderator', value: ix.user.tag,  inline: true },
      )
      .setTimestamp();
    await target.send({ embeds: [dmEmbed] }).catch(() => {});

    // Reply embed with buttons to view warnings / undo
    const embed = new EmbedBuilder()
      .setTitle('⚠️ Warning Issued')
      .setColor('#fee75c')
      .setThumbnail(target.user.displayAvatarURL())
      .addFields(
        { name: 'User',      value: `${target} (${target.user.tag})`, inline: true },
        { name: 'Warnings',  value: `**${count}/5**`,                 inline: true },
        { name: 'Moderator', value: `${ix.user}`,                     inline: true },
        { name: 'Reason',    value: reason },
        { name: 'Case',      value: `#${caseNumber}`, inline: true },
        ...(escalation ? [{ name: '🤖 Auto-Action', value: escalation }] : []),
      )
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`warn:list:${target.id}`)
        .setLabel('All Warnings')
        .setEmoji('📋')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`warn:remove_last:${target.id}`)
        .setLabel('Remove Last')
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Danger),
    );

    await ix.reply({ embeds: [embed], components: [row] });
  },
};
