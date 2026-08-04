import { SlashCommandBuilder, ChatInputCommandInteraction, ChannelType, PermissionFlagsBits } from 'discord.js';
import { requireAdmin } from '../../utils/guards';
import { executeApplyPanel } from '../../modules/applyPanel/service';

export default {
  data: new SlashCommandBuilder()
    .setName('apply-panel')
    .setDescription('Multi-form apply panels — combine multiple applications in one dropdown [Admin]')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    .addSubcommand(s => s.setName('list').setDescription('List all apply panels'))
    .addSubcommand(s => s.setName('create').setDescription('Create a new apply panel')
      .addStringOption(o => o.setName('name').setDescription('Internal panel name').setRequired(true).setMaxLength(100)))
    .addSubcommand(s => s.setName('edit').setDescription('Edit a panel — set title, description, color, and pick which forms to include')
      .addIntegerOption(o => o.setName('id').setDescription('Panel ID').setRequired(true))
      .addStringOption(o => o.setName('title').setDescription('Embed title shown to users').setMaxLength(100))
      .addStringOption(o => o.setName('description').setDescription('Embed description (instructions, etc.)').setMaxLength(1000))
      .addStringOption(o => o.setName('color').setDescription('Embed color hex (e.g. #ff6b35)')))
    .addSubcommand(s => s.setName('post').setDescription('Post the panel to a channel')
      .addIntegerOption(o => o.setName('id').setDescription('Panel ID').setRequired(true))
      .addChannelOption(o => o.setName('channel').setDescription('Channel (overrides saved channel)').addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(s => s.setName('delete').setDescription('Delete a panel record')
      .addIntegerOption(o => o.setName('id').setDescription('Panel ID').setRequired(true))),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!await requireAdmin(interaction)) return;
    await executeApplyPanel(interaction);
  },
};
