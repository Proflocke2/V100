/**
 * /suggest — Community suggestions.
 *   submit ← post a new suggestion (needs suggestions_enabled + a channel set)
 *   config ← admin: channel, decision role, anonymous toggle
 *   list   ← ephemeral overview of pending suggestions
 *
 * Voting (👍/👎) and approve/deny happen entirely via buttons on the posted
 * embed — see modules/suggestions/handler.ts. Runtime text goes through
 * tGuild() (suggestions namespace, en/de/fr/ru).
 */

import {
  SlashCommandBuilder, ChatInputCommandInteraction, ChannelType,
} from 'discord.js';
import { success, error, info } from '../../utils/embeds';
import { requireAdmin } from '../../utils/guards';
import * as Repo from '../../modules/suggestions/repository';
import { handleSuggestionSubmit } from '../../modules/suggestions/handler';
import { tGuild } from '../../i18n';

const data = new SlashCommandBuilder()
  .setName('suggest')
  .setDescription('Community suggestions')

  .addSubcommand(s =>
    s.setName('submit')
      .setDescription('Submit a new suggestion')
      .addStringOption(o => o.setName('text').setDescription('Your suggestion').setRequired(true).setMaxLength(1000)),
  )

  .addSubcommand(s =>
    s.setName('config')
      .setDescription('Configure the suggestions feature (Manage Server required)')
      .addBooleanOption(o => o.setName('enabled').setDescription('On or off'))
      .addChannelOption(o =>
        o.setName('channel').setDescription('Channel suggestions get posted to')
          .addChannelTypes(ChannelType.GuildText),
      )
      .addRoleOption(o => o.setName('viewer_role').setDescription('Role allowed to approve (✅) / deny (❌) suggestions'))
      .addRoleOption(o => o.setName('vote_role').setDescription('Role allowed to vote 👍/👎 — leave unset to let everyone vote'))
      .addBooleanOption(o => o.setName('anonymous').setDescription("Hide the author's name on posted suggestions")),
  )

  .addSubcommand(s => s.setName('list').setDescription('Show pending suggestions'));

export default {
  data,
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;
    const t = (k: string, vars?: Record<string, string | number>) => tGuild(guildId, `suggestions.${k}`, vars);

    // ── submit ─────────────────────────────────────────────────────────────
    if (sub === 'submit') {
      const text = interaction.options.getString('text', true).trim();

      const result = await handleSuggestionSubmit(interaction.guild!, interaction.user.id, text);
      if (result.ok === false) {
        await interaction.reply({ embeds: [error(t('submit_fail_title'), result.reason)], ephemeral: true });
        return;
      }

      await interaction.reply({
        embeds: [success(t('submit_ok_title'), t('submit_ok_desc'))],
        ephemeral: true,
      });
      return;
    }

    // ── config ─────────────────────────────────────────────────────────────
    if (sub === 'config') {
      if (!await requireAdmin(interaction)) return;

      const enabled    = interaction.options.getBoolean('enabled');
      const channel    = interaction.options.getChannel('channel');
      const viewerRole = interaction.options.getRole('viewer_role');
      const voteRole   = interaction.options.getRole('vote_role');
      const anonymous  = interaction.options.getBoolean('anonymous');

      if (enabled !== null)   Repo.setConfigValue(guildId, 'suggestions_enabled', enabled ? 1 : 0);
      if (channel)             Repo.setConfigValue(guildId, 'suggestions_channel', channel.id);
      if (viewerRole)          Repo.setConfigValue(guildId, 'suggestions_viewer_role', viewerRole.id);
      if (voteRole)            Repo.setConfigValue(guildId, 'suggestions_vote_role', voteRole.id);
      if (anonymous !== null)  Repo.setConfigValue(guildId, 'suggestions_anonymous', anonymous ? 1 : 0);

      const cfg = Repo.getConfig(guildId);
      await interaction.reply({
        embeds: [success(t('config_updated_title'),
          `**${t('config_enabled')}:** ${cfg.enabled ? t('config_yes') : t('config_no')}\n` +
          `**${t('config_channel')}:** ${cfg.channel ? `<#${cfg.channel}>` : t('config_not_set')}\n` +
          `**${t('config_decision_role')}:** ${cfg.viewerRole ? `<@&${cfg.viewerRole}>` : t('config_decision_role_unset')}\n` +
          `**${t('config_vote_role')}:** ${cfg.voteRole ? `<@&${cfg.voteRole}>` : t('config_vote_role_unset')}\n` +
          `**${t('config_anonymous')}:** ${cfg.anonymous ? t('config_yes') : t('config_no')}`,
        )],
        ephemeral: true,
      });
      return;
    }

    // ── list ───────────────────────────────────────────────────────────────
    if (sub === 'list') {
      const cfg = Repo.getConfig(guildId);
      const pending = Repo.listPending(guildId, 15);

      if (pending.length === 0) {
        await interaction.reply({ embeds: [info(t('list_empty_title'), t('list_empty_desc'))], ephemeral: true });
        return;
      }

      const lines = pending.map(s => {
        const author  = cfg.anonymous ? t('f_author_anon') : `<@${s.author_id}>`;
        const snippet = s.content.length > 80 ? `${s.content.slice(0, 80)}…` : s.content;
        return `**#${s.id}** 👍 ${s.upvotes} · 👎 ${s.downvotes} — ${snippet} *(${author})*`;
      });

      await interaction.reply({
        embeds: [info(t('list_title', { count: pending.length }), lines.join('\n').slice(0, 4000))],
        ephemeral: true,
      });
      return;
    }
  },
};
