/**
 * /guide — in-Discord, button-navigable command reference.
 * Replaces the old /help guide website link. Pages are generated from the
 * same category list used by /bot-admin commands (util-commands.ts), and
 * descriptions are pulled live from the registered command data, so this
 * never drifts out of sync when commands change.
 *
 * Navigation: ◀ ▶ buttons (customId guide:nav:<pageIndex>), same pattern as
 * the staff guide and setup wizards.
 */

import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ButtonInteraction, MessageFlags,
} from 'discord.js';
import { BotClient } from '../../utils/types';
import { CATEGORIES } from '../../merged/impl/util-commands';

function buildGuidePage(client: BotClient, pageIndex: number) {
  const total = CATEGORIES.length;
  const idx = Math.max(0, Math.min(total - 1, pageIndex));
  const cat = CATEGORIES[idx];

  const lines = cat.commands.map(name => {
    const cmd = client.commands.get(name) as any;
    if (!cmd) return null;
    const desc: string = cmd.data?.description ?? '';
    return `**/${name}** — ${desc}`;
  }).filter(Boolean);

  const embed = new EmbedBuilder()
    .setColor('#ff6b35')
    .setTitle(`${cat.emoji} ${cat.label}`)
    .setDescription(lines.length ? lines.join('\n') : '*No commands available here.*')
    .setFooter({ text: `Page ${idx + 1} of ${total} · /guide` });

  const prev = new ButtonBuilder().setCustomId(`guide:nav:${idx - 1}`).setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(idx <= 0);
  const next = new ButtonBuilder().setCustomId(`guide:nav:${idx + 1}`).setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(idx >= total - 1);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(prev, next);

  return { embeds: [embed], components: [row] };
}

export async function handleGuideNav(btn: ButtonInteraction, client: BotClient): Promise<void> {
  const page = parseInt(btn.customId.split(':')[2], 10);
  await btn.update(buildGuidePage(client, page));
}

export function isGuideNavButton(customId: string): boolean {
  return customId.startsWith('guide:nav:');
}

export default {
  data: new SlashCommandBuilder()
    .setName('guide')
    .setDescription('Browse all bot commands, explained page by page'),

  async execute(interaction: ChatInputCommandInteraction, client: BotClient) {
    await interaction.reply({ ...buildGuidePage(client, 0), flags: MessageFlags.Ephemeral });
  },
};
