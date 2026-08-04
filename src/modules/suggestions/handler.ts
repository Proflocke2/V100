/**
 * modules/suggestions/handler.ts
 *
 * The interactive flow: /suggest submit → embed + 👍/👎 buttons (+ ✅/❌ for
 * the configured viewer role) posted to suggestions_channel → votes and
 * decisions edit that same message in place, nothing new gets posted.
 *
 * Wired into events/interactionCreate.ts via isSuggestionVoteButton() /
 * isSuggestionDecisionButton() — see the two `if` lines added there.
 * All user-facing text goes through tGuild() (suggestions namespace, en/de/fr/ru).
 */

import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ButtonInteraction,
  EmbedBuilder, TextChannel, GuildMember, MessageFlags, Guild,
} from 'discord.js';
import { error, success } from '../../utils/embeds';
import * as Repo from './repository';
import { tGuild } from '../../i18n';

const VOTE_UP_PREFIX        = 'suggestion_vote_up_';
const VOTE_DOWN_PREFIX      = 'suggestion_vote_down_';
const DECIDE_APPROVE_PREFIX = 'suggestion_decide_approve_';
const DECIDE_DENY_PREFIX    = 'suggestion_decide_deny_';

export function isSuggestionVoteButton(customId: string): boolean {
  return customId.startsWith(VOTE_UP_PREFIX) || customId.startsWith(VOTE_DOWN_PREFIX);
}
export function isSuggestionDecisionButton(customId: string): boolean {
  return customId.startsWith(DECIDE_APPROVE_PREFIX) || customId.startsWith(DECIDE_DENY_PREFIX);
}

const STATUS_COLOR: Record<Repo.SuggestionStatus, `#${string}`> = {
  pending:  '#fee75c', // yellow
  approved: '#57f287', // green
  denied:   '#ed4245', // red
};

function statusLabel(guildId: string, status: Repo.SuggestionStatus): string {
  return tGuild(guildId, `suggestions.status_${status}`);
}

/**
 * Builds the suggestion embed. `anonymous` is read from the guild's CURRENT
 * config at render time — it's not stored per-suggestion — matching the
 * spec's "suggestions_anonymous=1 → Anonym" wording literally. That means
 * flipping the setting later changes how an already-posted suggestion
 * displays the next time its message gets edited (e.g. on a vote). Simple,
 * and good enough here; a per-suggestion snapshot would need its own column.
 */
export function buildSuggestionEmbed(guildId: string, suggestion: Repo.Suggestion, anonymous: boolean): EmbedBuilder {
  const t = (k: string, vars?: Record<string, string | number>) => tGuild(guildId, `suggestions.${k}`, vars);
  const embed = new EmbedBuilder()
    .setTitle(t('embed_title'))
    .setColor(STATUS_COLOR[suggestion.status])
    .addFields(
      { name: t('f_author'),  value: anonymous ? t('f_author_anon') : `<@${suggestion.author_id}>`, inline: true },
      { name: t('f_status'),  value: statusLabel(guildId, suggestion.status),                        inline: true },
      { name: t('f_votes'),   value: `👍 ${suggestion.upvotes}  ·  👎 ${suggestion.downvotes}`,       inline: true },
      { name: t('f_content'), value: suggestion.content.slice(0, 1024) },
    )
    .setFooter({ text: t('footer', { id: suggestion.id }) })
    .setTimestamp(suggestion.created_at * 1000);

  if (suggestion.status !== 'pending') {
    embed.addFields(
      { name: t('f_decided_by'), value: suggestion.decided_by ? `<@${suggestion.decided_by}>` : t('f_decided_by_unknown'), inline: true },
      { name: t('f_reason'),     value: suggestion.decision_reason || t('f_reason_none'),                                  inline: true },
    );
  }

  return embed;
}

/** No components once a decision has been made — replaced by the Status field above instead. */
function buildComponents(guildId: string, suggestion: Repo.Suggestion, hasViewerRole: boolean): ActionRowBuilder<ButtonBuilder>[] {
  if (suggestion.status !== 'pending') return [];
  const t = (k: string) => tGuild(guildId, `suggestions.${k}`);

  const rows = [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`${VOTE_UP_PREFIX}${suggestion.id}`).setEmoji('👍').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`${VOTE_DOWN_PREFIX}${suggestion.id}`).setEmoji('👎').setStyle(ButtonStyle.Danger),
    ),
  ];

  if (hasViewerRole) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`${DECIDE_APPROVE_PREFIX}${suggestion.id}`).setLabel(t('btn_approve')).setEmoji('✅').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`${DECIDE_DENY_PREFIX}${suggestion.id}`).setLabel(t('btn_deny')).setEmoji('❌').setStyle(ButtonStyle.Danger),
      ),
    );
  }

  return rows;
}

/** /suggest submit → posts the embed + buttons to suggestions_channel, saves it. Nothing is lost even if the channel send fails — the row is written first. */
export async function handleSuggestionSubmit(
  guild: Guild,
  authorId: string,
  content: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const t = (k: string) => tGuild(guild.id, `suggestions.${k}`);
  const cfg = Repo.getConfig(guild.id);
  if (!cfg.enabled) {
    return { ok: false, reason: t('not_enabled') };
  }
  if (!cfg.channel) {
    return { ok: false, reason: t('no_channel') };
  }
  const channel = guild.channels.cache.get(cfg.channel) as TextChannel | undefined;
  if (!channel || !channel.isTextBased()) {
    return { ok: false, reason: t('channel_gone') };
  }

  const id = Repo.createSuggestion(guild.id, authorId, content);
  const suggestion = Repo.getSuggestion(id)!;

  const sent = await channel.send({
    embeds: [buildSuggestionEmbed(guild.id, suggestion, cfg.anonymous)],
    components: buildComponents(guild.id, suggestion, !!cfg.viewerRole),
  }).catch(() => null);

  if (!sent) {
    return { ok: false, reason: t('post_failed') };
  }

  Repo.setSuggestionMessageId(id, sent.id);
  return { ok: true };
}

/** 👍/👎 clicked → register the vote, update the embed's counters in place, ephemeral confirmation to the voter. */
export async function handleVoteButton(interaction: ButtonInteraction): Promise<void> {
  const gid = interaction.guildId!;
  const t = (k: string, vars?: Record<string, string | number>) => tGuild(gid, `suggestions.${k}`, vars);
  const isUp = interaction.customId.startsWith(VOTE_UP_PREFIX);
  const id = Number(interaction.customId.slice(isUp ? VOTE_UP_PREFIX.length : VOTE_DOWN_PREFIX.length));
  const voteType: Repo.VoteType = isUp ? 'up' : 'down';

  // Vote-role gate — server-side, same reasoning as the decision-role check
  // below: anyone who can see the message can fire the button interaction,
  // so the real permission check has to live here, not in who the buttons
  // are shown to. null voteRole = everyone may vote (default).
  const preCfg = Repo.getConfig(gid);
  if (preCfg.voteRole) {
    const member = interaction.member as GuildMember | null;
    if (!member?.roles.cache.has(preCfg.voteRole)) {
      await interaction.reply({
        embeds: [error(t('vote_no_perm_title'), t('vote_no_perm_desc', { role: preCfg.voteRole }))],
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
      return;
    }
  }

  const result = Repo.setVote(id, interaction.user.id, voteType);
  if (!result.ok) {
    const msg = result.reason === 'decided' ? t('vote_closed_decided') : t('vote_closed_gone');
    await interaction.reply({ embeds: [error(t('vote_closed_title'), msg)], flags: MessageFlags.Ephemeral }).catch(() => {});
    return;
  }

  const suggestion = Repo.getSuggestion(id)!;
  const cfg = Repo.getConfig(gid);

  // .update() edits the existing message in place — no new post, per spec.
  await interaction.update({
    embeds: [buildSuggestionEmbed(gid, suggestion, cfg.anonymous)],
    components: buildComponents(gid, suggestion, !!cfg.viewerRole),
  }).catch(() => {});

  await interaction.followUp({
    embeds: [success(t('vote_counted_title'), t('vote_counted_desc', { up: suggestion.upvotes, down: suggestion.downvotes }))],
    flags: MessageFlags.Ephemeral,
  }).catch(() => {});
}

/** ✅/❌ clicked (viewer-role only) → decide the suggestion, freeze the message (buttons gone, status text instead). */
export async function handleDecisionButton(interaction: ButtonInteraction): Promise<void> {
  const gid = interaction.guildId!;
  const t = (k: string) => tGuild(gid, `suggestions.${k}`);
  const isApprove = interaction.customId.startsWith(DECIDE_APPROVE_PREFIX);
  const id = Number(interaction.customId.slice(isApprove ? DECIDE_APPROVE_PREFIX.length : DECIDE_DENY_PREFIX.length));

  const cfg = Repo.getConfig(gid);

  // Server-side permission check — NOT just "the button is only shown to the
  // right role". Any member who can see the message can technically fire a
  // button-click interaction for it regardless of who else can see which
  // buttons, so the real gate has to live here.
  if (!cfg.viewerRole) {
    await interaction.reply({ embeds: [error(t('decide_not_configured_title'), t('decide_not_configured_desc'))], flags: MessageFlags.Ephemeral }).catch(() => {});
    return;
  }
  const member = interaction.member as GuildMember | null;
  if (!member?.roles.cache.has(cfg.viewerRole)) {
    await interaction.reply({ embeds: [error(t('decide_no_perm_title'), t('decide_no_perm_desc'))], flags: MessageFlags.Ephemeral }).catch(() => {});
    return;
  }

  const suggestion = Repo.getSuggestion(id);
  if (!suggestion) {
    await interaction.reply({ embeds: [error(t('decide_not_found_title'), t('decide_not_found_desc'))], flags: MessageFlags.Ephemeral }).catch(() => {});
    return;
  }
  if (suggestion.status !== 'pending') {
    await interaction.reply({ embeds: [error(t('decide_already_title'), t('decide_already_desc'))], flags: MessageFlags.Ephemeral }).catch(() => {});
    return;
  }

  Repo.decideSuggestion(id, interaction.user.id, isApprove ? 'approved' : 'denied', null);
  const updated = Repo.getSuggestion(id)!;

  await interaction.update({
    embeds: [buildSuggestionEmbed(gid, updated, cfg.anonymous)],
    components: buildComponents(gid, updated, !!cfg.viewerRole), // status is no longer 'pending' → [] → buttons gone
  }).catch(() => {});
}
