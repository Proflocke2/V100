import { GuildMember, PermissionResolvable, ChatInputCommandInteraction } from 'discord.js';

export function msToTime(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export function parseDuration(str: string): number | null {
  const match = str.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return null;
  const n = parseInt(match[1]);
  const map: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return n * map[match[2]];
}

export function hasPerms(member: GuildMember, ...perms: PermissionResolvable[]) {
  return perms.every(p => member.permissions.has(p));
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

export function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function xpForLevel(level: number) {
  return Math.floor(100 * Math.pow(level, 1.5));
}

export function levelFromXp(xp: number) {
  let level = 0;
  while (xp >= xpForLevel(level + 1)) {
    xp -= xpForLevel(level + 1);
    level++;
  }
  return level;
}

export function formatTimestamp(unix: number, style: 'R' | 'F' | 'D' = 'R') {
  return `<t:${unix}:${style}>`;
}

export async function deferIfNeeded(interaction: ChatInputCommandInteraction) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply();
  }
}

export function replacePlaceholders(
  text: string,
  replacements: Record<string, string>
): string {
  return Object.entries(replacements).reduce(
    (acc, [key, val]) => acc.replaceAll(`{${key}}`, val),
    text
  );
}
