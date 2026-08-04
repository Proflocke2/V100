import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, ChannelType,
} from 'discord.js';
import { requireAdmin } from '../../utils/guards';
import {
  addRevivalChannel, removeRevivalChannel, listRevivalChannels,
  addPrompt, removePrompt, listPrompts,
} from '../../modules/chatRevival/service';
import { success, error } from '../../utils/embeds';

export default {
  data: new SlashCommandBuilder()
    .setName('chat-revival')
    .setDescription('Auto-post a conversation starter when a channel goes quiet [Admins only]')

    .addSubcommandGroup(group => group
      .setName('channel')
      .setDescription('Manage which channels get revived and how')
      .addSubcommand(sub => sub
        .setName('add')
        .setDescription('Enable revival for a channel (or update its settings if already added)')
        .addChannelOption(o => o.setName('channel').setDescription('The channel').setRequired(true).addChannelTypes(ChannelType.GuildText))
        .addNumberOption(o => o.setName('hours').setDescription('Hours of silence before the bot posts (e.g. 6, 0.5)').setRequired(true).setMinValue(0.1).setMaxValue(168))
        .addRoleOption(o => o.setName('ping_role').setDescription('Role to ping when it fires (omit for no ping)')))
      .addSubcommand(sub => sub
        .setName('remove')
        .setDescription('Disable revival for a channel')
        .addChannelOption(o => o.setName('channel').setDescription('The channel').setRequired(true)))
      .addSubcommand(sub => sub
        .setName('list')
        .setDescription('Show all channels currently configured')))

    .addSubcommandGroup(group => group
      .setName('prompt')
      .setDescription('Manage the custom conversation-starter pool')
      .addSubcommand(sub => sub
        .setName('add')
        .setDescription('Add a prompt to this server\'s pool')
        .addStringOption(o => o.setName('text').setDescription('The question/prompt text').setRequired(true).setMaxLength(300))
        .addStringOption(o => o.setName('poll_options').setDescription('Comma-separated options to make this a reaction poll (max 5), omit for a plain question')))
      .addSubcommand(sub => sub
        .setName('remove')
        .setDescription('Remove a prompt by its ID (see /chat-revival prompt list)')
        .addIntegerOption(o => o.setName('id').setDescription('Prompt ID').setRequired(true)))
      .addSubcommand(sub => sub
        .setName('list')
        .setDescription('Show this server\'s custom prompt pool'))),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!await requireAdmin(interaction)) return;

    const group = interaction.options.getSubcommandGroup(true);
    const sub   = interaction.options.getSubcommand(true);
    const guildId = interaction.guildId!;

    if (group === 'channel') {
      if (sub === 'add') {
        const channel = interaction.options.getChannel('channel', true);
        const hours   = interaction.options.getNumber('hours', true);
        const role    = interaction.options.getRole('ping_role');
        addRevivalChannel(guildId, channel.id, hours, role?.id ?? null, interaction.user.id);
        const pingNote = role ? `, pinging <@&${role.id}>` : ', no role ping';
        await interaction.reply({
          embeds: [success('Revival channel set', `<#${channel.id}> will get a prompt after **${hours}h** of silence${pingNote}.`)],
          ephemeral: true,
        });
        return;
      }

      if (sub === 'remove') {
        const channel = interaction.options.getChannel('channel', true);
        const removed = removeRevivalChannel(guildId, channel.id);
        await interaction.reply({
          embeds: [removed
            ? success('Removed', `<#${channel.id}> will no longer get revival prompts.`)
            : error('Not found', `<#${channel.id}> wasn't configured for revival.`)],
          ephemeral: true,
        });
        return;
      }

      // list
      const rows = listRevivalChannels(guildId);
      if (!rows.length) {
        await interaction.reply({ embeds: [error('No revival channels configured', 'Add a channel with `/chat-revival channel add channel:#channel silence_hours:4` — the bot will post a conversation starter when the channel has been quiet for that long.')], ephemeral: true });
        return;
      }
      const lines = rows.map(r => `<#${r.channel_id}> — every **${r.silence_hours}h** of silence${r.ping_role_id ? `, pings <@&${r.ping_role_id}>` : ''}`);
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor('#ff6b35').setTitle('💬 Revival channels').setDescription(lines.join('\n'))],
        ephemeral: true,
      });
      return;
    }

    if (group === 'prompt') {
      if (sub === 'add') {
        const text = interaction.options.getString('text', true);
        const optsRaw = interaction.options.getString('poll_options');
        let options: string[] | null = null;
        if (optsRaw) {
          options = optsRaw.split(',').map(s => s.trim()).filter(Boolean).slice(0, 5);
          if (options.length < 2) {
            await interaction.reply({ embeds: [error('Invalid poll', 'Give at least 2 comma-separated options, or omit poll_options for a plain question.')], ephemeral: true });
            return;
          }
        }
        const id = addPrompt(guildId, text, options, interaction.user.id);
        await interaction.reply({
          embeds: [success('Prompt added', `**#${id}**: ${text}${options ? `\nOptions: ${options.join(' / ')}` : ''}`)],
          ephemeral: true,
        });
        return;
      }

      if (sub === 'remove') {
        const id = interaction.options.getInteger('id', true);
        const removed = removePrompt(guildId, id);
        await interaction.reply({
          embeds: [removed ? success('Removed', `Prompt #${id} deleted.`) : error('Not found', `No prompt #${id} on this server.`)],
          ephemeral: true,
        });
        return;
      }

      // list
      const prompts = listPrompts(guildId);
      if (!prompts.length) {
        await interaction.reply({
          embeds: [new EmbedBuilder().setColor('#ff6b35').setTitle('💬 Prompt pool').setDescription("No custom prompts yet — using the built-in default pool. Add one with `/chat-revival prompt add`.")],
          ephemeral: true,
        });
        return;
      }
      const lines = prompts.map(p => `**#${p.id}** — ${p.prompt_text}${p.is_poll ? ` *(poll: ${(JSON.parse(p.poll_options!) as string[]).join(' / ')})*` : ''}`);
      await interaction.reply({
        embeds: [new EmbedBuilder().setColor('#ff6b35').setTitle('💬 Prompt pool').setDescription(lines.join('\n'))],
        ephemeral: true,
      });
    }
  },
};
