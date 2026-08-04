/**
 * src/ui/permissionView.ts
 *
 * The `/config → 🔑 Berechtigungen` branch.
 *
 * Two things get configured here and both feed resolveAccess():
 *   • Access roles — the coarse "these roles are Team / Admin" switch.
 *   • Node overrides — per command or per single subcommand: freigeben,
 *     sperren, oder an konkrete Rollen binden.
 *
 * The editor itself is admin-gated by the router before any of this renders.
 */

import {
  ActionRowBuilder,
  MessageActionRowComponentBuilder,
  ButtonBuilder,
  ButtonStyle,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { embed } from '../utils/embeds';
import { getCatalog } from './catalog';
import { UiAction, buildUiId } from './ids';
import {
  AccessLevel,
  LEVEL_LABEL,
  OverrideMode,
  getAccessRoles,
  getOverride,
} from './permissions';
import { UiSession } from './session';
import { RenderPayload } from './views';

type Row = ActionRowBuilder<MessageActionRowComponentBuilder>;

const NODE_PAGE_SIZE = 25;

const MODE_LABEL: Record<OverrideMode, string> = {
  inherit: 'Default (inherits from tier/Discord)',
  allow: 'Allow for everyone',
  deny: 'Block entirely',
  roles: 'Specific roles only',
};

function navRow(session: UiSession, back: UiAction): Row {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildUiId(session.id, back))
      .setLabel('Back')
      .setEmoji('🔙')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(buildUiId(session.id, UiAction.Home))
      .setLabel('Overview')
      .setEmoji('🏠')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(buildUiId(session.id, UiAction.Close))
      .setLabel('Close')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Danger),
  ) as Row;
}

function roleList(roleIds: string[]): string {
  if (roleIds.length === 0) return '*none set*';
  return roleIds.map(id => `<@&${id}>`).join(', ');
}

export function buildPermHomeView(session: UiSession): RenderPayload {
  const staffRoles = getAccessRoles(session.guildId, 'staff');
  const adminRoles = getAccessRoles(session.guildId, 'admin');

  const view = embed('primary')
    .setTitle('🔑 Berechtigungen')
    .setDescription(
      'Who can do what? Two layers work together:\n\n' +
        '**1. Access roles** — define which roles count as staff or admin. ' +
        'With none set, the bot falls back to the Discord permissions *Moderate Members* and *Manage Server*.\n' +
        '**2. Fine-grained overrides** — per command or even per single subcommand. ' +
        'A fine-grained override always beats the access roles.\n\n' +
        'The server owner and anyone with the Administrator permission can always reach everything.',
    )
    .addFields(
      { name: `${LEVEL_LABEL.staff}roles`, value: roleList(staffRoles) },
      { name: `${LEVEL_LABEL.admin}roles`, value: roleList(adminRoles) },
    );

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildUiId(session.id, UiAction.PermLevelPick, 'staff'))
      .setLabel('Teamroles')
      .setEmoji('🛡️')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(buildUiId(session.id, UiAction.PermLevelPick, 'admin'))
      .setLabel('Adminroles')
      .setEmoji('⚙️')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(buildUiId(session.id, UiAction.PermNodePick, 0))
      .setLabel('Overrides')
      .setEmoji('🎚️')
      .setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [view], components: [buttons as Row, navRow(session, UiAction.Home)] };
}

export function buildPermLevelView(session: UiSession): RenderPayload {
  const level: AccessLevel = session.permLevel === 'admin' ? 'admin' : 'staff';
  const current = getAccessRoles(session.guildId, level);

  const view = embed('primary')
    .setTitle(`${LEVEL_LABEL[level]}roles`)
    .setDescription(
      level === 'staff'
        ? 'These roles open `/staff` and all staff features. Your selection **replaces** the current list — so always pick every role you want at once.'
        : 'Diese Rollen öffnen `/config` und alle Admin-Funktionen. Adminroles gelten automatisch auch als Teamroles. Die Auswahl **ersetzt** die bisherige Liste.',
    )
    .addFields({ name: 'Aktuell', value: roleList(current) });

  const picker = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId(buildUiId(session.id, UiAction.PermLevelRoles, level))
      .setPlaceholder('Select roles (multiple)')
      .setMinValues(0)
      .setMaxValues(20),
  );

  return { embeds: [view], components: [picker as Row, navRow(session, UiAction.PermHome)] };
}

export function buildPermNodeListView(session: UiSession): RenderPayload {
  const nodes = getCatalog().nodes;
  const pages = Math.max(1, Math.ceil(nodes.length / NODE_PAGE_SIZE));
  const page = Math.min(session.permPage, pages - 1);
  const slice = nodes.slice(page * NODE_PAGE_SIZE, page * NODE_PAGE_SIZE + NODE_PAGE_SIZE);

  const view = embed('primary')
    .setTitle('🎚️ Overrides')
    .setDescription(
      'Pick the command or subcommand whose access you want to change. ' +
        'Rules inherit downward: a rule on `cmd.security` applies to all its subcommands, ' +
        'as long as nothing more specific is set there.',
    )
    .setFooter({ text: `Seite ${page + 1}/${pages} · ${nodes.length} nodes` });

  const menu = new StringSelectMenuBuilder()
    .setCustomId(buildUiId(session.id, UiAction.PermNodePick, page))
    .setPlaceholder('nodes auswählen')
    .setMinValues(1)
    .setMaxValues(1);

  for (const node of slice) {
    const override = getOverride(session.guildId, node.node);
    menu.addOptions(
      new StringSelectMenuOptionBuilder()
        .setValue(node.node)
        .setLabel(node.label.slice(0, 100))
        .setDescription(
          `${LEVEL_LABEL[node.level]} · ${
            override ? MODE_LABEL[override.mode] : 'Default'
          }`.slice(0, 100),
        ),
    );
  }

  const pager = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildUiId(session.id, UiAction.Page, Math.max(0, page - 1)))
      .setLabel('Backblättern')
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(buildUiId(session.id, UiAction.Page, Math.min(pages - 1, page + 1)))
      .setLabel('Weiterblättern')
      .setEmoji('▶️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= pages - 1),
  );

  return {
    embeds: [view],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu) as Row,
      pager as Row,
      navRow(session, UiAction.PermHome),
    ],
  };
}

export function buildPermNodeView(session: UiSession): RenderPayload {
  const node = session.permNode ?? '';
  const meta = getCatalog().nodes.find(n => n.node === node);
  const override = getOverride(session.guildId, node);
  const mode: OverrideMode = override?.mode ?? 'inherit';

  const view = embed('primary')
    .setTitle(`🎚️ ${meta?.label ?? node}`)
    .setDescription(
      `nodes \`${node}\`\n\n` +
        '**Default** — Zugriff über die Zugriffsrollen bzw. Discord-Rechte.\n' +
        '**Allow for everyone** — jedes Mitglied darf diesen Punkt nutzen.\n' +
        '**Block entirely** — niemand außer Owner und Administratoren.\n' +
        '**Specific roles only** — exakt die unten gewählten Rollen.',
    )
    .addFields(
      { name: 'Default tier', value: meta ? LEVEL_LABEL[meta.level] : '—', inline: true },
      { name: 'Current mode', value: MODE_LABEL[mode], inline: true },
      { name: 'Allowed roles', value: roleList(override?.roleIds ?? []) },
    );

  const modeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildUiId(session.id, UiAction.PermNodeMode, 'inherit'))
      .setLabel('Default')
      .setStyle(mode === 'inherit' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(buildUiId(session.id, UiAction.PermNodeMode, 'allow'))
      .setLabel('Everyone')
      .setStyle(mode === 'allow' ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(buildUiId(session.id, UiAction.PermNodeMode, 'deny'))
      .setLabel('Block')
      .setStyle(mode === 'deny' ? ButtonStyle.Danger : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(buildUiId(session.id, UiAction.PermNodeMode, 'roles'))
      .setLabel('Roles only')
      .setStyle(mode === 'roles' ? ButtonStyle.Primary : ButtonStyle.Secondary),
  );

  const roleRow = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId(buildUiId(session.id, UiAction.PermNodeRoles))
      .setPlaceholder('Rollen für diesen nodes (setzt Modus auf „Roles only“)')
      .setMinValues(0)
      .setMaxValues(20),
  );

  return {
    embeds: [view],
    components: [modeRow as Row, roleRow as Row, navRow(session, UiAction.PermNodePick)],
  };
}
