import {
  SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel, ButtonInteraction,
} from 'discord.js';
import { getGuild } from '../../database/db';
import { getLocalized, Language } from '../../utils/localization';
import db from '../../database/db';
import { success, error } from '../../utils/embeds';
import { parseDuration, formatTimestamp } from '../../utils/helpers';
import { GiveawayRow } from '../../utils/types';

export default {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Giveaway management')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName('start').setDescription('Start a giveaway')
      .addStringOption(o => o.setName('prize').setDescription('Prize').setRequired(true))
      .addStringOption(o => o.setName('duration').setDescription('Duration e.g. 1h, 1d').setRequired(true))
      .addIntegerOption(o => o.setName('winners').setDescription('Number of winners').setMinValue(1).setMaxValue(20))
      .addChannelOption(o => o.setName('channel').setDescription('Channel (default: current)')))
    .addSubcommand(s => s.setName('end').setDescription('End a giveaway early')
      .addIntegerOption(o => o.setName('id').setDescription('Giveaway ID').setRequired(true)))
    .addSubcommand(s => s.setName('reroll').setDescription('Reroll winners')
      .addIntegerOption(o => o.setName('id').setDescription('Giveaway ID').setRequired(true))),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = getGuild(interaction.guildId!);
    const lang = (guild.language || 'en') as Language;
    const sub = interaction.options.getSubcommand();

    if (sub === 'start') {
      const prize = interaction.options.getString('prize', true);
      const dur = interaction.options.getString('duration', true);
      const winners = interaction.options.getInteger('winners') ?? 1;
      const ch = (interaction.options.getChannel('channel') as TextChannel | null) ?? interaction.channel as TextChannel;
      const ms = parseDuration(dur);
      if (!ms) return interaction.reply({ embeds: [error('Invalid duration')], ephemeral: true });

      const endsAt = Math.floor((Date.now() + ms) / 1000);
      const row = db.prepare('INSERT INTO giveaways (guild_id, channel_id, prize, winners, host_id, ends_at) VALUES (?, ?, ?, ?, ?, ?)').run(
        interaction.guildId, ch.id, prize, winners, interaction.user.id, endsAt
      );

      const embed = new EmbedBuilder()
        .setTitle('🎉 Giveaway!')
        .setColor('#5865f2')
        .setDescription(`**${prize}**\n\nEnds: ${formatTimestamp(endsAt, 'R')}\nWinners: **${winners}**\nHosted by: ${interaction.user}`)
        .setFooter({ text: `ID: ${row.lastInsertRowid}` })
        .setTimestamp(endsAt * 1000);

      const btn = new ButtonBuilder().setCustomId('giveaway_join').setLabel('Join 🎉').setStyle(ButtonStyle.Primary);
      const msg = await ch.send({ embeds: [embed], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(btn)] });
      db.prepare('UPDATE giveaways SET message_id = ? WHERE rowid = ?').run(msg.id, row.lastInsertRowid);
      await interaction.reply({ embeds: [success('Giveaway started', `In ${ch}`)], ephemeral: true });
    }

    if (sub === 'end') {
      const id = interaction.options.getInteger('id', true);
      db.prepare('UPDATE giveaways SET ends_at = 0 WHERE id = ? AND guild_id = ?').run(id, interaction.guildId!);
      await interaction.reply({ embeds: [success('Giveaway will end shortly')], ephemeral: true });
    }

    if (sub === 'reroll') {
      const id = interaction.options.getInteger('id', true);
      const g = db.prepare('SELECT * FROM giveaways WHERE id = ? AND guild_id = ?').get(id, interaction.guildId!) as GiveawayRow | undefined;
      if (!g) return interaction.reply({ embeds: [error('Not found')], ephemeral: true });
      const pool: string[] = JSON.parse(g.participants);
      if (!pool.length) return interaction.reply({ embeds: [error('No participants')], ephemeral: true });
      const winner = pool[Math.floor(Math.random() * pool.length)];
      await interaction.reply({ content: `🎊 Reroll: <@${winner}> wins **${g.prize}**!` });
    }
  },
};

export async function handleGiveawayButton(interaction: ButtonInteraction) {
  const g = db.prepare('SELECT * FROM giveaways WHERE message_id = ? AND ended = 0').get(interaction.message.id) as GiveawayRow | undefined;
  if (!g) { await interaction.reply({ content: 'This giveaway has ended.', ephemeral: true }); return; }

  const participants: string[] = JSON.parse(g.participants);
  if (participants.includes(interaction.user.id)) {
    participants.splice(participants.indexOf(interaction.user.id), 1);
    db.prepare('UPDATE giveaways SET participants = ? WHERE id = ?').run(JSON.stringify(participants), g.id);
    await interaction.reply({ content: '❌ You left the giveaway.', ephemeral: true });
  } else {
    participants.push(interaction.user.id);
    db.prepare('UPDATE giveaways SET participants = ? WHERE id = ?').run(JSON.stringify(participants), g.id);
    await interaction.reply({ content: `✅ You joined! ${participants.length} participants.`, ephemeral: true });
  }
}
