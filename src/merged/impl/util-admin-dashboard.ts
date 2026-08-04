/**
 * /admin — central admin dashboard.
 *
 * Shows the current status of every major system at a glance and provides
 * one-click buttons that trigger the relevant setup wizard directly, so a
 * new admin never needs to remember which command opens which config screen.
 */

import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits,
} from 'discord.js';
import { requireAdmin } from '../../utils/guards';
import db, { getGuild } from '../../database/db';
import { getSettings as getTicketSettings } from '../../modules/tickets/repository';
import { getSecurityConfig } from '../../modules/security/securityEngine';
import { buildAutomodHome } from '../../handlers/automodWizardHandler';
import { buildTicketSetupHome } from '../../handlers/ticketSetupWizardHandler';

function statusDot(v: number | boolean | null | undefined) { return v ? '🟢' : '🔴'; }

export default {
  data: new SlashCommandBuilder()
    .setName('admin')
    .setDescription('🖥️ Admin dashboard — quick status overview and one-click access to all setup wizards')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    .addSubcommand(s => s.setName('dashboard').setDescription('Open the main admin dashboard'))
    .addSubcommand(s => s.setName('moderation').setDescription('Open moderation setup directly'))
    .addSubcommand(s => s.setName('tickets').setDescription('Open ticket setup directly')),

  async execute(ix: ChatInputCommandInteraction) {
    if (!await requireAdmin(ix)) return;
    const sub = ix.options.getSubcommand();
    const gid = ix.guildId!;

    // Quick sub-routes to avoid needing to type separate commands
    if (sub === 'moderation') {
      const payload = await buildAutomodHome(gid);
      return ix.reply({ ...payload, flags: MessageFlags.Ephemeral });
    }
    if (sub === 'tickets') {
      const payload = await buildTicketSetupHome(gid);
      return ix.reply({ ...payload, flags: MessageFlags.Ephemeral });
    }

    // Main dashboard
    const g      = getGuild(gid) as any;
    const ticket = getTicketSettings(gid);
    const sec    = getSecurityConfig(gid) as any;
    const am3    = (db.prepare('SELECT * FROM automod3_config WHERE guild_id=?').get(gid) as any) ?? {};

    const embed = new EmbedBuilder()
      .setTitle('🖥️ Admin Dashboard')
      .setColor('#5865f2')
      .setDescription(`**${ix.guild?.name ?? 'Server'}** — click any button to open the setup wizard for that area.`)
      .addFields(
        {
          name: '🛡️ Moderation',
          value: [
            `${statusDot(g.automod_enabled)} AutoMod filters`,
            `${statusDot(sec?.enabled)} Security Engine (${sec?.severity ?? 'medium'})`,
            `${statusDot(am3?.phishing_filter)} Phishing guard`,
          ].join(' · '),
          inline: false,
        },
        {
          name: '🎫 Tickets',
          value: [
            `Log: ${ticket.log_channel_id ? `<#${ticket.log_channel_id}>` : '❌ not set'}`,
            `Max open: ${ticket.max_open}`,
            `Auto-close: ${statusDot(ticket.autoclose_enabled)}`,
          ].join(' · '),
          inline: false,
        },
        {
          name: '💰 Economy',
          value: [
            `${statusDot(g.level_enabled)} Levels`,
            `${statusDot(g.lucky_drops_enabled)} Lucky drops`,
            `${statusDot(g.voice_xp_enabled)} Voice XP`,
          ].join(' · '),
          inline: false,
        },
        {
          name: '👋 Welcome',
          value: (() => {
            const ws = db.prepare('SELECT enabled, channel_id FROM welcome_settings WHERE guild_id=?').get(gid) as any;
            return ws?.enabled ? `🟢 Active — <#${ws.channel_id}>` : '🔴 Disabled';
          })(),
          inline: true,
        },
        {
          name: '⚙️ Setup status',
          value: [
            `Bot prefix: \`${g.prefix ?? '!'}\``,
            `Language: ${g.language ?? 'en'}`,
            `Mod log: ${g.mod_log_channel ? `<#${g.mod_log_channel}>` : '—'}`,
          ].join(' · '),
          inline: false,
        },
      )
      .setFooter({ text: 'Use the buttons below to configure any section' })
      .setTimestamp();

    const components = [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('admin:open:modsetup').setLabel('🛡️ Mod Setup').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('admin:open:tickets').setLabel('🎫 Ticket Setup').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('admin:open:welcome').setLabel('👋 Welcome').setStyle(ButtonStyle.Primary),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('admin:open:ecoconfig').setLabel('💰 Economy').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('admin:open:setup').setLabel('⚙️ Full Setup').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('admin:open:botbackup').setLabel('💾 Bot Backup').setStyle(ButtonStyle.Secondary),
      ),
    ];

    await ix.reply({ embeds: [embed], components, flags: MessageFlags.Ephemeral });
  },
};
