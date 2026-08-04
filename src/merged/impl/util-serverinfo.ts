import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { getGuild } from '../../database/db';
import { getLocalized, Language } from '../../utils/localization';

export default {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Show server info'),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = getGuild(interaction.guildId!);
    const lang = (guild.language || 'en') as Language;
    
    const g = interaction.guild!;
    await g.fetch();

    const embed = new EmbedBuilder()
      .setTitle(g.name)
      .setThumbnail(g.iconURL({ size: 256 }) ?? null)
      .setColor('#5865f2')
      .addFields(
        { name: getLocalized('serverinfo.owner', lang), value: `<@${g.ownerId}>`, inline: true },
        { name: getLocalized('serverinfo.members', lang), value: g.memberCount.toString(), inline: true },
        { name: getLocalized('serverinfo.channels', lang), value: g.channels.cache.size.toString(), inline: true },
        { name: getLocalized('serverinfo.roles', lang), value: g.roles.cache.size.toString(), inline: true },
        { name: 'Boost Level', value: String(g.premiumTier), inline: true },
        { name: 'Boosts', value: String(g.premiumSubscriptionCount ?? 0), inline: true },
        { name: getLocalized('serverinfo.created', lang), value: `<t:${Math.floor(g.createdTimestamp / 1000)}:R>`, inline: true },
        { name: 'Verification', value: g.verificationLevel.toString(), inline: true },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
