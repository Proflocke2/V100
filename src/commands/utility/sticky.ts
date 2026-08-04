/**
 * /sticky — a message that automatically re-posts itself at the bottom of a
 * channel after every new message, so it always stays visible.
 *
 * The actual repost logic lives in modules/stickyMessage/service.ts and is
 * hooked into events/messageCreate.ts — nothing to do there when editing
 * this file.
 */

import {
  SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, TextChannel, ChannelType,
} from 'discord.js';
import { success, error, info } from '../../utils/embeds';
import * as StickyRepo from '../../modules/stickyMessage/repository';
import { setStickyMessage, removeStickyMessage } from '../../modules/stickyMessage/service';

const MAX_LENGTH = 1000;

const data = new SlashCommandBuilder()
  .setName('sticky')
  .setDescription('Set a message that stays pinned to the bottom of a channel')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)

  .addSubcommand(s =>
    s.setName('set')
      .setDescription('Set (or replace) the sticky message for this channel')
      .addStringOption(o =>
        o.setName('content')
          .setDescription('The text to show — you choose exactly what it says')
          .setRequired(true)
          .setMaxLength(MAX_LENGTH),
      )
      .addChannelOption(o =>
        o.setName('channel')
          .setDescription('Channel to use (default: this channel)')
          .addChannelTypes(ChannelType.GuildText),
      ),
  )

  .addSubcommand(s =>
    s.setName('remove')
      .setDescription('Remove the sticky message from a channel')
      .addChannelOption(o =>
        o.setName('channel')
          .setDescription('Channel to remove it from (default: this channel)')
          .addChannelTypes(ChannelType.GuildText),
      ),
  )

  .addSubcommand(s =>
    s.setName('status')
      .setDescription('Show the current sticky message for a channel')
      .addChannelOption(o =>
        o.setName('channel')
          .setDescription('Channel to check (default: this channel)')
          .addChannelTypes(ChannelType.GuildText),
      ),
  );

function resolveChannel(interaction: ChatInputCommandInteraction): TextChannel | null {
  const chosen = interaction.options.getChannel('channel');
  const channel = chosen ?? interaction.channel;
  if (!channel || channel.type !== ChannelType.GuildText) return null;
  return channel as TextChannel;
}

export default {
  data,
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand();
    const channel = resolveChannel(interaction);

    if (!channel) {
      await interaction.reply({
        embeds: [error('Invalid channel', 'Please pick a normal text channel.')],
        ephemeral: true,
      });
      return;
    }

    if (sub === 'set') {
      const content = interaction.options.getString('content', true);
      await interaction.deferReply({ ephemeral: true });
      await setStickyMessage(channel, content, interaction.user.id);
      await interaction.editReply({
        embeds: [success('Sticky message set', `It will now stay at the bottom of <#${channel.id}>.`)],
      });
      return;
    }

    if (sub === 'remove') {
      await interaction.deferReply({ ephemeral: true });
      const removed = await removeStickyMessage(channel);
      await interaction.editReply({
        embeds: [removed
          ? success('Sticky message removed', `<#${channel.id}> no longer has a sticky message.`)
          : error('Nothing to remove', `<#${channel.id}> doesn't have a sticky message set.`)],
      });
      return;
    }

    if (sub === 'status') {
      const row = StickyRepo.getSticky(channel.guild.id, channel.id);
      if (!row) {
        await interaction.reply({
          embeds: [info('📌 Sticky Message', `<#${channel.id}> doesn't have a sticky message set.`)],
          ephemeral: true,
        });
        return;
      }
      await interaction.reply({
        embeds: [info('📌 Sticky Message', `**Channel:** <#${channel.id}>\n**Set by:** <@${row.created_by}>\n\n${row.content}`)],
        ephemeral: true,
      });
      return;
    }
  },
};
