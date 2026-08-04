import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder,
  AutocompleteInteraction, MessageFlags,
} from 'discord.js';
import { getCommand, incrementUses, autocompleteNames } from '../../modules/customCommands/service';

export default {
  data: new SlashCommandBuilder()
    .setName('cmd')
    .setDescription('Run a custom command set up by the admins')
    .addStringOption(o => o
      .setName('name')
      .setDescription('Command name (start typing to search)')
      .setRequired(true)
      .setAutocomplete(true),
    ),

  async autocomplete(interaction: AutocompleteInteraction) {
    const partial = interaction.options.getFocused();
    const names   = autocompleteNames(interaction.guildId!, partial);
    await interaction.respond(names.map(n => ({ name: n, value: n }))).catch(() => {});
  },

  async execute(interaction: ChatInputCommandInteraction) {
    const name = interaction.options.getString('name', true).toLowerCase();
    const cmd  = getCommand(interaction.guildId!, name);

    if (!cmd) {
      return interaction.reply({
        content: `❌ No custom command named \`${name}\`. Admins can add one with \`/bot-admin custom-commands add\`.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    incrementUses(interaction.guildId!, name);

    const flags = cmd.ephemeral ? MessageFlags.Ephemeral : undefined;

    if (cmd.use_embed) {
      const embed = new EmbedBuilder()
        .setColor(cmd.color as `#${string}`)
        .setDescription(cmd.response);
      if (cmd.title) embed.setTitle(cmd.title);
      return interaction.reply({ embeds: [embed], flags });
    }

    return interaction.reply({ content: cmd.response, flags });
  },
};
