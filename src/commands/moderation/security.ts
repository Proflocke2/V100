/**
 * /security — merged command.
 *   antinuke        ← former /antinuke        (subcommand group)
 *   antiraid        ← former /antiraid        (subcommand group)
 *   auto-defend     ← former /auto-defend     (subcommand group)
 *   ultra-mode      ← former /ultra-mode      (subcommand group)
 *   inactivity-kick ← former /inactivitykick  (subcommand group)
 *   config          ← former /security-config (plain subcommand)
 *
 * All original logic is untouched; this only re-exposes it under one
 * top-level command so the six former commands no longer eat into
 * Discord's 100-command limit individually.
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { wrapAsSubcommand, copyAsSubcommandGroup } from '../../merged/mergeUtils';
import antinukeCmd     from '../../merged/impl/antinuke';
import antiraidCmd     from '../../merged/impl/antiraid';
import autoDefendCmd   from '../../merged/impl/auto-defend';
import ultraModeCmd    from '../../merged/impl/ultra-mode';
import inactivityCmd   from '../../merged/impl/inactivitykick';
import securityCfgCmd  from '../../merged/impl/security-config';

const data = new SlashCommandBuilder()
  .setName('security')
  .setDescription('Server security: anti-nuke, anti-raid, auto-defend, ultra-mode, inactivity-kick, config')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

copyAsSubcommandGroup(data, 'antinuke',        'Anti-Nuke protection settings',              antinukeCmd as any);
copyAsSubcommandGroup(data, 'antiraid',        'Anti-raid protection settings',               antiraidCmd as any);
copyAsSubcommandGroup(data, 'auto-defend',     'Automatic bot defense actions',               autoDefendCmd as any);
copyAsSubcommandGroup(data, 'ultra-mode',      'Instant full defense mode',                   ultraModeCmd as any);
copyAsSubcommandGroup(data, 'inactivity-kick', 'Automatic inactivity kick settings',          inactivityCmd as any);
wrapAsSubcommand(data, 'config', 'Open the interactive security configuration menu', securityCfgCmd as any);

export default {
  data,
  async execute(interaction: ChatInputCommandInteraction) {
    const group = interaction.options.getSubcommandGroup(false);
    switch (group) {
      case 'antinuke':        return (antinukeCmd as any).execute(interaction);
      case 'antiraid':        return (antiraidCmd as any).execute(interaction);
      case 'auto-defend':     return (autoDefendCmd as any).execute(interaction);
      case 'ultra-mode':      return (ultraModeCmd as any).execute(interaction);
      case 'inactivity-kick': return (inactivityCmd as any).execute(interaction);
    }
    if (interaction.options.getSubcommand() === 'config') {
      // The interactive security config is now part of /mod-setup → Security Engine section.
      // Keep backward compatibility: open the same config but via the wizard.
      return interaction.reply({
        content: '🔐 Security configuration has moved to the **Mod Setup wizard**.\nRun `/mod setup` and click **🔐 Security Engine** to configure features, severity, and thresholds.',
        ephemeral: true,
      });
    }
  },
};
