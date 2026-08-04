/**
 * events/guildCreate.ts
 *
 * Fires once when the bot joins a new server.
 *
 * 1. Registers all slash commands in the new guild immediately.
 * 2. Sends a welcome message in the first writable channel AND a DM to the owner.
 *    The channel message is more likely to be seen since owner DMs are often closed.
 */

import { Guild, EmbedBuilder, TextChannel } from 'discord.js';
import { deployToGuild } from '../handlers/deploy';

const SETUP_EMBED = (guildName: string) => new EmbedBuilder()
  .setColor('#ff6b35')
  .setTitle(`👋 Thanks for adding me to ${guildName}!`)
  .setDescription(
    '**Start here — everything is interactive, nothing to memorize:**\n\n' +
    '🖥️ `/admin dashboard` — full status overview + one-click access to all setup wizards\n' +
    '🛡️ `/mod setup` — AutoMod, Security Engine, Anti-Raid, Anti-Nuke, Warn escalation\n' +
    '🎫 `/ticket setup` — Ticket channels, limits, auto-close, staff roles\n' +
    '👋 `/welcome` — Welcome & leave messages for new members\n' +
    '📖 `/help` — Browse all commands by category\n\n' +
    '**Recommended first steps:**\n' +
    '1. Run `/admin dashboard` to see what\'s configured and what isn\'t\n' +
    '2. Run `/mod setup` to protect your server\n' +
    '3. Run `/ticket setup` if you want a support system',
  )
  .setFooter({ text: 'This message is sent once when the bot joins.' })
  .setTimestamp();

export default {
  async execute(guild: Guild) {
    // ── 1. Deploy commands ────────────────────────────────────────────────────
    if (process.env.BOT_TOKEN && process.env.CLIENT_ID) {
      try {
        const result = await deployToGuild(process.env.BOT_TOKEN, process.env.CLIENT_ID, guild.id);
        const status = result.ok ? `${result.registered} commands deployed` : 'deploy failed';
        console.log(`[GuildCreate] ${guild.name} (${guild.id}): ${status}`);
      } catch (err) {
        console.error(`[GuildCreate] Deploy failed for ${guild.id} (non-fatal):`, err);
      }
    }

    // ── 2. Welcome message in channel ─────────────────────────────────────────
    // Try system channel first, then first writable text channel.
    try {
      const channelTarget =
        (guild.systemChannel?.permissionsFor(guild.members.me!)?.has('SendMessages')
          ? guild.systemChannel
          : null) ??
        guild.channels.cache
          .filter(c =>
            c.isTextBased() &&
            !c.isDMBased() &&
            (c as TextChannel).permissionsFor?.(guild.members.me!)?.has('SendMessages')
          )
          .first() as TextChannel | undefined;

      if (channelTarget && 'send' in channelTarget) {
        await channelTarget.send({ embeds: [SETUP_EMBED(guild.name)] }).catch(() => {});
      }
    } catch (err) {
      console.error('[GuildCreate] Channel welcome message failed (non-fatal):', err);
    }

    // ── 3. Owner DM (backup — often closed) ──────────────────────────────────
    try {
      const owner = await guild.fetchOwner().catch(() => null);
      if (owner) {
        await owner.send({ embeds: [SETUP_EMBED(guild.name)] }).catch(() => {});
      }
    } catch (err) {
      console.error('[GuildCreate] Owner DM failed (non-fatal):', err);
    }
  },
};
