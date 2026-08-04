/**
 * /disable — deactivates a slash command for this server only.
 *
 * The check happens centrally in interactionCreate.ts BEFORE execute() is
 * ever called, so a disabled command is fully inert — no side effects, no
 * DB writes, nothing. "disable" and "enable" (and "deploy") are protected
 * so an admin can never lock the server out of undoing this.
 */

import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  PermissionFlagsBits,
} from 'discord.js';
import { disableCommand, isCommandDisabled } from '../../database/db';
import { success, error } from '../../utils/embeds';
import { BotClient } from '../../utils/types';
import { MODULE_HOOKS } from '../../utils/moduleHooks';
import { logConfigChange } from '../../modules/audit/configAudit';

const PROTECTED = new Set(['disable', 'enable', 'deploy']);

export default {
  data: new SlashCommandBuilder()
    .setName('disable')
    .setDescription('Deactivate a command for this server. Use /commands for a visual overview and multi-select.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(o =>
      o.setName('command')
        .setDescription('The command to disable')
        .setRequired(true)
        .setAutocomplete(true),
    ),

  async autocomplete(interaction: AutocompleteInteraction) {
    const client  = interaction.client as BotClient;
    const guildId = interaction.guildId;
    const focused = interaction.options.getFocused().toLowerCase();
    if (!guildId) return interaction.respond([]).catch(() => {});

    const choices = [...client.commands.keys()]
      .filter(name => !PROTECTED.has(name))
      .filter(name => !isCommandDisabled(guildId, name))
      .filter(name => name.includes(focused))
      .sort()
      .slice(0, 25)
      .map(name => ({ name: `/${name}`, value: name }));

    await interaction.respond(choices).catch(() => {});
  },

  async execute(interaction: ChatInputCommandInteraction) {
    const name    = interaction.options.getString('command', true).toLowerCase().trim();
    const guildId = interaction.guildId!;
    const client  = interaction.client as BotClient;

    if (PROTECTED.has(name)) {
      await interaction.reply({
        embeds: [error('Cannot disable', `\`/${name}\` is protected so you can't lock yourself out.`)],
        ephemeral: true,
      });
      return;
    }

    if (!client.commands.has(name)) {
      await interaction.reply({
        embeds: [error('Unknown command', `\`/${name}\` does not exist.`)],
        ephemeral: true,
      });
      return;
    }

    if (isCommandDisabled(guildId, name)) {
      await interaction.reply({
        embeds: [error('Already disabled', `\`/${name}\` is already disabled on this server.`)],
        ephemeral: true,
      });
      return;
    }

    disableCommand(guildId, name, interaction.user.id);
    logConfigChange(guildId, interaction.user.id, 'command_disabled', `/${name}`);

    const hook = MODULE_HOOKS[name];
    if (hook) {
      try {
        hook.onDisable(guildId);
      } catch (err) {
        console.error(`[Disable] module hook failed for "${name}":`, err);
      }
    }

    const extra = hook
      ? ' The underlying system (background XP/checks/etc.) has been turned off too, not just the command.'
      : '';

    await interaction.reply({
      embeds: [success(
        'Command disabled',
        `\`/${name}\` can no longer be used on this server.${extra}\nRe-enable it any time with \`/enable command:${name}\`.`,
      )],
      ephemeral: true,
    });
  },
};
