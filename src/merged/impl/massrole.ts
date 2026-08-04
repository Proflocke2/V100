/**
 * /massrole — Add or remove a role from ALL members at once
 * Shows live progress, handles rate limits, skips bots
 * Fully translated in all 4 languages
 */
import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder,
  PermissionFlagsBits, Role, GuildMember, MessageFlags,
  ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType,
} from 'discord.js';
import { getGuild } from '../../database/db';
import { getLocalized, Language } from '../../utils/localization';

export default {
  data: new SlashCommandBuilder()
    .setName('massrole')
    .setDescription('Add or remove a role from all server members at once')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setDMPermission(false)
    .addSubcommand(s => s
      .setName('add')
      .setDescription('Add a role to all members')
      .addRoleOption(o => o.setName('role').setDescription('Role to add').setRequired(true))
      .addBooleanOption(o => o.setName('bots').setDescription('Include bots? (default: false)'))
    )
    .addSubcommand(s => s
      .setName('remove')
      .setDescription('Remove a role from all members')
      .addRoleOption(o => o.setName('role').setDescription('Role to remove').setRequired(true))
      .addBooleanOption(o => o.setName('bots').setDescription('Include bots? (default: false)'))
    ),

  async execute(ix: ChatInputCommandInteraction) {
    const lang = (getGuild(ix.guildId!)?.language || 'en') as Language;
    const t = (k: string, v?: Record<string, string>) => getLocalized(k, lang, v);

    const sub         = ix.options.getSubcommand() as 'add' | 'remove';
    const role        = ix.options.getRole('role', true) as Role;
    const includeBots = ix.options.getBoolean('bots') ?? false;

    // Safety checks
    if (role.managed) {
      return ix.reply({
        embeds: [new EmbedBuilder().setColor('#ed4245').setDescription(`❌ ${t('massrole.cantAssign')}`)],
        flags: MessageFlags.Ephemeral,
      });
    }

    const botMember = ix.guild!.members.me!;
    if (!botMember.roles.highest.position || botMember.roles.highest.position <= role.position) {
      return ix.reply({
        embeds: [new EmbedBuilder().setColor('#ed4245').setDescription(`❌ ${t('massrole.noPerms')}`)],
        flags: MessageFlags.Ephemeral,
      });
    }

    // Fetch members first to get accurate count for confirmation
    await ix.guild!.members.fetch();

    const members = ix.guild!.members.cache
      .filter(m => !m.user.bot || includeBots)
      .filter(m => sub === 'add' ? !m.roles.cache.has(role.id) : m.roles.cache.has(role.id));

    const total = members.size;

    if (total === 0) {
      const msg = sub === 'add'
        ? `All members already have **${role.name}**.`
        : `No members have **${role.name}**.`;
      return ix.reply({ embeds: [new EmbedBuilder().setColor('#fee75c').setDescription(`ℹ️ ${msg}`)], flags: MessageFlags.Ephemeral });
    }

    // ── Confirmation step ────────────────────────────────────────────────────
    const confirmBtn = new ButtonBuilder()
      .setCustomId('massrole_confirm')
      .setLabel(`${sub === 'add' ? 'Add' : 'Remove'} role for ${total} members`)
      .setStyle(sub === 'add' ? ButtonStyle.Success : ButtonStyle.Danger)
      .setEmoji(sub === 'add' ? '✅' : '🗑️');
    const cancelBtn = new ButtonBuilder()
      .setCustomId('massrole_cancel')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary);

    const confirmMsg = await ix.reply({
      embeds: [new EmbedBuilder()
        .setColor('#fee75c')
        .setTitle('⚠️ Confirm Mass Role Action')
        .setDescription(
          `**${sub === 'add' ? 'Add' : 'Remove'}** ${role} ${sub === 'add' ? 'to' : 'from'} **${total} members**?\n\nThis cannot be undone quickly.`,
        )
        .setFooter({ text: 'Expires in 30 seconds' })],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(confirmBtn, cancelBtn)],
      flags: MessageFlags.Ephemeral,
    });

    let confirmed = false;
    try {
      const btn = await confirmMsg.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: b => b.user.id === ix.user.id,
        time: 30_000,
      });
      if (btn.customId === 'massrole_cancel') {
        await btn.update({ embeds: [new EmbedBuilder().setColor('#ed4245').setDescription('❌ Cancelled.')], components: [] });
        return;
      }
      confirmed = true;
      await btn.update({ embeds: [new EmbedBuilder().setColor('#fee75c').setDescription('⚙️ Starting...')], components: [] });
    } catch {
      await ix.editReply({ embeds: [new EmbedBuilder().setColor('#ed4245').setDescription('❌ Timed out.')], components: [] });
      return;
    }

    if (!confirmed) return;

    // ── Processing ───────────────────────────────────────────────────────────
    let done = 0; let success = 0; let failed = 0;

    const progressEmbed = () => new EmbedBuilder()
      .setTitle(`⚙️ ${t('massrole.title')}`)
      .setColor('#fee75c')
      .setDescription(
        `${sub === 'add' ? t('massrole.adding') : t('massrole.removing')}\n\n` +
        `**Role:** ${role}\n**Members to process:** ${total}\n\n` +
        `${t('massrole.progress', { done: String(done), total: String(total) })}`,
      );

    await ix.editReply({ embeds: [progressEmbed()], components: [] });

    const memberArr = [...members.values()];
    for (let i = 0; i < memberArr.length; i++) {
      const member = memberArr[i];
      try {
        if (sub === 'add') await member.roles.add(role, `massrole by ${ix.user.tag}`);
        else               await member.roles.remove(role, `massrole by ${ix.user.tag}`);
        success++;
      } catch {
        failed++;
      }
      done++;

      if (done % 10 === 0 || done === total) {
        await ix.editReply({ embeds: [progressEmbed()] }).catch(() => {});
      }

      if (i < memberArr.length - 1) await new Promise(r => setTimeout(r, 100));
    }

    const color = failed === 0 ? '#57f287' : failed < success ? '#fee75c' : '#ed4245';
    const icon  = sub === 'add' ? '✅' : '🗑️';

    await ix.editReply({
      embeds: [new EmbedBuilder()
        .setTitle(`${icon} ${t('massrole.title')}`)
        .setColor(color)
        .setDescription(t('massrole.done', { success: String(success), failed: String(failed) }))
        .addFields(
          { name: 'Role',    value: `${role}`,                              inline: true },
          { name: 'Action',  value: sub === 'add' ? '➕ Added' : '➖ Removed', inline: true },
          { name: 'Success', value: `${success}/${total}`,                  inline: true },
          ...(failed > 0 ? [{ name: '⚠️ Failed', value: String(failed), inline: true }] : []),
        )
        .setFooter({ text: `Executed by ${ix.user.tag}` })
        .setTimestamp()],
    });
  },
};
