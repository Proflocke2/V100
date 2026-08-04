import {
  SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel,
  ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType,
} from 'discord.js';
import { getGuild } from '../../database/db';
import { getLocalized, Language } from '../../utils/localization';
import db from '../../database/db';
import { success, error, info } from '../../utils/embeds';
import { ApplicationRow } from '../../utils/types';
import { copyAsSubcommandGroup } from '../../merged/mergeUtils';
import applyPanelCmd from '../../merged/impl/apply-panel';

const applicationData = new SlashCommandBuilder()
    .setName('application')
    .setDescription('Manage application forms (up to 25 questions)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName('create').setDescription('Create a new application form'))
    .addSubcommand(s => s.setName('list').setDescription('List all application forms'))
    .addSubcommand(s => s.setName('delete').setDescription('Delete an application')
      .addIntegerOption(o => o.setName('id').setDescription('Application ID').setRequired(true)))
    .addSubcommand(s => s.setName('send').setDescription('Post apply button to channel')
      .addIntegerOption(o => o.setName('id').setDescription('Application ID').setRequired(true))
      .addChannelOption(o => o.setName('channel').setDescription('Channel').setRequired(true)
        .addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(s => s.setName('config').setDescription('Configure review channel, accept role, limits')
      .addIntegerOption(o => o.setName('id').setDescription('Application ID').setRequired(true))
      .addChannelOption(o => o.setName('review_channel').setDescription('Where mods see applications')
        .addChannelTypes(ChannelType.GuildText))
      .addRoleOption(o => o.setName('accept_role').setDescription('Role on accept'))
      .addChannelOption(o => o.setName('accepted_channel').setDescription('Channel where accepted applications are posted automatically')
        .addChannelTypes(ChannelType.GuildText))
      .addChannelOption(o => o.setName('denied_channel').setDescription('Channel where denied applications are posted automatically')
        .addChannelTypes(ChannelType.GuildText))
      .addStringOption(o => o.setName('dm_message').setDescription('Custom DM message on submit'))
      .addIntegerOption(o => o.setName('max_concurrent').setDescription('Max simultaneous pending applications (0 = no limit)').setMinValue(0).setMaxValue(500))
      .addIntegerOption(o => o.setName('reapply_cooldown_days').setDescription('Days rejected users must wait before re-applying (0 = no cooldown)').setMinValue(0).setMaxValue(365)));

copyAsSubcommandGroup(applicationData as any, 'panel', 'Manage apply panels (buttons/embeds that link to application forms)', applyPanelCmd as any);

export default {
  data: applicationData,

  async execute(interaction: ChatInputCommandInteraction) {
    const group = interaction.options.getSubcommandGroup(false);
    if (group === 'panel') return (applyPanelCmd as any).execute(interaction);

    const guild = getGuild(interaction.guildId!);
    const lang = (guild.language || 'en') as Language;
    if (!interaction.guildId) {
      await interaction.reply({ content: '❌ Server only.', ephemeral: true });
      return;
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'create') {
      const modal = new ModalBuilder()
        .setCustomId('app_create_modal')
        .setTitle('Create Application Form');

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('app_name')
            .setLabel('Form Name')
            .setPlaceholder('e.g. Staff Application')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(100)
            .setRequired(true)
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('app_description')
            .setLabel('Description (shown in panel)')
            .setPlaceholder('Apply for our team!')
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(500)
            .setRequired(false)
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('app_questions')
            .setLabel('Questions (one per line, max 25)')
            .setPlaceholder('What is your name?\nHow old are you?\nWhy do you want to join?\n...')
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(2000)
            .setRequired(true)
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('app_button_label')
            .setLabel('Button Label')
            .setPlaceholder('Apply Now')
            .setValue('Apply Now')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(80)
            .setRequired(false)
        )
      );

      await interaction.showModal(modal);
      return;
    }

    if (sub === 'list') {
      const apps = db.prepare('SELECT * FROM applications WHERE guild_id = ? AND active = 1')
        .all(interaction.guildId) as ApplicationRow[];

      if (!apps.length) {
        await interaction.reply({
          embeds: [info('No applications', 'Create one with `/application create`')],
          ephemeral: true,
        });
        return;
      }

      const e = new EmbedBuilder()
        .setTitle('📋 Applications')
        .setColor('#5865f2')
        .setDescription(apps.map(a => {
          const q = JSON.parse(a.questions).length;
          const reviewCh = a.review_channel ? `<#${a.review_channel}>` : '❌ Not set';
          const role = a.accept_role ? `<@&${a.accept_role}>` : '—';
          return `**#${a.id}** — ${a.name}\n   Questions: ${q} | Review: ${reviewCh} | Role: ${role}`;
        }).join('\n\n'));

      await interaction.reply({ embeds: [e], ephemeral: true });
      return;
    }

    if (sub === 'delete') {
      const id = interaction.options.getInteger('id', true);
      const app = db.prepare('SELECT * FROM applications WHERE id = ? AND guild_id = ?')
        .get(id, interaction.guildId) as ApplicationRow | undefined;

      if (!app) {
        await interaction.reply({ embeds: [error('Not found')], ephemeral: true });
        return;
      }

      db.prepare('UPDATE applications SET active = 0 WHERE id = ?').run(id);
      await interaction.reply({ embeds: [success('Deleted', `**${app.name}**`)], ephemeral: true });
      return;
    }

    if (sub === 'send') {
      const id = interaction.options.getInteger('id', true);
      const channel = interaction.options.getChannel('channel', true) as TextChannel;
      const app = db.prepare('SELECT * FROM applications WHERE id = ? AND guild_id = ? AND active = 1')
        .get(id, interaction.guildId) as ApplicationRow | undefined;

      if (!app) {
        await interaction.reply({ embeds: [error('Application not found')], ephemeral: true });
        return;
      }

      const questions = JSON.parse(app.questions);

      const embed = new EmbedBuilder()
        .setTitle(`📝 ${app.name}`)
        .setColor('#5865f2')
        .setDescription(app.description ?? 'Click below to apply!')
        .addFields({
          name: '📋 Process',
          value: `You will be asked **${questions.length} questions** via DM.\nMake sure your DMs are open!`,
          inline: false,
        });

      const btn = new ButtonBuilder()
        .setCustomId(`apply_${app.id}`)
        .setLabel(app.button_label ?? 'Apply Now')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📝');

      await channel.send({
        embeds: [embed],
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(btn)],
      });

      await interaction.reply({
        embeds: [success('Application posted', `Apply button posted in ${channel}`)],
        ephemeral: true,
      });
      return;
    }

    if (sub === 'config') {
      const id = interaction.options.getInteger('id', true);
      const app = db.prepare('SELECT * FROM applications WHERE id = ? AND guild_id = ? AND active = 1')
        .get(id, interaction.guildId) as ApplicationRow | undefined;

      if (!app) {
        await interaction.reply({ embeds: [error('Application not found')], ephemeral: true });
        return;
      }

      const reviewCh   = interaction.options.getChannel('review_channel');
      const acceptRole = interaction.options.getRole('accept_role');
      const acceptedCh = interaction.options.getChannel('accepted_channel');
      const deniedCh   = interaction.options.getChannel('denied_channel');
      const dmMsg      = interaction.options.getString('dm_message');
      const maxConcurrent     = interaction.options.getInteger('max_concurrent');
      const reaplyCooldown    = interaction.options.getInteger('reapply_cooldown_days');

      const updates: string[] = [];
      const values: any[] = [];

      if (reviewCh)           { updates.push('review_channel = ?');          values.push(reviewCh.id); }
      if (acceptRole)         { updates.push('accept_role = ?');              values.push(acceptRole.id); }
      if (acceptedCh)         { updates.push('accepted_channel = ?');         values.push(acceptedCh.id); }
      if (deniedCh)           { updates.push('denied_channel = ?');           values.push(deniedCh.id); }
      if (dmMsg)              { updates.push('dm_message = ?');               values.push(dmMsg); }
      if (maxConcurrent !== null)  { updates.push('max_concurrent = ?');       values.push(maxConcurrent); }
      if (reaplyCooldown !== null) { updates.push('reapply_cooldown_days = ?'); values.push(reaplyCooldown); }

      if (!updates.length) {
        await interaction.reply({ embeds: [info('No changes provided')], ephemeral: true });
        return;
      }

      values.push(id);
      db.prepare(`UPDATE applications SET ${updates.join(', ')} WHERE id = ?`).run(...values);

      const notes: string[] = [];
      if (acceptedCh)          notes.push(`Accepted → <#${acceptedCh.id}>`);
      if (deniedCh)            notes.push(`Denied → <#${deniedCh.id}>`);
      if (maxConcurrent !== null)  notes.push(`Max concurrent: **${maxConcurrent === 0 ? 'no limit' : maxConcurrent}**`);
      if (reaplyCooldown !== null) notes.push(`Re-apply cooldown: **${reaplyCooldown === 0 ? 'none' : `${reaplyCooldown} day(s)`}**`);

      await interaction.reply({
        embeds: [success('Updated', [`**${app.name}** updated`, ...notes].join('\n'))],
        ephemeral: true,
      });
    }
  },
};
