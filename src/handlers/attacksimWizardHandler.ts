/**
 * ATTACKSIM WIZARD HANDLER
 *
 * Converts /attacksim from a 3-layer subcommand-group tree into a
 * 3-step wizard:
 *   1. Pick a scenario (StringSelectMenu)
 *   2. Pick a target channel (modal input)
 *   3. Confirm → run
 *
 * Sessions are in-memory (Map) — wizard lifetime is ~2 minutes, Render
 * restarts between steps are extremely unlikely at this timescale.
 *
 * customId prefix: "atsim:" — all buttons/selects handled here.
 */

import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  StringSelectMenuBuilder, StringSelectMenuInteraction,
  ButtonInteraction, ModalBuilder, TextInputBuilder, TextInputStyle,
  TextChannel, Guild,
} from 'discord.js';
import {
  simJoinRaid, simNuke, simPermissionGrab, simWebhookSpam,
  simSpam, simCapsFlood, simMassPing, simPhishing, simInviteFlood,
  simBadwords, simRegexBypass, simEmojiSpam, simCopypasta, simLinkFlood,
  simAltAccounts, simSelfbotJoins,
} from '../merged/impl/mod-attacksim';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SimSession { scenario: string; channelId?: string; count?: number; }
const sessions = new Map<string, SimSession>();
function skey(userId: string, guildId: string) { return `${userId}:${guildId}`; }

// ── Scenario definitions ──────────────────────────────────────────────────────

const SCENARIOS: { value: string; label: string; description: string; emoji: string; needsChannel: boolean; hasCount?: boolean }[] = [
  { value: 'raid',          label: 'Join Raid',        description: 'Real channel lockdown + join flood', emoji: '🌊', needsChannel: false, hasCount: true },
  { value: 'spam',          label: 'Spam Flood',       description: 'Flood a channel with spam messages', emoji: '💬', needsChannel: true,  hasCount: true },
  { value: 'caps',          label: 'CAPS Flood',       description: 'ALL CAPS message flood',             emoji: '🔠', needsChannel: true  },
  { value: 'masspings',     label: 'Mass Ping',        description: 'Fake mass-mention spam',             emoji: '🔔', needsChannel: true  },
  { value: 'phishing',      label: 'Phishing Links',   description: 'Simulated phishing URLs',            emoji: '🎣', needsChannel: true  },
  { value: 'invites',       label: 'Invite Flood',     description: 'Fake Discord invite links',          emoji: '📨', needsChannel: true  },
  { value: 'badwords',      label: 'Bad Words Test',   description: 'Triggers bad-word filter',           emoji: '🤬', needsChannel: true  },
  { value: 'regex-bypass',  label: 'Regex Bypass',     description: 'Obfuscated text patterns',           emoji: '🔍', needsChannel: true  },
  { value: 'emoji-spam',    label: 'Emoji Spam',       description: 'Emoji overload messages',            emoji: '😱', needsChannel: true  },
  { value: 'copypasta',     label: 'Copypasta',        description: 'Identical repeated messages',        emoji: '📋', needsChannel: true, hasCount: true },
  { value: 'links',         label: 'Link Flood',       description: 'Malicious link flood',               emoji: '🔗', needsChannel: true  },
  { value: 'alt-accounts',  label: 'Alt Accounts',     description: 'Fake new-account join text',         emoji: '👥', needsChannel: true  },
  { value: 'selfbots',      label: 'Selfbot Patterns', description: 'Selfbot-style messages',             emoji: '🤖', needsChannel: true  },
  { value: 'nuke',          label: '💣 Server Nuke',   description: '⚠️ Creates & deletes channels/roles', emoji: '💥', needsChannel: true  },
  { value: 'permission-grab', label: '🔑 Perm Grab',  description: '⚠️ Creates a real admin role',        emoji: '🔑', needsChannel: true  },
  { value: 'webhook-spam',  label: '🕵️ Webhook Spam',  description: '⚠️ Real webhooks created',           emoji: '🪝', needsChannel: true  },
];

const DANGER_SCENARIOS = new Set(['nuke', 'permission-grab', 'webhook-spam', 'raid']);

// ── Build screens ─────────────────────────────────────────────────────────────

export function buildAttacksimHome(): { embeds: EmbedBuilder[]; components: ActionRowBuilder<any>[] } {
  const embed = new EmbedBuilder()
    .setTitle('⚔️ AttackSim Wizard')
    .setColor('#ed4245')
    .setDescription(
      '**Select a scenario below.** The simulator runs real Discord actions so your security systems have something to react to — everything is rolled back afterward.\n\n' +
      '⚠️ **Nuke, Permission-Grab, Webhook-Spam and Join-Raid** perform actual destructive actions. The `/attacksim rollback` command restores the server.',
    );

  // Split into 2 menus of max 25 items each (Discord limit)
  const half = Math.ceil(SCENARIOS.length / 2);
  const first  = SCENARIOS.slice(0, half);
  const second = SCENARIOS.slice(half);

  const menu1 = new StringSelectMenuBuilder()
    .setCustomId('atsim:pick:1')
    .setPlaceholder('📋 Choose a scenario (part 1/2)…')
    .addOptions(first.map(s => ({ label: s.label, value: s.value, description: s.description, emoji: s.emoji })));

  const menu2 = new StringSelectMenuBuilder()
    .setCustomId('atsim:pick:2')
    .setPlaceholder('📋 Choose a scenario (part 2/2)…')
    .addOptions(second.map(s => ({ label: s.label, value: s.value, description: s.description, emoji: s.emoji })));

  return {
    embeds:     [embed],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu1),
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu2),
    ],
  };
}

function buildConfirmScreen(session: SimSession, userId: string, guildId: string) {
  const def = SCENARIOS.find(s => s.value === session.scenario)!;
  const isDanger = DANGER_SCENARIOS.has(session.scenario);

  const embed = new EmbedBuilder()
    .setTitle(`${def.emoji} ${def.label}`)
    .setColor(isDanger ? '#ff0000' : '#faa61a')
    .addFields(
      { name: 'Target',   value: session.channelId ? `<#${session.channelId}>` : 'Server-wide', inline: true },
      { name: 'Scenario', value: def.description, inline: true },
      ...(session.count ? [{ name: 'Count', value: String(session.count), inline: true }] : []),
    )
    .setDescription(isDanger ? '⚠️ **This scenario makes real Discord changes. Use `/attacksim rollback` to restore.**' : 'Ready to run.');

  const components: ActionRowBuilder<ButtonBuilder>[] = [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`atsim:run:${userId}:${guildId}`).setLabel('▶ Run Simulation').setStyle(isDanger ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`atsim:home:${userId}:${guildId}`).setLabel('◀ Back').setStyle(ButtonStyle.Secondary),
    ),
  ];
  return { embeds: [embed], components };
}

// ── Routing ───────────────────────────────────────────────────────────────────

export function isAttacksimSelect(id: string)  { return id.startsWith('atsim:pick:'); }
export function isAttacksimButton(id: string)  { return id.startsWith('atsim:'); }

export async function handleAttacksimSelect(sel: StringSelectMenuInteraction): Promise<void> {
  const guildId = sel.guildId!;
  const userId  = sel.user.id;
  const value   = sel.values[0];
  const def     = SCENARIOS.find(s => s.value === value)!;

  sessions.set(skey(userId, guildId), { scenario: value });

  if (!def.needsChannel) {
    // Raid/server-wide scenarios — show optional count modal
    if (def.hasCount) {
      const modal = new ModalBuilder()
        .setCustomId(`atsim:count:${userId}:${guildId}`)
        .setTitle(`${def.label} — Configure`);
      modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId('count').setLabel('Simulated joins (5–50)').setStyle(TextInputStyle.Short).setValue('15').setRequired(false),
      ));
      return void sel.showModal(modal);
    }
    const session = sessions.get(skey(userId, guildId))!;
    return void sel.update(buildConfirmScreen(session, userId, guildId));
  }

  // Channel-based scenarios: ask for channel + optional count
  const modal = new ModalBuilder()
    .setCustomId(`atsim:channel:${userId}:${guildId}`)
    .setTitle(`${def.label} — Configure`);
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('channel_id').setLabel('Target channel ID').setStyle(TextInputStyle.Short).setRequired(true),
    ),
    ...(def.hasCount ? [new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder().setCustomId('count').setLabel('Message count (3–30)').setStyle(TextInputStyle.Short).setValue('10').setRequired(false),
    )] : []),
  );
  return void sel.showModal(modal);
}

export async function handleAttacksimButton(btn: ButtonInteraction): Promise<void> {
  const parts   = btn.customId.split(':');
  const action  = parts[1];
  const userId  = parts[2];
  const guildId = parts[3];

  if (btn.user.id !== userId) { await btn.reply({ content: '❌ Not your wizard.', ephemeral: true }); return; }

  if (action === 'home') {
    sessions.delete(skey(userId, guildId));
    return void btn.update(buildAttacksimHome());
  }

  if (action === 'run') {
    const session = sessions.get(skey(userId, guildId));
    if (!session) { await btn.reply({ content: '❌ Session expired. Run `/attacksim` again.', ephemeral: true }); return; }

    sessions.delete(skey(userId, guildId));
    await btn.update({
      embeds: [new EmbedBuilder().setColor('#faa61a').setTitle('⏳ Running simulation…').setDescription('This may take a few seconds.')],
      components: [],
    });

    const guild = btn.guild!;
    let result = 'Done.';
    try {
      const ch = session.channelId ? guild.channels.cache.get(session.channelId) as TextChannel | undefined : undefined;
      const count = session.count ?? 15;

      switch (session.scenario) {
        case 'raid':           result = await simJoinRaid(guild, guild.id, count); break;
        case 'nuke':           result = await simNuke(guild, guild.id, ch!); break;
        case 'permission-grab': result = await simPermissionGrab(guild, guild.id, ch!); break;
        case 'webhook-spam':   result = await simWebhookSpam(guild, guild.id, ch!); break;
        case 'spam':           result = await simSpam(guild, guild.id, ch!, count); break;
        case 'caps':           result = await simCapsFlood(guild, guild.id, ch!); break;
        case 'masspings':      result = await simMassPing(guild, guild.id, ch!); break;
        case 'phishing':       result = await simPhishing(guild, guild.id, ch!); break;
        case 'invites':        result = await simInviteFlood(guild, guild.id, ch!); break;
        case 'badwords':       result = await simBadwords(guild, guild.id, ch!); break;
        case 'regex-bypass':   result = await simRegexBypass(guild, guild.id, ch!); break;
        case 'emoji-spam':     result = await simEmojiSpam(guild, guild.id, ch!); break;
        case 'copypasta':      result = await simCopypasta(guild, guild.id, ch!, count); break;
        case 'links':          result = await simLinkFlood(guild, guild.id, ch!); break;
        case 'alt-accounts':   result = await simAltAccounts(guild, guild.id, ch!); break;
        case 'selfbots':       result = await simSelfbotJoins(guild, guild.id, ch!); break;
        default:               result = 'Unknown scenario.';
      }
    } catch (err: any) {
      result = `Error: ${err.message}`;
    }

    await btn.editReply({
      embeds: [new EmbedBuilder()
        .setColor('#57f287')
        .setTitle('✅ Simulation Complete')
        .setDescription(result)
        .setFooter({ text: 'Use /attacksim rollback to restore any real changes' })],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`atsim:home:${userId}:${guildId}`).setLabel('◀ Run another').setStyle(ButtonStyle.Secondary),
      )],
    });
  }
}

// ── Modal handler (channel ID + count input) ──────────────────────────────────

export function isAttacksimModal(id: string) { return id.startsWith('atsim:channel:') || id.startsWith('atsim:count:'); }

export async function handleAttacksimModal(modal: import('discord.js').ModalSubmitInteraction): Promise<void> {
  const parts   = modal.customId.split(':');
  const type    = parts[1];
  const userId  = parts[2];
  const guildId = parts[3];

  const session = sessions.get(skey(userId, guildId));
  if (!session) { await modal.reply({ content: '❌ Session expired. Run `/attacksim` again.', ephemeral: true }); return; }

  try {
    if (type === 'channel') {
      const chId  = modal.fields.getTextInputValue('channel_id').trim();
      let   count: number | undefined;
      try { count = parseInt(modal.fields.getTextInputValue('count'), 10) || undefined; } catch {}
      session.channelId = chId;
      session.count     = count;
    }
    if (type === 'count') {
      let count: number | undefined;
      try { count = parseInt(modal.fields.getTextInputValue('count'), 10) || undefined; } catch {}
      session.count = count;
    }
    sessions.set(skey(userId, guildId), session);
    await modal.reply({ ...buildConfirmScreen(session, userId, guildId), ephemeral: true });
  } catch {
    await modal.reply({ content: '❌ Failed to process input.', ephemeral: true });
  }
}
