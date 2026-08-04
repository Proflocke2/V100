/**
 * modcase — searchable moderation case log with stable per-guild case
 * numbers, on top of the mod_history table that kick/ban/timeout/warn/unban
 * already write to (see database/db.ts logModAction()).
 *
 * Exposed to users as `/records case ...` (merged in via commands/moderation/
 * records.ts — same pattern as /records notes and /records warnconfig).
 * Complements `/history` (quick per-user timeline, no case IDs, no filters)
 * rather than replacing it:
 *   /records case view   <case>                    — full detail on one case
 *   /records case user   <target>                   — every case for one user, with case IDs
 *   /records case list   [moderator] [type] [days]  — filtered search across the whole server
 *   /records case note   <case> <text>               — attach/update a follow-up note
 *   /records case delete <case>                       — remove a mistaken entry [Admin only]
 *
 * mod_history rows are the single source of truth here — including 'warn'
 * rows (unlike /history, which filters those out to avoid double-counting
 * against the separate `warnings` table used for auto-escalation).
 */

import {
  SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits,
  EmbedBuilder, MessageFlags,
} from 'discord.js';
import { requireModerator, requireAdmin } from '../../utils/guards';
import { success, error, info } from '../../utils/embeds';
import { msToTime } from '../../utils/helpers';
import {
  ModAction, ModHistoryRow, getModCase, searchModCases, countModCases,
  setModCaseNote, deleteModCase,
} from '../../database/db';
import { logConfigChange } from '../../modules/audit/configAudit';

const ACTION_CHOICES: Array<{ name: string; value: ModAction }> = [
  { name: 'Warn',    value: 'warn' },
  { name: 'Kick',    value: 'kick' },
  { name: 'Timeout', value: 'timeout' },
  { name: 'Ban',     value: 'ban' },
  { name: 'Unban',   value: 'unban' },
];

const ICON: Record<string, string> = {
  warn: '⚠️', kick: '👢', timeout: '🔇', ban: '🔨', unban: '🔓', unmute: '🔊', note: '📝',
};

function caseLine(c: ModHistoryRow): string {
  const dur = c.action === 'timeout' && c.duration_ms ? ` (${msToTime(c.duration_ms)})` : '';
  const icon = ICON[c.action] ?? '•';
  return `${icon} **#${c.case_number}** \`${c.action}\`${dur} — <@${c.user_id}> — <t:${c.created_at}:R> *(by <@${c.moderator_id}>)*`;
}

export default {
  data: new SlashCommandBuilder()
    .setName('modcase')
    .setDescription('Searchable moderation case log — kicks, bans, timeouts, warns, unbans')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false)
    .addSubcommand(s => s.setName('view')
      .setDescription('Show full details of one case')
      .addIntegerOption(o => o.setName('case').setDescription('Case number').setRequired(true).setMinValue(1)))
    .addSubcommand(s => s.setName('user')
      .setDescription('Show every case for one member, with case numbers')
      .addUserOption(o => o.setName('target').setDescription('Member').setRequired(true)))
    .addSubcommand(s => s.setName('list')
      .setDescription('Search cases across the whole server')
      .addUserOption(o => o.setName('moderator').setDescription('Filter by moderator'))
      .addStringOption(o => o.setName('type').setDescription('Filter by action type').addChoices(...ACTION_CHOICES))
      .addIntegerOption(o => o.setName('days').setDescription('Only cases from the last N days').setMinValue(1).setMaxValue(365)))
    .addSubcommand(s => s.setName('note')
      .setDescription('Attach or update a follow-up note on a case')
      .addIntegerOption(o => o.setName('case').setDescription('Case number').setRequired(true).setMinValue(1))
      .addStringOption(o => o.setName('text').setDescription('Note text (leave empty to clear)').setMaxLength(500)))
    .addSubcommand(s => s.setName('delete')
      .setDescription('Delete a case — for entries logged in error [Admin only]')
      .addIntegerOption(o => o.setName('case').setDescription('Case number').setRequired(true).setMinValue(1))),

  async execute(ix: ChatInputCommandInteraction) {
    if (!await requireModerator(ix)) return;
    const gid = ix.guildId!;
    const sub = ix.options.getSubcommand();

    // ── view ───────────────────────────────────────────────────────────────
    if (sub === 'view') {
      const caseNumber = ix.options.getInteger('case', true);
      const c = getModCase(gid, caseNumber);
      if (!c) {
        await ix.reply({ embeds: [error('Case not found', `No case **#${caseNumber}** exists on this server.`)], flags: MessageFlags.Ephemeral });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`${ICON[c.action] ?? '•'} Case #${c.case_number}`)
        .setColor(c.action === 'ban' ? '#ed4245' : c.action === 'kick' || c.action === 'timeout' ? '#fee75c' : '#5865f2')
        .addFields(
          { name: 'User', value: `<@${c.user_id}>\n\`${c.user_id}\``, inline: true },
          { name: 'Moderator', value: `<@${c.moderator_id}>`, inline: true },
          { name: 'Action', value: c.action, inline: true },
          { name: 'Reason', value: c.reason || '*No reason given*' },
        )
        .setFooter({ text: `Logged` })
        .setTimestamp(c.created_at * 1000);

      if (c.duration_ms) embed.addFields({ name: 'Duration', value: msToTime(c.duration_ms), inline: true });
      if (c.note) embed.addFields({ name: '📝 Note', value: c.note });

      await ix.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    // ── user ───────────────────────────────────────────────────────────────
    if (sub === 'user') {
      const target = ix.options.getUser('target', true);
      const cases = searchModCases(gid, { userId: target.id, limit: 50 });

      if (cases.length === 0) {
        await ix.reply({ embeds: [info('No cases', `No moderation cases found for ${target}.`)], flags: MessageFlags.Ephemeral });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle(`📁 Cases — ${target.tag}`)
        .setColor('#5865f2')
        .setThumbnail(target.displayAvatarURL())
        .setDescription(cases.slice(0, 20).map(caseLine).join('\n').slice(0, 4000))
        .setFooter({ text: cases.length > 20 ? `Showing 20 of ${cases.length} — use /modcase view for details` : `${cases.length} case(s) total` });

      await ix.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    // ── list ───────────────────────────────────────────────────────────────
    if (sub === 'list') {
      const moderator = ix.options.getUser('moderator');
      const type = ix.options.getString('type') as ModAction | null;
      const days = ix.options.getInteger('days');

      const filters = {
        moderatorId: moderator?.id,
        action: type ?? undefined,
        since: days ? Math.floor(Date.now() / 1000) - days * 86400 : undefined,
        limit: 20,
      };

      const cases = searchModCases(gid, filters);
      const total = countModCases(gid, filters);

      if (cases.length === 0) {
        await ix.reply({ embeds: [info('No matching cases', 'Try broadening the filters.')], flags: MessageFlags.Ephemeral });
        return;
      }

      const filterDesc = [
        moderator ? `Moderator: ${moderator}` : null,
        type ? `Type: \`${type}\`` : null,
        days ? `Last ${days} day(s)` : null,
      ].filter(Boolean).join(' • ') || 'No filters';

      const embed = new EmbedBuilder()
        .setTitle('📁 Case Search')
        .setColor('#5865f2')
        .setDescription(`${filterDesc}\n\n${cases.map(caseLine).join('\n').slice(0, 3800)}`)
        .setFooter({ text: total > cases.length ? `Showing ${cases.length} of ${total} — narrow the filters to see more` : `${total} case(s) total` });

      await ix.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    // ── note ───────────────────────────────────────────────────────────────
    if (sub === 'note') {
      const caseNumber = ix.options.getInteger('case', true);
      const text = ix.options.getString('text');

      const c = getModCase(gid, caseNumber);
      if (!c) {
        await ix.reply({ embeds: [error('Case not found', `No case **#${caseNumber}** exists on this server.`)], flags: MessageFlags.Ephemeral });
        return;
      }

      setModCaseNote(gid, caseNumber, text || null);
      await ix.reply({
        embeds: [success(text ? 'Note saved' : 'Note cleared', `Case **#${caseNumber}**${text ? `\n${text}` : ''}`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // ── delete ─────────────────────────────────────────────────────────────
    if (sub === 'delete') {
      if (!await requireAdmin(ix)) return;
      const caseNumber = ix.options.getInteger('case', true);

      const c = getModCase(gid, caseNumber);
      if (!c) {
        await ix.reply({ embeds: [error('Case not found', `No case **#${caseNumber}** exists on this server.`)], flags: MessageFlags.Ephemeral });
        return;
      }

      deleteModCase(gid, caseNumber);
      logConfigChange(gid, ix.user.id, 'modcase_deleted', `Case #${caseNumber} (${c.action} on <@${c.user_id}>)`);
      await ix.reply({
        embeds: [success('Case deleted', `Case **#${caseNumber}** (\`${c.action}\` on <@${c.user_id}>) has been removed.`)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  },
};
