import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder,
  AutocompleteInteraction, PermissionFlagsBits, MessageFlags,
} from 'discord.js';
import { requireAdmin } from '../../utils/guards';
import { success, error, info } from '../../utils/embeds';
import {
  listCommands, upsertCommand, deleteCommand, getCommand, autocompleteNames,
} from '../../modules/customCommands/service';

export default {
  data: new SlashCommandBuilder()
    .setName('cmd-admin')
    .setDescription('Manage custom slash commands for this server [Admins only]')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    .addSubcommand(s => s.setName('add').setDescription('Add or overwrite a custom command')
      .addStringOption(o => o.setName('name').setDescription('Command name (no spaces, lowercase)').setRequired(true).setMaxLength(32))
      .addStringOption(o => o.setName('response').setDescription('Text the bot sends').setRequired(true).setMaxLength(2000))
      .addBooleanOption(o => o.setName('use_embed').setDescription('Wrap the response in an embed? (default: no)'))
      .addStringOption(o => o.setName('title').setDescription('Embed title (only used when use_embed is on)').setMaxLength(256))
      .addStringOption(o => o.setName('color').setDescription('Embed color hex (e.g. #ff6b35, only used with embed)').setMaxLength(7))
      .addBooleanOption(o => o.setName('ephemeral').setDescription('Only visible to the person who runs it? (default: no)')))

    .addSubcommand(s => s.setName('remove').setDescription('Remove a custom command')
      .addStringOption(o => o.setName('name').setDescription('Command name').setRequired(true).setAutocomplete(true)))

    .addSubcommand(s => s.setName('list').setDescription('List all custom commands on this server'))

    .addSubcommand(s => s.setName('info').setDescription('Show details about a custom command')
      .addStringOption(o => o.setName('name').setDescription('Command name').setRequired(true).setAutocomplete(true))),

  async autocomplete(interaction: AutocompleteInteraction) {
    const partial = interaction.options.getFocused();
    const names   = autocompleteNames(interaction.guildId!, partial);
    await interaction.respond(names.map(n => ({ name: n, value: n }))).catch(() => {});
  },

  async execute(interaction: ChatInputCommandInteraction) {
    if (!await requireAdmin(interaction)) return;

    const sub     = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;

    if (sub === 'add') {
      const rawName = interaction.options.getString('name', true).toLowerCase().trim().replace(/\s+/g, '-');
      if (!/^[a-z0-9-_]{1,32}$/.test(rawName)) {
        return interaction.reply({ embeds: [error('Invalid name', 'Use only lowercase letters, numbers, hyphens, and underscores.')], flags: MessageFlags.Ephemeral });
      }

      const response  = interaction.options.getString('response', true);
      const useEmbed  = interaction.options.getBoolean('use_embed') ?? false;
      const title     = interaction.options.getString('title');
      const rawColor  = interaction.options.getString('color') ?? '#5865f2';
      const color     = /^#[0-9a-fA-F]{6}$/.test(rawColor) ? rawColor : '#5865f2';
      const ephemeral = interaction.options.getBoolean('ephemeral') ?? false;

      const existed = !!getCommand(guildId, rawName);
      upsertCommand(guildId, rawName, response, title ?? null, color, useEmbed, ephemeral, interaction.user.id);

      return interaction.reply({
        embeds: [success(
          existed ? `Updated \`${rawName}\`` : `Created \`${rawName}\``,
          `Users can now run \`/cmd name:${rawName}\`${ephemeral ? ' (ephemeral)' : ''}.`,
        )],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'remove') {
      const name    = interaction.options.getString('name', true).toLowerCase();
      const removed = deleteCommand(guildId, name);
      return interaction.reply({
        embeds: [removed ? success('Removed', `\`${name}\` deleted.`) : error('Not found', `No command \`${name}\`.`)],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'list') {
      const cmds = listCommands(guildId);
      if (!cmds.length) {
        return interaction.reply({ embeds: [info('No custom commands', 'Add one with `/cmd-admin add`.')], flags: MessageFlags.Ephemeral });
      }
      const lines = cmds.map(c =>
        `\`${c.name}\`${c.use_embed ? ' 📦' : ''}${c.ephemeral ? ' 👤' : ''} — ${c.uses} use${c.uses === 1 ? '' : 's'}`
      );
      const pages: string[] = [];
      for (let i = 0; i < lines.length; i += 30) pages.push(lines.slice(i, i + 30).join('\n'));
      return interaction.reply({
        embeds: pages.map((p, i) => new EmbedBuilder()
          .setColor('#5865f2')
          .setTitle(i === 0 ? `⚡ Custom Commands (${cmds.length})` : null)
          .setDescription(p)
          .setFooter(i === 0 ? { text: '📦 = embed  •  👤 = ephemeral' } : null)),
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'info') {
      const name = interaction.options.getString('name', true).toLowerCase();
      const cmd  = getCommand(guildId, name);
      if (!cmd) return interaction.reply({ embeds: [error('Not found', `No command \`${name}\`.`)], flags: MessageFlags.Ephemeral });
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor('#5865f2')
          .setTitle(`⚡ \`${cmd.name}\``)
          .addFields(
            { name: 'Type',      value: cmd.use_embed ? 'Embed' : 'Plain text', inline: true },
            { name: 'Ephemeral', value: cmd.ephemeral ? 'Yes' : 'No', inline: true },
            { name: 'Uses',      value: String(cmd.uses), inline: true },
            { name: 'Response',  value: cmd.response.slice(0, 1000) },
          )
          .setFooter({ text: `Created by ${cmd.created_by} • <t:${cmd.created_at}:R>` })],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
