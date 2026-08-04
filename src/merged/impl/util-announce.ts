import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, EmbedBuilder, TextChannel } from 'discord.js';
import { promptText } from '../../utils/modalText';

export default {
  data: new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Make an announcement')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addChannelOption(o => o.setName('channel').setDescription('Target channel').setRequired(true))
    .addRoleOption(o => o.setName('ping').setDescription('Role to ping'))
    .addBooleanOption(o => o.setName('embed').setDescription('Use embed (default: true)')),

  async execute(interaction: ChatInputCommandInteraction) {
    const ch       = interaction.options.getChannel('channel', true) as TextChannel;
    const ping     = interaction.options.getRole('ping');
    const useEmbed = interaction.options.getBoolean('embed') ?? true;

    // Modal → real line breaks, formatting is preserved
    const result = await promptText(interaction, {
      title:       'Announcement',
      label:       'Announcement text (markdown supported)',
      placeholder: 'Write your announcement here...\n\nLine breaks work!',
      maxLength:   2000,
      required:    true,
    });
    if (result === null) return;

    const msg     = result.text;
    const content = ping ? `${ping}` : undefined;

    if (useEmbed) {
      await ch.send({
        content,
        embeds: [new EmbedBuilder()
          .setTitle('📢 Announcement')
          .setDescription(msg)
          .setColor('#5865f2')
          .setFooter({ text: `By ${interaction.user.tag}` })
          .setTimestamp()],
      });
    } else {
      await ch.send({ content: `${content ? content + '\n' : ''}${msg}` });
    }

    return result.modal.reply({ content: `Announcement sent to ${ch}`, ephemeral: true });
  },
};
