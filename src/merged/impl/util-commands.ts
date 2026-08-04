/**
 * /commands — visual panel for enabling/disabling commands per server.
 *
 * The actual disable/enable DB logic is unchanged (disabled_commands table,
 * checked in interactionCreate.ts before any command runs). This command
 * is purely a better UI on top of the existing /disable + /enable commands —
 * instead of remembering command names, admins see a categorised list and
 * pick from a dropdown what to enable or disable.
 *
 * Protected commands (disable, enable, commands, deploy, admin) can never
 * be disabled — they are filtered out of the picker automatically.
 */

import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder,
  StringSelectMenuBuilder, ActionRowBuilder, MessageFlags,
  StringSelectMenuInteraction, ButtonBuilder, ButtonStyle, PermissionFlagsBits,
} from 'discord.js';
import { requireAdmin } from '../../utils/guards';
import {
  disableCommand, enableCommand, isCommandDisabled, listDisabledCommands,
} from '../../database/db';
import { BotClient } from '../../utils/types';
import { success } from '../../utils/embeds';
import { logConfigChange } from '../../modules/audit/configAudit';

// Commands that must never be disableable — admins can't lock themselves out.
const PROTECTED = new Set(['disable', 'enable', 'commands', 'deploy', 'admin', 'bot-backup', 'help', 'guide']);

// Category groupings — purely for display, not functional.
export const CATEGORIES: { label: string; emoji: string; commands: string[] }[] = [
  {
    label: 'Moderation',
    emoji: '🛡️',
    commands: ['mod', 'ban', 'timeout', 'purge', 'warnings'],
  },
  {
    label: 'Tickets & Applications',
    emoji: '🎫',
    commands: ['ticket', 'application'],
  },
  {
    label: 'Economy',
    emoji: '💰',
    commands: ['economy', 'pay', 'daily', 'blackjack', 'slots', 'eco-challenge'],
  },
  {
    label: 'Games',
    emoji: '🎮',
    commands: ['games', 'play', 'challenge'],
  },
  {
    label: 'Levels',
    emoji: '⭐',
    commands: ['level', 'rank'],
  },
  {
    label: 'Community',
    emoji: '💬',
    commands: ['help', 'guide', 'staff-guide', 'afk', 'cmd', 'suggest', 'quoteboard', 'birthday', 'giveaway', 'poll', 'remind'],
  },
  {
    label: 'Utility',
    emoji: '🔧',
    commands: ['setup', 'welcome', 'embed', 'sticky', 'server-backup', 'bot-backup', 'data', 'calc', 'info'],
  },
  {
    label: 'Staff & Bot-Admin',
    emoji: '🔨',
    commands: ['bot-admin', 'report-staff', 'chat-revival'],
  },
];

function buildOverviewEmbed(guildId: string, client: BotClient): EmbedBuilder {
  const disabled = new Set(listDisabledCommands(guildId));
  const allCommands = [...client.commands.keys()].filter(n => !PROTECTED.has(n)).sort();
  const disabledCount = [...disabled].filter(n => !PROTECTED.has(n)).length;

  const lines: string[] = [];
  for (const cat of CATEGORIES) {
    const cmds = cat.commands.filter(c => client.commands.has(c));
    if (!cmds.length) continue;
    const status = cmds.map(c => disabled.has(c) ? `~~/${c}~~` : `\`/${c}\``).join(' ');
    lines.push(`**${cat.emoji} ${cat.label}**\n${status}`);
  }

  // Uncategorised commands
  const categorised = new Set(CATEGORIES.flatMap(c => c.commands));
  const other = allCommands.filter(c => !categorised.has(c) && !PROTECTED.has(c));
  if (other.length) {
    lines.push(`**📦 Other**\n${other.map(c => disabled.has(c) ? `~~/${c}~~` : `\`/${c}\``).join(' ')}`);
  }

  return new EmbedBuilder()
    .setTitle('⚙️ Command Manager')
    .setColor('#5865f2')
    .setDescription(
      `**${allCommands.length}** commands available · **${disabledCount}** currently disabled on this server.\n\n` +
      'Strikethrough = disabled. Use the dropdowns below to enable or disable commands.\n\n' +
      lines.join('\n\n'),
    )
    .setFooter({ text: 'Protected commands (admin, commands, help, deploy, etc.) cannot be disabled.' });
}

function buildToggleMenu(guildId: string, client: BotClient, action: 'disable' | 'enable'): ActionRowBuilder<StringSelectMenuBuilder> | null {
  const disabled = new Set(listDisabledCommands(guildId));
  const pool = [...client.commands.keys()]
    .filter(n => !PROTECTED.has(n))
    .filter(n => action === 'disable' ? !disabled.has(n) : disabled.has(n))
    .sort()
    .slice(0, 25);

  if (!pool.length) return null;

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`cmdmgr:${action}`)
    .setPlaceholder(action === 'disable' ? '🔴 Select commands to disable…' : '🟢 Select commands to re-enable…')
    .setMinValues(1)
    .setMaxValues(Math.min(pool.length, 25))
    .addOptions(pool.map(n => ({ label: `/${n}`, value: n })));

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

export default {
  data: new SlashCommandBuilder()
    .setName('commands')
    .setDescription('Enable or disable specific commands for this server [Admin only]')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(ix: ChatInputCommandInteraction) {
    if (!await requireAdmin(ix)) return;
    const client = ix.client as BotClient;
    const gid    = ix.guildId!;

    const embed      = buildOverviewEmbed(gid, client);
    const disableRow = buildToggleMenu(gid, client, 'disable');
    const enableRow  = buildToggleMenu(gid, client, 'enable');

    const components = [
      ...(disableRow ? [disableRow] : []),
      ...(enableRow  ? [enableRow]  : []),
    ];

    await ix.reply({ embeds: [embed], components, flags: MessageFlags.Ephemeral });
  },
};

// ── Select handler (called from interactionCreate.ts) ─────────────────────────

export async function handleCommandManagerSelect(sel: StringSelectMenuInteraction): Promise<void> {
  const action = sel.customId.split(':')[1] as 'disable' | 'enable';
  const gid    = sel.guildId!;
  const client = sel.client as BotClient;
  const names  = sel.values;

  const done: string[] = [];
  for (const name of names) {
    if (PROTECTED.has(name)) continue;
    if (action === 'disable') {
      disableCommand(gid, name, sel.user.id);
      logConfigChange(gid, sel.user.id, 'command_disabled', `/${name}`);
    } else {
      enableCommand(gid, name);
      logConfigChange(gid, sel.user.id, 'command_enabled', `/${name}`);
    }
    done.push(`/${name}`);
  }

  // Rebuild the full panel
  const embed      = buildOverviewEmbed(gid, client);
  const disableRow = buildToggleMenu(gid, client, 'disable');
  const enableRow  = buildToggleMenu(gid, client, 'enable');
  const components = [
    ...(disableRow ? [disableRow] : []),
    ...(enableRow  ? [enableRow]  : []),
  ];

  const verb = action === 'disable' ? 'Disabled' : 'Enabled';
  await sel.update({
    embeds: [
      embed,
      new EmbedBuilder()
        .setColor(action === 'disable' ? '#ed4245' : '#57f287')
        .setDescription(`${verb}: ${done.join(', ')}`),
    ],
    components,
  });
}

export function isCommandManagerSelect(id: string): boolean {
  return id === 'cmdmgr:disable' || id === 'cmdmgr:enable';
}
