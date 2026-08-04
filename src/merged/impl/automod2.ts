import { requireAdmin } from '../../utils/guards';
/**
 * /automod2 — Extended AutoMod filters (caps, invite, log-channel).
 *
 * Kept separate from /automod to avoid Discord's 25-subcommand limit.
 */

import {
  SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits,
  ChannelType, TextChannel,
} from 'discord.js';
import { setGuildValue, getGuild } from '../../database/db';
import { success } from '../../utils/embeds';

export default {
  data: new SlashCommandBuilder()
    .setName('automod2')
    .setDescription('Extended AutoMod filters')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    .addSubcommand(s => s.setName('anticaps').setDescription('Filter messages with >70% caps')
      .addBooleanOption(o => o.setName('enabled').setDescription('On/Off').setRequired(true)))

    .addSubcommand(s => s.setName('antiinvite').setDescription('Block Discord invite links')
      .addBooleanOption(o => o.setName('enabled').setDescription('On/Off').setRequired(true)))

    .addSubcommand(s => s.setName('logchannel').setDescription('Set the mod-log channel: deleted/edited messages + reactions')
      .addChannelOption(o => o.setName('channel').setDescription('Log channel')
        .addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addRoleOption(o => o.setName('viewer_role').setDescription('If set, locks the channel to only this role (+ the bot) can view it'))),

  async execute(ix: ChatInputCommandInteraction) {
    if (!await requireAdmin(ix)) return;
    const sub = ix.options.getSubcommand();
    const gid = ix.guildId!;

    if (sub === 'anticaps') {
      const val = ix.options.getBoolean('enabled', true) ? 1 : 0;
      setGuildValue(gid, 'automod_anticaps', val);
      return ix.reply({ embeds: [success('Anti-Caps', val ? '✅ Enabled — messages with >70% uppercase letters will be deleted.' : '❌ Disabled.')] });
    }

    if (sub === 'antiinvite') {
      const val = ix.options.getBoolean('enabled', true) ? 1 : 0;
      setGuildValue(gid, 'automod_antiinvite', val);
      return ix.reply({ embeds: [success('Anti-Invite', val ? '✅ Enabled — Discord invite links will be blocked.' : '❌ Disabled.')] });
    }

    if (sub === 'logchannel') {
      const ch = ix.options.getChannel('channel', true) as TextChannel;
      const viewerRole = ix.options.getRole('viewer_role');
      setGuildValue(gid, 'mod_log_channel', ch.id);

      if (!viewerRole) {
        return ix.reply({
          embeds: [success('Mod-Log Channel', `Deleted/edited messages and reactions will now be logged to ${ch}.\n\n💡 Tip: re-run this with \`viewer_role\` set to automatically restrict who can see this channel.`)],
        });
      }

      // Privacy lock: deny @everyone, allow only the chosen role (+ the bot).
      let locked = true;
      try {
        const guild = ix.guild!;
        const channel = await guild.channels.fetch(ch.id) as TextChannel | null;
        if (channel) {
          await channel.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: false });
          await channel.permissionOverwrites.edit(viewerRole.id, { ViewChannel: true, ReadMessageHistory: true });
          await channel.permissionOverwrites.edit(guild.members.me!.id, { ViewChannel: true, SendMessages: true, EmbedLinks: true });
        } else {
          locked = false;
        }
      } catch {
        locked = false;
      }

      const note = locked
        ? `\n\n🔒 ${ch} permissions updated — only <@&${viewerRole.id}> (and the bot) can view it now.`
        : `\n\n⚠️ Couldn't update ${ch} permissions automatically (missing "Manage Roles/Channels"?). Please restrict access to <@&${viewerRole.id}> manually.`;

      return ix.reply({
        embeds: [success('Mod-Log Channel', `Deleted/edited messages and reactions will now be logged to ${ch}.${note}`)],
      });
    }
  },
};
