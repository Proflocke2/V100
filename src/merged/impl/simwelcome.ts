/**
 * /simwelcome — Admin simulation of the welcome system.
 *
 * Shows the welcome embed and (optionally) the welcome card live in the
 * channel, so admins can preview the layout, line spacing, and placeholders in advance.
 *
 * Placeholders in simulation mode:
 *   {user}        → @Admin (the user running the command)
 *   {username}    → Admin username
 *   {mention}     → @Admin mention
 *   {server}      → Server name
 *   {membercount} → Real current member count
 *   {join_date}   → Today's date
 *
 * Subcommands:
 *   run      – Sends a simulated welcome message to the configured channel
 *   here     – sends the simulation to the current channel (no channel configuration needed)
 *   leave    – Simulates a leave message
 *   dm       – Shows the DM preview as an ephemeral reply
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  GuildMember,
  EmbedBuilder,
  AttachmentBuilder,
  TextChannel,
  MessageFlags,
} from 'discord.js';
import { error, info } from '../../utils/embeds';
import * as Repo from '../../modules/welcome/repository';
import { createWelcomeCard } from '../../modules/welcome/card';
import { replacePlaceholders } from '../../utils/helpers';

// ── Placeholders for simulation mode ──────────────────────────────────────

function simPlaceholders(member: GuildMember): Record<string, string> {
  return {
    user:        member.user.tag,
    username:    member.user.username,
    mention:     member.toString(),
    server:      member.guild.name,
    membercount: member.guild.memberCount.toString(),
    join_date:   new Date().toISOString().slice(0, 10),
  };
}

// ── Simulation badge (so it's clear this is a test) ───────────────────────────

function simBadgeField() {
  return { name: '🧪 Simulation', value: 'This is a test preview — not a real welcome message.', inline: false };
}

// ── Build the welcome embed (keep formatting exactly as-is) ──────────────────

async function buildSimWelcomeEmbed(
  member: GuildMember,
  s: Repo.WelcomeSettings,
  withCard: boolean,
): Promise<{ embed: EmbedBuilder; attachment: AttachmentBuilder | null }> {
  const ph   = simPlaceholders(member);
  // replacePlaceholders uses replaceAll — line breaks, markdown, whitespace stay exactly as-is
  const text = s.message
    ? replacePlaceholders(s.message, ph)
    : `Welcome to **${member.guild.name}**, ${member.toString()}! 🎉\nYou are member **#${member.guild.memberCount}**.`;

  let attachment: AttachmentBuilder | null = null;
  if (withCard && s.use_card) {
    try {
      const buf = await createWelcomeCard(member, s.background_url, s.card_image_url);
      attachment = new AttachmentBuilder(buf, { name: 'welcome-sim.png' });
    } catch (err) {
      console.error('[SimWelcome] card failed:', err);
    }
  }

  const embed = new EmbedBuilder()
    .setColor((s.color || '#5865f2') as `#${string}`)
    .setDescription(text)  // Keine Manipulation — exakt wie eingegeben
    .setTimestamp()
    .addFields(simBadgeField());

  if (attachment) embed.setImage('attachment://welcome-sim.png');

  return { embed, attachment };
}

// ── Build the leave embed ─────────────────────────────────────────────────────

function buildSimLeaveEmbed(member: GuildMember, s: Repo.WelcomeSettings): EmbedBuilder {
  const ph   = simPlaceholders(member);
  const text = s.leave_message
    ? replacePlaceholders(s.leave_message, ph)
    : `**${member.user.tag}** has left the server. (${member.guild.memberCount} members)`;

  return new EmbedBuilder()
    .setColor((s.leave_color || '#ed4245') as `#${string}`)
    .setDescription(text)
    .setThumbnail(member.user.displayAvatarURL())
    .setTimestamp()
    .addFields(simBadgeField());
}

// ── Command-Definition ────────────────────────────────────────────────────────

export default {
  data: new SlashCommandBuilder()
    .setName('simwelcome')
    .setDescription('Simulate welcome/leave messages for testing (admins only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)

    // /simwelcome run — to the configured welcome channel
    .addSubcommand(s =>
      s.setName('run')
        .setDescription('Send simulation to the configured welcome channel')
        .addBooleanOption(o =>
          o.setName('card').setDescription('Render welcome card? (default: yes)'),
        ),
    )

    // /simwelcome here — to the current channel
    .addSubcommand(s =>
      s.setName('here')
        .setDescription('Sends the simulation to this channel')
        .addBooleanOption(o =>
          o.setName('card').setDescription('Render welcome card? (default: yes)'),
        ),
    )

    // /simwelcome leave — simulate a leave message
    .addSubcommand(s =>
      s.setName('leave')
        .setDescription('Simulates a leave message in the configured leave channel'),
    )

    // /simwelcome dm — DM preview as an ephemeral reply
    .addSubcommand(s =>
      s.setName('dm')
        .setDescription('Shows the DM message as an ephemeral preview'),
    ),

  async execute(ix: ChatInputCommandInteraction) {
    const sub    = ix.options.getSubcommand();
    const gid    = ix.guildId!;
    const member = ix.member as GuildMember;
    const s      = Repo.getSettings(gid);

    // ── /simwelcome run ──────────────────────────────────────────────────────
    if (sub === 'run') {
      if (!s.channel_id) {
        return ix.reply({
          embeds: [error('No welcome channel configured.', 'Run `/welcome setup` first.')],
          flags: MessageFlags.Ephemeral,
        });
      }

      const ch = ix.guild!.channels.cache.get(s.channel_id) as TextChannel | undefined;
      if (!ch) {
        return ix.reply({
          embeds: [error('Welcome channel not found.', 'Channel may have been deleted.')],
          flags: MessageFlags.Ephemeral,
        });
      }

      await ix.deferReply({ flags: MessageFlags.Ephemeral });

      const withCard = ix.options.getBoolean('card') ?? true;
      const { embed, attachment } = await buildSimWelcomeEmbed(member, s, withCard);

      await ch.send({
        content: member.toString(),
        embeds: [embed],
        files: attachment ? [attachment] : [],
      });

      return ix.editReply({
        embeds: [info('✅ Simulation Sent', `Welcome message was posted in ${ch}.`)],
      });
    }

    // ── /simwelcome here ─────────────────────────────────────────────────────
    if (sub === 'here') {
      await ix.deferReply();

      const withCard = ix.options.getBoolean('card') ?? true;
      const { embed, attachment } = await buildSimWelcomeEmbed(member, s, withCard);

      return ix.editReply({
        content: member.toString(),
        embeds: [embed],
        files: attachment ? [attachment] : [],
      });
    }

    // ── /simwelcome leave ────────────────────────────────────────────────────
    if (sub === 'leave') {
      if (!s.leave_enabled || !s.leave_channel_id) {
        return ix.reply({
          embeds: [error(
            'Leave messages not configured.',
            'Nutze `/welcome leave enabled:true channel:#kanal message:...`.',
          )],
          flags: MessageFlags.Ephemeral,
        });
      }

      const ch = ix.guild!.channels.cache.get(s.leave_channel_id) as TextChannel | undefined;
      if (!ch) {
        return ix.reply({
          embeds: [error('Leave channel not found.')],
          flags: MessageFlags.Ephemeral,
        });
      }

      const embed = buildSimLeaveEmbed(member, s);
      await ch.send({ embeds: [embed] });

      return ix.reply({
        embeds: [info('✅ Leave Simulation Sent', `Leave message was posted in ${ch}.`)],
        flags: MessageFlags.Ephemeral,
      });
    }

    // ── /simwelcome dm ───────────────────────────────────────────────────────
    if (sub === 'dm') {
      if (!s.dm_enabled) {
        return ix.reply({
          embeds: [error('DM messages are disabled.', 'Enable them with `/welcome dm enabled:true`.')],
          flags: MessageFlags.Ephemeral,
        });
      }

      const ph   = simPlaceholders(member);
      // Keep formatting exactly as-is — no trimming
      const text = s.dm_message
        ? replacePlaceholders(s.dm_message, ph)
        : `Welcome to **${member.guild.name}**! Great to have you here.`;

      const embed = new EmbedBuilder()
        .setColor('#5865f2')
        .setTitle('📨 DM Preview')
        .setDescription(text)
        .setTimestamp()
        .addFields(simBadgeField());

      return ix.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  },
};
