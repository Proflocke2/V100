import {
  SlashCommandBuilder, ChatInputCommandInteraction,
  PermissionFlagsBits, ChannelType, EmbedBuilder, VoiceChannel,
} from 'discord.js';
import { getGuild } from '../../database/db';
import { getLocalized, Language } from '../../utils/localization';
import { StatsService } from '../../stats/StatsService';
import { upsertStatChannel, removeStatChannel, removeAllStatChannels, getStatsConfig } from '../../stats/StatsDB';
import { StatChannelType, DEFAULT_TEMPLATE_SENTINEL } from '../../stats/StatsTypes';
import { success, error, info } from '../../utils/embeds';
import { BotClient } from '../../utils/types';

const TYPE_CHOICES = [
  { name: '👥 Total Members',   value: 'total'       },
  { name: '🧑 Humans',          value: 'humans'      },
  { name: '🤖 Bots',            value: 'bots'        },
  { name: '🟢 Online Members',  value: 'online'      },
  { name: '🚀 Server Boosts',   value: 'boosts'      },
  { name: '⭐ Boost Level',     value: 'boost_level' },
  { name: '🎭 Role Counter',    value: 'role'        },
];

export default {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Configure real-time server statistics as voice channels')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s =>
      s.setName('setup').setDescription('Create a new statistics channel')
        .addStringOption(o => o.setName('type').setDescription('Which statistic to display').setRequired(true).addChoices(...TYPE_CHOICES))
        .addStringOption(o => o.setName('template').setDescription('Channel name template (use {value}). Empty = default').setRequired(false))
        .addRoleOption(o => o.setName('role').setDescription('Only for "Role Counter": which role?').setRequired(false))
        .addStringOption(o => o.setName('category').setDescription('Category ID (optional)').setRequired(false))
    )
    .addSubcommand(s =>
      s.setName('remove').setDescription('Remove a statistics channel')
        .addChannelOption(o => o.setName('channel').setDescription('Which channel to remove').addChannelTypes(ChannelType.GuildVoice).setRequired(true))
        .addBooleanOption(o => o.setName('delete_channel').setDescription('Also delete the Discord channel? (default: no)').setRequired(false))
    )
    .addSubcommand(s => s.setName('clear').setDescription('Remove all statistics channels for this server'))
    .addSubcommand(s => s.setName('list').setDescription('List all configured statistics channels'))
    .addSubcommand(s => s.setName('refresh').setDescription('Force an immediate statistics update')),

  async execute(interaction: ChatInputCommandInteraction, client: BotClient) {
    const guild = getGuild(interaction.guildId!);
    const lang  = (guild.language || 'en') as Language;
    const sub   = interaction.options.getSubcommand();

    if (sub === 'setup')   return handleSetup(interaction, lang);
    if (sub === 'remove')  return handleRemove(interaction, lang);
    if (sub === 'clear')   return handleClear(interaction, lang);
    if (sub === 'list')    return handleList(interaction, lang);
    if (sub === 'refresh') return handleRefresh(interaction, lang);
  },
};

async function handleSetup(interaction: ChatInputCommandInteraction, lang: Language): Promise<any> {
  await interaction.deferReply({ ephemeral: true });
  const type       = interaction.options.getString('type', true) as StatChannelType;
  const templateIn = interaction.options.getString('template');
  const role       = interaction.options.getRole('role');
  const categoryId = interaction.options.getString('category');
  const guild      = interaction.guild!;

  if (type === 'role' && !role)
    return await interaction.editReply({ embeds: [error(getLocalized('common.invalid_role', lang), 'The "Role Counter" type requires a role.')] });

  const template = templateIn ?? DEFAULT_TEMPLATE_SENTINEL;
  await guild.members.fetch().catch(() => {});
  const stats = StatsService.computeStats(guild);

  let initValue = 0;
  if (type === 'total')       initValue = stats.total;
  else if (type === 'humans') initValue = stats.humans;
  else if (type === 'bots')   initValue = stats.bots;
  else if (type === 'online') initValue = stats.online;
  else if (type === 'boosts') initValue = stats.boosts;
  else if (type === 'boost_level') initValue = stats.boostLevel;
  else if (type === 'role' && role) initValue = stats.roles[role.id] ?? 0;

  const localizedTemplate = getLocalized(`stats.template.${type}`, lang);
  const channelName = (templateIn ?? localizedTemplate)
    .replace('{value}', String(initValue))
    .replace('{role}', role?.name ?? 'Role')
    .slice(0, 100);

  try {
    const voiceChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildVoice,
      parent: categoryId ?? undefined,
      permissionOverwrites: [
        { id: guild.id,               deny: ['Connect'], allow: ['ViewChannel'] },
        { id: guild.members.me!.id,   allow: ['Connect', 'ManageChannels'] },
      ],
      reason: `Stats channel (${type}) created by ${interaction.user.tag}`,
    });
    upsertStatChannel(guild.id, voiceChannel.id, type, template, role?.id);
    const typeLabel = TYPE_CHOICES.find(c => c.value === type)?.name ?? type;
    return await interaction.editReply({
      embeds: [success(`${getLocalized('stats.title', lang)} ✓`, [
        `**${getLocalized('common.channel', lang)}:** <#${voiceChannel.id}>`,
        `**Type:** ${typeLabel}`,
        `**Template:** \`${template}\``,
        role ? `**${getLocalized('common.role', lang)}:** <@&${role.id}>` : '',
        '',
        '⏱️ Updates every ~10 minutes (Discord rate limit).',
      ].filter(Boolean).join('\n'))],
    });
  } catch (err) {
    console.error('[Stats] setup error:', err);
    return await interaction.editReply({ embeds: [error(getLocalized('common.error', lang), String(err))] });
  }
}

async function handleRemove(interaction: ChatInputCommandInteraction, lang: Language): Promise<any> {
  await interaction.deferReply({ ephemeral: true });
  const channel       = interaction.options.getChannel('channel', true);
  const deleteChannel = interaction.options.getBoolean('delete_channel') ?? false;
  const removed       = removeStatChannel(channel.id);

  if (!removed)
    return await interaction.editReply({ embeds: [error(getLocalized('common.error', lang), 'This channel is not a configured stats channel.')] });

  if (deleteChannel) {
    const ch = interaction.guild?.channels.cache.get(channel.id);
    await ch?.delete('Stats channel removed').catch(() => {});
  }
  return await interaction.editReply({
    embeds: [success('Stats channel removed', deleteChannel ? 'Channel deleted.' : 'Entry removed from DB. The Discord channel was kept.')],
  });
}

async function handleClear(interaction: ChatInputCommandInteraction, lang: Language): Promise<any> {
  await interaction.deferReply({ ephemeral: true });
  const count = removeAllStatChannels(interaction.guildId!);
  return await interaction.editReply({ embeds: [success('All stats cleared', `${count} stat channel entries removed. (Discord channels were kept.)`)] });
}

async function handleList(interaction: ChatInputCommandInteraction, lang: Language): Promise<any> {
  await interaction.deferReply({ ephemeral: true });
  const config = getStatsConfig(interaction.guildId!);

  if (config.channels.length === 0)
    return await interaction.editReply({ embeds: [info('Stats not set up', 'Use `/stats setup channel:#channel type:members` to create your first stat channel.')] });

  const pending = StatsService.hasPendingUpdate(interaction.guildId!);
  const eta     = StatsService.secondsUntilNextUpdate(interaction.guildId!);

  const lines = config.channels.map(ch => {
    const typeLabel = TYPE_CHOICES.find(c => c.value === ch.type)?.name ?? ch.type;
    const roleStr   = ch.roleId ? ` (<@&${ch.roleId}>)` : '';
    return `• <#${ch.channelId}> — **${typeLabel}**${roleStr}\n  Template: \`${ch.template}\``;
  });

  const embed = new EmbedBuilder()
    .setColor('#5865f2')
    .setTitle(`📊 ${getLocalized('stats.title', lang)}`)
    .setDescription(lines.join('\n\n'))
    .addFields({ name: '⏱️ Update Status', value: pending ? `Pending${eta !== null ? ` (~${eta}s)` : ''}` : 'No update pending' })
    .setTimestamp();

  return await interaction.editReply({ embeds: [embed] });
}

async function handleRefresh(interaction: ChatInputCommandInteraction, lang: Language): Promise<any> {
  await interaction.deferReply({ ephemeral: true });
  const config = getStatsConfig(interaction.guildId!);
  if (config.channels.length === 0)
    return await interaction.editReply({ embeds: [info('No stats', 'No stat channels found — create one with `/stats setup channel:#channel type:members`.')] });

  try {
    await StatsService.forceUpdate(interaction.guild!);
    return await interaction.editReply({ embeds: [success('Stats refreshed ✓', `${config.channels.length} channel(s) updated.`)] });
  } catch (err) {
    return await interaction.editReply({ embeds: [error(getLocalized('common.error', lang), String(err))] });
  }
}
