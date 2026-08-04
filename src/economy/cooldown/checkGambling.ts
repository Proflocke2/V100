import { ChatInputCommandInteraction } from 'discord.js';
import { GamblingCooldown } from './GamblingCooldown';
import { getGuild } from '../../database/db';
import { getLocalized, Language } from '../../utils/localization';
import { error } from '../../utils/embeds';

function formatMs(ms: number): string {
  const totalSecs = Math.ceil(ms / 1_000);
  const mins      = Math.floor(totalSecs / 60);
  const secs      = totalSecs % 60;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${totalSecs}s`;
}

export async function checkGambling(
  interaction: ChatInputCommandInteraction,
  userId: string,
  guildId: string,
): Promise<boolean> {
  const guild   = getGuild(guildId);
  const lang    = (guild.language || 'en') as Language;
  const cdMs    = typeof guild.gambling_cooldown_ms === 'number'
    ? guild.gambling_cooldown_ms
    : GamblingCooldown.GLOBAL_CD_MS;
  const block   = GamblingCooldown.check(userId, guildId, cdMs);
  if (!block) return true;
  const time  = formatMs(block.remainingMs);

  const title = block.reason === 'cooldown'
    ? getLocalized('economy.cooldown.wait_title', lang)
    : getLocalized('economy.cooldown.session_title', lang);
  const description = block.reason === 'cooldown'
    ? getLocalized('economy.cooldown.wait_desc', lang, { time })
    : getLocalized('economy.cooldown.session_desc', lang, { time });

  // Always reply() — always called before sendGamblingDisclaimer
  await interaction.reply({ embeds: [error(title, description)], ephemeral: true });
  return false;
}
