import { REST, Routes, SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder } from 'discord.js';
import { readdirSync } from 'fs';
import path from 'path';
import { Command } from '../utils/types';
import {
  COMMAND_DESC_LOCALIZATIONS,
  COMMAND_NAME_LOCALIZATIONS,
} from '../i18n/commandDescriptions';
import { PUBLIC_COMMANDS, legacyCommandsEnabled } from '../ui/publicCommands';

/**
 * Discord's bulk-overwrite PUT is atomic: if ONE command in the array fails
 * Discord's *server-side* validation (which is stricter than what discord.js
 * checks client-side — e.g. locale-specific length limits, permission
 * bitfield edge cases), the ENTIRE PUT is rejected and every command that
 * guild already had stays exactly as it was, including long-removed ones.
 * That's silent and looks like "nothing new deployed, old junk still there".
 *
 * This pulls the real reason out of a DiscordAPIError instead of the
 * generic "Invalid Form Body" that `err.message` gives you.
 */
function describeDiscordError(err: unknown): string {
  if (err && typeof err === 'object') {
    const anyErr = err as any;
    const parts: string[] = [];
    if (anyErr.status) parts.push(`HTTP ${anyErr.status}`);
    if (anyErr.code) parts.push(`code ${anyErr.code}`);
    if (anyErr.rawError?.errors) {
      parts.push(JSON.stringify(anyErr.rawError.errors));
    } else if (anyErr.rawError?.message) {
      parts.push(anyErr.rawError.message);
    } else if (anyErr.message) {
      parts.push(anyErr.message);
    }
    if (parts.length > 0) return parts.join(' — ');
  }
  return String(err);
}

/**
 * Applies Discord locale-aware description (and optionally name) localizations
 * to a SlashCommandBuilder before it is serialized and uploaded.
 *
 * This is what makes command descriptions appear in the user's own language
 * inside the Discord client — completely independent of the server language.
 */
function applyLocalizations(
  builder: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder,
): void {
  const name = builder.name;

  const descLocs = COMMAND_DESC_LOCALIZATIONS[name];
  if (descLocs && Object.keys(descLocs).length > 0) {
    (builder as SlashCommandBuilder).setDescriptionLocalizations(descLocs);
  }

  const nameLocs = COMMAND_NAME_LOCALIZATIONS[name];
  if (nameLocs && Object.keys(nameLocs).length > 0) {
    (builder as SlashCommandBuilder).setNameLocalizations(nameLocs);
  }
}

export interface DeploySummary {
  totalCommands: number;
  brokenFiles: string[];        // "folder/file: reason" — never even made it into the array
  guildsOk: number;
  guildsDegraded: number;       // bulk PUT failed, recovered via one-by-one
  guildsTotal: number;
  rejectedCommands: string[];   // "/name in guild <id>: reason" — from degraded guilds
}

/**
 * Local pre-flight replica of Discord's server-side rule that discord.js
 * does NOT validate: within one options level, every required option must
 * come before all non-required ones (APPLICATION_COMMAND_OPTIONS_REQUIRED_INVALID).
 * One violation anywhere aborts the ENTIRE bulk PUT for a guild — which is
 * exactly the "no new commands, old junk still visible" failure this bot
 * has now hit twice (/backup, both times). Returns human-readable paths
 * like "/backup > auto-enable > delivery" instead of Discord's numeric
 * index maze ({"54":{"options":{"7":...}}}).
 */
function findRequiredOrderViolations(json: any): string[] {
  const violations: string[] = [];
  const walk = (opts: any[] | undefined, ctx: string): void => {
    if (!opts) return;
    let seenOptional = false;
    for (const o of opts) {
      if (o.type === 1 /* SUB_COMMAND */ || o.type === 2 /* SUB_COMMAND_GROUP */) {
        walk(o.options, `${ctx} > ${o.name}`);
      } else {
        if (o.required && seenOptional) violations.push(`${ctx} > ${o.name} (required after optional)`);
        if (!o.required) seenOptional = true;
      }
    }
  };
  walk(json.options, `/${json.name}`);
  return violations;
}

/**
 * Reads every command file off disk and builds the final JSON array Discord
 * expects, applying localizations and pre-flight validation. Pulled out of
 * deployCommands() so both the full multi-guild deploy AND the single-guild
 * "just joined" deploy (deployToGuild(), below) build the exact same command
 * set from the exact same code path — no risk of the two ever drifting apart.
 */
function buildCommandSet(): { cmds: unknown[]; brokenFiles: string[]; localized: number; duplicatesSkipped: number } {
  const cmdsByName = new Map<string, unknown>();
  const cmdDir = path.join(__dirname, '../commands');

  let localized = 0;
  let duplicatesSkipped = 0;

  let skippedBroken = 0;
  const brokenFiles: string[] = [];

  for (const folder of readdirSync(cmdDir)) {
    const files = readdirSync(path.join(cmdDir, folder)).filter(f => (f.endsWith('.js') || f.endsWith('.ts')) && !f.endsWith('.d.ts'));
    for (const file of files) {
      // One broken command file (throw during require, or during
      // applyLocalizations/toJSON) must never take the other 87 down with
      // it — skip just that file and keep going, loudly.
      try {
        const cmd = require(path.join(cmdDir, folder, file)) as { default: Command };
        if (cmd.default?.data) {
          const builder = cmd.default.data as SlashCommandBuilder;

          // Command reduction: only the wizard hubs are registered with
          // Discord. Everything else stays loaded in client.commands and is
          // reachable through the hub UI, so no feature is lost — it just no
          // longer floods the slash-command list. LEGACY_COMMANDS=true brings
          // the full historical set back for servers that prefer typing.
          if (!PUBLIC_COMMANDS.has(builder.name) && !legacyCommandsEnabled()) {
            continue;
          }
          applyLocalizations(builder);
          if (COMMAND_DESC_LOCALIZATIONS[builder.name]) localized++;

          // Defensive dedupe: two command files must never produce the same
          // top-level name. Bulk-registering duplicate names causes Discord
          // to reject the whole PUT (or silently show the command twice in
          // the client). Last one found wins; the collision is logged loudly
          // so it gets fixed at the source instead of hidden.
          if (cmdsByName.has(builder.name)) {
            duplicatesSkipped++;
            console.warn(`[Deploy] WARNING: duplicate command name "${builder.name}" in ${file} — overwriting previous definition.`);
          }

          const json = builder.toJSON();

          // Pre-flight: exclude any command that would fail Discord's
          // required-option ordering rule, so ONE bad command can't abort
          // the whole bulk PUT and hide all the others (again).
          const orderViolations = findRequiredOrderViolations(json);
          if (orderViolations.length > 0) {
            skippedBroken++;
            const reason = `required-option ordering: ${orderViolations.join('; ')}`;
            brokenFiles.push(`${folder}/${file}: ${reason}`);
            console.error(`[Deploy] EXCLUDING /${builder.name} (${folder}/${file}) — ${reason}`);
            continue;
          }

          cmdsByName.set(builder.name, json);
        }
      } catch (err) {
        skippedBroken++;
        const reason = describeDiscordError(err);
        brokenFiles.push(`${folder}/${file}: ${reason}`);
        console.error(`[Deploy] SKIPPING ${folder}/${file} — failed to build: ${reason}`);
      }
    }
  }

  if (skippedBroken > 0) {
    console.error(`[Deploy] ${skippedBroken} command file(s) skipped due to build errors — see above. Every other command still deploys normally.`);
  }

  const cmds = Array.from(cmdsByName.values());

  console.log(`[Deploy] Applied localizations to ${localized} commands (de/fr/ru)`);
  if (duplicatesSkipped > 0) {
    console.warn(`[Deploy] ${duplicatesSkipped} duplicate command name(s) detected and collapsed — check the warnings above.`);
  }

  return { cmds, brokenFiles, localized, duplicatesSkipped };
}

export async function deployCommands(token: string, clientId: string): Promise<DeploySummary> {
  const { cmds, brokenFiles } = buildCommandSet();
  const rejectedCommands: string[] = [];

  const rest = new REST().setToken(token);

  // Multi-server: register the exact same command set on EVERY guild the
  // bot is currently a member of — instead of only the single GUILD_ID
  // server. Guild-scoped commands still propagate instantly (vs ~1h for
  // global), so this keeps that speed while covering all servers, including
  // ones the bot joins later (this runs automatically on every boot, plus
  // manually via /deploy).
  let guilds: { id: string }[] = [];
  try {
    guilds = await rest.get(Routes.userGuilds()) as { id: string }[];
  } catch (err) {
    console.error('[Deploy] Could not fetch guild list — falling back to global deploy:', err instanceof Error ? err.message : err);
    await rest.put(Routes.applicationCommands(clientId), { body: cmds });
    console.log(`[Deploy] Registered ${cmds.length} slash commands globally (may take ~1h)`);
    return { totalCommands: cmds.length, brokenFiles, guildsOk: 1, guildsDegraded: 0, guildsTotal: 1, rejectedCommands };
  }

  let ok = 0;
  let okDegraded = 0;
  for (const g of guilds) {
    try {
      await rest.put(Routes.applicationGuildCommands(clientId, g.id), { body: cmds });
      ok++;
    } catch (err) {
      // Bulk overwrite got rejected — Discord doesn't say which command did
      // it, only that the array as a whole is invalid. Falling back to
      // registering one-by-one means the 86 good commands still go live
      // instead of the whole guild silently keeping its old command set;
      // whichever single command fails gets named explicitly below.
      console.error(`[Deploy] Bulk register failed in guild ${g.id}: ${describeDiscordError(err)}`);
      console.warn(`[Deploy] Falling back to one-by-one registration for guild ${g.id} to isolate the bad command...`);

      let individualOk = 0;
      for (const cmdJson of cmds) {
        try {
          await rest.post(Routes.applicationGuildCommands(clientId, g.id), { body: cmdJson });
          individualOk++;
        } catch (innerErr) {
          const name = (cmdJson as any)?.name ?? '(unknown)';
          const reason = describeDiscordError(innerErr);
          rejectedCommands.push(`/${name} in guild ${g.id}: ${reason}`);
          console.error(`[Deploy] REJECTED by Discord: "/${name}" in guild ${g.id} — ${reason}`);
        }
      }
      console.warn(`[Deploy] Guild ${g.id}: ${individualOk}/${cmds.length} commands registered individually.`);
      if (individualOk > 0) okDegraded++;
    }
  }
  console.log(`[Deploy] Registered ${cmds.length} slash commands to ${ok}/${guilds.length} guild(s) (instant)${okDegraded > 0 ? `, ${okDegraded} guild(s) recovered via fallback` : ''}`);

  // Clear any stray GLOBAL commands from an earlier global-deploy era.
  // Without this, old global registrations keep living forever alongside
  // the per-guild ones — every command appears twice in Discord, and
  // clicking the orphaned copy times out ("app did not respond") because
  // it no longer matches anything in client.commands.
  try {
    const existingGlobal = await rest.get(Routes.applicationCommands(clientId)) as unknown[];
    if (existingGlobal.length > 0) {
      await rest.put(Routes.applicationCommands(clientId), { body: [] });
      console.log(`[Deploy] Cleared ${existingGlobal.length} stray global command(s) to prevent duplicates.`);
    }
  } catch (err) {
    console.warn('[Deploy] Could not check/clear global commands (non-fatal):', err instanceof Error ? err.message : err);
  }

  return {
    totalCommands: cmds.length,
    brokenFiles,
    guildsOk: ok,
    guildsDegraded: okDegraded,
    guildsTotal: guilds.length,
    rejectedCommands,
  };
}

export interface SingleGuildDeployResult {
  totalCommands: number;
  ok: boolean;          // true if the bulk PUT succeeded, or the fallback recovered at least 1 command
  degraded: boolean;    // true if bulk PUT failed and it had to fall back to one-by-one
  registered: number;   // how many commands actually made it live in this guild
  brokenFiles: string[];
  rejectedCommands: string[];
}

/**
 * Registers the full command set in exactly ONE guild — used by
 * events/guildCreate.ts so a server gets every slash command the instant
 * the bot joins, instead of waiting for the next boot/redeploy (previously
 * the bot only registered commands to guilds it was *already* in at boot
 * time, so freshly-joined servers had zero commands, including /deploy
 * itself, until someone manually ran the standalone copy-commands script).
 *
 * Reuses the exact same buildCommandSet() as the full multi-guild deploy —
 * same localizations, same pre-flight validation, same broken-file
 * handling — just scoped to a single guild ID and with the same bulk →
 * one-by-one fallback in case this particular guild rejects something.
 */
export async function deployToGuild(token: string, clientId: string, guildId: string): Promise<SingleGuildDeployResult> {
  const { cmds, brokenFiles } = buildCommandSet();
  const rejectedCommands: string[] = [];
  const rest = new REST().setToken(token);

  try {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: cmds });
    console.log(`[Deploy] Registered ${cmds.length} slash commands to newly-joined guild ${guildId} (instant)`);
    return { totalCommands: cmds.length, ok: true, degraded: false, registered: cmds.length, brokenFiles, rejectedCommands };
  } catch (err) {
    console.error(`[Deploy] Bulk register failed in newly-joined guild ${guildId}: ${describeDiscordError(err)}`);
    console.warn(`[Deploy] Falling back to one-by-one registration for guild ${guildId}...`);

    let individualOk = 0;
    for (const cmdJson of cmds) {
      try {
        await rest.post(Routes.applicationGuildCommands(clientId, guildId), { body: cmdJson });
        individualOk++;
      } catch (innerErr) {
        const name = (cmdJson as any)?.name ?? '(unknown)';
        const reason = describeDiscordError(innerErr);
        rejectedCommands.push(`/${name} in guild ${guildId}: ${reason}`);
        console.error(`[Deploy] REJECTED by Discord: "/${name}" in guild ${guildId} — ${reason}`);
      }
    }
    console.warn(`[Deploy] Guild ${guildId}: ${individualOk}/${cmds.length} commands registered individually.`);
    return { totalCommands: cmds.length, ok: individualOk > 0, degraded: true, registered: individualOk, brokenFiles, rejectedCommands };
  }
}

/**
 * wipeAllCommands — emergency hard reset.
 *
 * Deletes every GLOBAL command and every GUILD command in all guilds the bot
 * is in, then logs exactly what was found and removed. Triggered by setting
 * WIPE_COMMANDS=true in the environment (see index.ts).
 *
 * Why this exists: a normal bulk PUT only replaces the command set in the
 * scope it targets. If stale commands were registered in a scope the current
 * deploy no longer touches — or by a second service sharing the same token —
 * they survive forever and show up alongside the correct ones. Logging the
 * per-scope counts also identifies WHERE the extra commands actually live.
 */
export async function wipeAllCommands(token: string, clientId: string): Promise<void> {
  const rest = new REST().setToken(token);

  console.log('[Wipe] WIPE_COMMANDS=true — clearing every registered command…');

  try {
    const globals = await rest.get(Routes.applicationCommands(clientId)) as unknown[];
    console.log(`[Wipe] GLOBAL scope: found ${globals.length} command(s).`);
    if (globals.length > 0) {
      await rest.put(Routes.applicationCommands(clientId), { body: [] });
      console.log(`[Wipe] GLOBAL scope: cleared ${globals.length} command(s).`);
    }
  } catch (err) {
    console.error('[Wipe] Could not clear global commands:', err instanceof Error ? err.message : err);
  }

  let guilds: { id: string; name?: string }[] = [];
  try {
    guilds = await rest.get(Routes.userGuilds()) as { id: string; name?: string }[];
  } catch (err) {
    console.error('[Wipe] Could not fetch guild list:', err instanceof Error ? err.message : err);
    return;
  }

  console.log(`[Wipe] Bot is in ${guilds.length} guild(s).`);

  for (const g of guilds) {
    try {
      const existing = await rest.get(Routes.applicationGuildCommands(clientId, g.id)) as unknown[];
      await rest.put(Routes.applicationGuildCommands(clientId, g.id), { body: [] });
      console.log(`[Wipe] Guild ${g.id} (${g.name ?? 'unknown'}): found and cleared ${existing.length} command(s).`);
    } catch (err) {
      console.error(`[Wipe] Guild ${g.id}: failed — ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log('[Wipe] Done — all commands removed. Re-registering the current set now…');
}
