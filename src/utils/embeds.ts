import { EmbedBuilder, ColorResolvable } from 'discord.js';

const COLORS = {
  primary: '#5865f2' as ColorResolvable,
  success: '#57f287' as ColorResolvable,
  error: '#ed4245' as ColorResolvable,
  warn: '#fee75c' as ColorResolvable,
  info: '#5865f2' as ColorResolvable,
};

export function embed(color: keyof typeof COLORS = 'primary') {
  return new EmbedBuilder().setColor(COLORS[color]).setTimestamp();
}

export function success(title: string, desc?: string) {
  return embed('success').setTitle(`✅ ${title}`).setDescription(desc ?? null);
}

export function error(title: string, desc?: string) {
  return embed('error').setTitle(`❌ ${title}`).setDescription(desc ?? null);
}

export function warn(title: string, desc?: string) {
  return embed('warn').setTitle(`⚠️ ${title}`).setDescription(desc ?? null);
}

export function info(title: string, desc?: string) {
  return embed('info').setTitle(`ℹ️ ${title}`).setDescription(desc ?? null);
}

export function modEmbed(action: string, target: string, mod: string, reason: string) {
  return embed('error')
    .setTitle(`🔨 ${action}`)
    .addFields(
      { name: 'User', value: target, inline: true },
      { name: 'Moderator', value: mod, inline: true },
      { name: 'Reason', value: reason }
    );
}
