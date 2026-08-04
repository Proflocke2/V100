import {
  SlashCommandBuilder, ChatInputCommandInteraction,
  PermissionFlagsBits, EmbedBuilder, ChannelType,
} from 'discord.js';
import db, { getGuild, setGuildValue } from '../../database/db';
import { getLocalized, Language } from '../../utils/localization';
import { xpForLevel, levelFromXp } from '../../utils/helpers';
import { success, error, info } from '../../utils/embeds';

export default {
  data: new SlashCommandBuilder()
    .setName('level-setup')
    .setDescription('Configure the XP & level system')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s =>
      s.setName('toggle').setDescription('Enable or disable the level system')
        .addBooleanOption(o => o.setName('enabled').setDescription('true = on, false = off').setRequired(true))
    )
    .addSubcommand(s =>
      s.setName('channel').setDescription('Set the level-up announcement channel')
        .addChannelOption(o =>
          o.setName('channel').setDescription('Text channel (empty = same channel as message)').addChannelTypes(ChannelType.GuildText).setRequired(false)
        )
    )
    .addSubcommand(s =>
      s.setName('role').setDescription('Assign a role reward for a specific level')
        .addIntegerOption(o => o.setName('level').setDescription('Level that triggers the reward').setRequired(true).setMinValue(1).setMaxValue(200))
        .addRoleOption(o => o.setName('role').setDescription('Role to assign').setRequired(true))
    )
    .addSubcommand(s =>
      s.setName('remove-role').setDescription('Remove a level role reward')
        .addIntegerOption(o => o.setName('level').setDescription('Level whose reward should be removed').setRequired(true))
    )
    .addSubcommand(s =>
      s.setName('reset-user').setDescription('Reset XP and level for a user')
        .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
    )
    .addSubcommand(s =>
      s.setName('status').setDescription('Show current level system configuration')
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    const guild = getGuild(interaction.guildId!);
    const lang  = (guild.language || 'en') as Language;
    const sub   = interaction.options.getSubcommand();

    // ── toggle ─────────────────────────────────────────────────────────────────
    if (sub === 'toggle') {
      const enabled = interaction.options.getBoolean('enabled', true);
      setGuildValue(interaction.guildId!, 'level_enabled', enabled ? 1 : 0);
      const msg = enabled
        ? getLocalized('level.system_enabled', lang)
        : getLocalized('level.system_disabled', lang);
      await interaction.reply({ embeds: [success(msg)] });
    }

    // ── channel ────────────────────────────────────────────────────────────────
    if (sub === 'channel') {
      const channel = interaction.options.getChannel('channel');
      setGuildValue(interaction.guildId!, 'level_channel', channel?.id ?? null);
      const dest = channel ? `<#${channel.id}>` : 'current channel';
      await interaction.reply({ embeds: [success('Level-Up Channel', `Level-up messages will be sent to ${dest}`)] });
    }

    // ── role ───────────────────────────────────────────────────────────────────
    if (sub === 'role') {
      const level = interaction.options.getInteger('level', true);
      const role  = interaction.options.getRole('role', true);
      const roles: Record<string, string> = JSON.parse(guild.level_roles || '{}');
      roles[String(level)] = role.id;
      setGuildValue(interaction.guildId!, 'level_roles', JSON.stringify(roles));
      await interaction.reply({
        embeds: [success(
          getLocalized('level.reward_added', lang, { role: role.toString(), level: String(level) }),
          `Users reaching level ${level} will receive ${role}`
        )],
      });
    }

    // ── remove-role ────────────────────────────────────────────────────────────
    if (sub === 'remove-role') {
      const level = interaction.options.getInteger('level', true);
      const roles: Record<string, string> = JSON.parse(guild.level_roles || '{}');
      if (!roles[String(level)]) {
        await interaction.reply({ embeds: [error(`No reward set for level ${level}`)], ephemeral: true });
        return;
      }
      delete roles[String(level)];
      setGuildValue(interaction.guildId!, 'level_roles', JSON.stringify(roles));
      await interaction.reply({
        embeds: [success(getLocalized('level.reward_removed', lang, { level: String(level) }))],
      });
    }

    // ── reset-user ─────────────────────────────────────────────────────────────
    if (sub === 'reset-user') {
      const target = interaction.options.getUser('user', true);
      db.prepare('UPDATE users SET xp = 0, level = 0, messages = 0 WHERE id = ? AND guild_id = ?')
        .run(target.id, interaction.guildId!);
      await interaction.reply({
        embeds: [success(getLocalized('level.reset', lang, { user: target.username }))],
      });
    }

    // ── status ─────────────────────────────────────────────────────────────────
    if (sub === 'status') {
      const fresh = getGuild(interaction.guildId!);
      const roles: Record<string, string> = JSON.parse(fresh.level_roles || '{}');
      const roleList = Object.entries(roles).length
        ? Object.entries(roles).sort(([a], [b]) => Number(a) - Number(b))
            .map(([lvl, id]) => `Level **${lvl}** → <@&${id}>`).join('\n')
        : 'None configured';

      const embed = new EmbedBuilder()
        .setTitle(`⚙️ ${getLocalized('level.config', lang)}`)
        .setColor('#5865f2')
        .addFields(
          { name: '📊 Status',       value: fresh.level_enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
          { name: '📣 Channel',      value: fresh.level_channel ? `<#${fresh.level_channel}>` : 'Current channel', inline: true },
          { name: '🎖️ Role Rewards', value: roleList, inline: false },
          { name: '📐 XP Formula',   value: '`xp = 100 × level^1.5` (cumulative)', inline: false },
          { name: '⚡ XP per Message', value: '15–25 XP (30s cooldown)', inline: true },
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }
  },
};
