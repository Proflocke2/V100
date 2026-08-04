/**
 * /bot-customize — customize the bot's identity, per server.
 *
 * All three subcommands (nickname, avatar, banner) use Discord's per-guild
 * member profile (GuildMemberManager#editMe) — nothing here touches the
 * bot's global identity. Each server can give the bot its own look without
 * affecting any other server the bot is in. ManageGuild required for all.
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  EmbedBuilder,
} from 'discord.js';
import { success, error } from '../../utils/embeds';
import { getLogChannel } from '../../modules/moderation/modLog';

const MAX_NICKNAME_LENGTH = 32;
const IMAGE_URL_RE = /^https?:\/\/.+\.(png|jpe?g|webp|gif)(\?.*)?$/i;

const data = new SlashCommandBuilder()
  .setName('bot-customize')
  .setDescription("Customize the bot's identity on this server: nickname, avatar, banner")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand(s =>
    s.setName('nickname')
      .setDescription("Change the bot's nickname on this server")
      .addStringOption(o =>
        o.setName('name')
          .setDescription(`New nickname (1-${MAX_NICKNAME_LENGTH} characters)`)
          .setRequired(true)
          .setMaxLength(MAX_NICKNAME_LENGTH),
      ),
  )
  .addSubcommand(s =>
    s.setName('avatar')
      .setDescription("Change the bot's profile picture on this server (this server only)")
      .addAttachmentOption(o => o.setName('image').setDescription('Image file to upload').setRequired(false))
      .addStringOption(o => o.setName('url').setDescription('Direct image URL (png/jpg/webp/gif)').setRequired(false)),
  )
  .addSubcommand(s =>
    s.setName('banner')
      .setDescription("Change the bot's profile banner on this server (this server only)")
      .addAttachmentOption(o => o.setName('image').setDescription('Image file to upload').setRequired(false))
      .addStringOption(o => o.setName('url').setDescription('Direct image URL (png/jpg/webp/gif)').setRequired(false)),
  );

async function logChange(interaction: ChatInputCommandInteraction, field: string, detail: string): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) return;
  const channelId = getLogChannel(guildId);
  if (!channelId) return;
  const ch = interaction.guild?.channels.cache.get(channelId);
  if (!ch || !ch.isTextBased()) return;
  const embed = new EmbedBuilder()
    .setColor('#ff6b35')
    .setTitle('🎨 Bot customization changed')
    .addFields(
      { name: 'Field', value: field, inline: true },
      { name: 'Change', value: detail, inline: true },
      { name: 'By', value: `<@${interaction.user.id}>`, inline: true },
    )
    .setTimestamp();
  await ch.send({ embeds: [embed] }).catch(() => {});
}

async function resolveImageSource(interaction: ChatInputCommandInteraction): Promise<string | null> {
  const attachment = interaction.options.getAttachment('image');
  const url = interaction.options.getString('url');

  if (attachment) {
    if (!attachment.contentType?.startsWith('image/')) return null;
    return attachment.url;
  }
  if (url) {
    if (!IMAGE_URL_RE.test(url)) return null;
    return url;
  }
  return null;
}

async function handleNickname(interaction: ChatInputCommandInteraction): Promise<void> {
  const name = interaction.options.getString('name', true).trim();

  if (name.length < 1 || name.length > MAX_NICKNAME_LENGTH) {
    await interaction.reply({
      embeds: [error('Invalid nickname', `Nickname must be 1-${MAX_NICKNAME_LENGTH} characters.`)],
      ephemeral: true,
    });
    return;
  }

  const me = interaction.guild?.members.me;
  if (!me) {
    await interaction.reply({ embeds: [error('Error', 'Could not resolve the bot in this server.')], ephemeral: true });
    return;
  }

  if (!me.permissions.has(PermissionFlagsBits.ChangeNickname)) {
    await interaction.reply({
      embeds: [error('Missing permission', 'The bot needs the "Change Nickname" permission to do this.')],
      ephemeral: true,
    });
    return;
  }

  const oldName = me.nickname ?? me.user.username;

  try {
    await me.setNickname(name, `Changed via /bot-customize by ${interaction.user.tag}`);
  } catch (err) {
    await interaction.reply({
      embeds: [error('Failed to change nickname', err instanceof Error ? err.message : String(err))],
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({ embeds: [success('Nickname changed', `**${oldName}** → **${name}**`)] });
  await logChange(interaction, 'Nickname', `${oldName} → ${name}`);
}

async function handleGuildImage(interaction: ChatInputCommandInteraction, kind: 'avatar' | 'banner'): Promise<void> {
  const attachment = interaction.options.getAttachment('image');
  const url = interaction.options.getString('url');

  if (!attachment && !url) {
    await interaction.reply({ embeds: [error('Missing input', 'Provide either an `image` attachment or a `url`.')], ephemeral: true });
    return;
  }

  const imageSource = await resolveImageSource(interaction);
  if (!imageSource) {
    await interaction.reply({
      embeds: [error('Invalid image', 'The attachment must be an image file, or the url must end in .png/.jpg/.jpeg/.webp/.gif.')],
      ephemeral: true,
    });
    return;
  }

  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ embeds: [error('Error', 'This command only works inside a server.')], ephemeral: true });
    return;
  }

  await interaction.deferReply();

  try {
    await guild.members.editMe(kind === 'avatar' ? { avatar: imageSource } : { banner: imageSource });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const rateLimited = /rate.?limit/i.test(msg);
    await interaction.editReply({
      embeds: [error(
        rateLimited ? 'Rate limited' : `Failed to change ${kind}`,
        rateLimited
          ? 'Discord rate-limits profile picture / banner changes. Wait a bit and try again.'
          : msg,
      )],
    });
    return;
  }

  const embed = success(`Bot ${kind} updated`, `The bot's ${kind} on **${guild.name}** has been changed. Other servers are unaffected.`);
  if (kind === 'avatar') embed.setThumbnail(imageSource);
  else embed.setImage(imageSource);

  await interaction.editReply({ embeds: [embed] });
  await logChange(interaction, kind === 'avatar' ? 'Avatar' : 'Banner', `Updated (this server only: ${guild.name})`);
}

export default {
  data,
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand();
    switch (sub) {
      case 'nickname': return handleNickname(interaction);
      case 'avatar':   return handleGuildImage(interaction, 'avatar');
      case 'banner':   return handleGuildImage(interaction, 'banner');
    }
  },
};
