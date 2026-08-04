import { requireAdmin } from '../../utils/guards';
import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, TextChannel } from 'discord.js';
import type { Language } from '../../utils/localization';
import { setGuildValue, getGuild } from '../../database/db';
import { success, info } from '../../utils/embeds';

export default {
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Configure auto-moderation')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName('toggle').setDescription('Enable or disable automod')
      .addBooleanOption(o => o.setName('enabled').setDescription('On/Off').setRequired(true)))
    .addSubcommand(s => s.setName('antilink').setDescription('Toggle anti-link filter')
      .addBooleanOption(o => o.setName('enabled').setDescription('On/Off').setRequired(true)))
    .addSubcommand(s => s.setName('antispam').setDescription('Toggle anti-spam')
      .addBooleanOption(o => o.setName('enabled').setDescription('On/Off').setRequired(true)))
    .addSubcommand(s => s.setName('badwords').setDescription('Set bad words list (comma separated)')
      .addStringOption(o => o.setName('words').setDescription('word1,word2,...').setRequired(true)))
    .addSubcommand(s => s.setName('modlog').setDescription('Set moderation log channel')
      .addChannelOption(o => o.setName('channel').setDescription('Log channel').setRequired(true))),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!await requireAdmin(interaction as any)) return;
    const guild = getGuild(interaction.guildId!);
    const lang = (guild.language || 'en') as Language;
    const sub = interaction.options.getSubcommand();
    const gid = interaction.guildId!;

    if (sub === 'toggle') {
      const val = interaction.options.getBoolean('enabled', true) ? 1 : 0;
      setGuildValue(gid, 'automod_enabled', val);
      await interaction.reply({ embeds: [success('AutoMod', val ? 'Enabled' : 'Disabled')] });
    }

    if (sub === 'antilink') {
      const val = interaction.options.getBoolean('enabled', true) ? 1 : 0;
      setGuildValue(gid, 'automod_antilink', val);
      await interaction.reply({ embeds: [success('Anti-Link', val ? 'Enabled' : 'Disabled')] });
    }

    if (sub === 'antispam') {
      const val = interaction.options.getBoolean('enabled', true) ? 1 : 0;
      setGuildValue(gid, 'automod_antispam', val);
      await interaction.reply({ embeds: [success('Anti-Spam', val ? 'Enabled' : 'Disabled')] });
    }

    if (sub === 'badwords') {
      const words = interaction.options.getString('words', true).split(',').map(w => w.trim().toLowerCase());
      setGuildValue(gid, 'automod_badwords', JSON.stringify(words));
      await interaction.reply({ embeds: [success('Bad Words Updated', `${words.length} words in filter`)] });
    }

    if (sub === 'modlog') {
      const ch = interaction.options.getChannel('channel', true) as TextChannel;
      setGuildValue(gid, 'mod_log_channel', ch.id);
      await interaction.reply({ embeds: [success('Mod Log', `Set to ${ch}`)] });
    }
  },
};

// Note: antiinvite and anticaps subcommands are registered in the extended automod2.ts
// to avoid exceeding SlashCommandBuilder subcommand limits.
