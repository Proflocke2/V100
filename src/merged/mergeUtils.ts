/**
 * mergeUtils.ts
 *
 * Helpers for combining several standalone commands into one parent command
 * to stay under Discord's 100-command limit — WITHOUT changing any of the
 * original command logic.
 *
 * Two strategies:
 *   wrapAsSubcommand  — takes a plain-option command (no subcommands of its own)
 *                       and exposes its options under a named subcommand.
 *   copySubcommands   — takes a command that already uses subcommands and copies
 *                       them verbatim into the parent (flat merge).
 *
 * Routing in the parent execute() simply forwards to the original execute(),
 * which still reads interaction.options.* exactly as before — option access
 * resolves within the active subcommand context, so nothing breaks.
 */

import {
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
  ChatInputCommandInteraction,
} from 'discord.js';

export interface OriginalCommand {
  data: SlashCommandBuilder | { options: unknown[]; name: string };
  execute: (interaction: ChatInputCommandInteraction) => Promise<unknown> | unknown;
}

/**
 * Adds a named subcommand to `parent` whose options are copied from a
 * plain-option original command.
 */
export function wrapAsSubcommand(
  parent: SlashCommandBuilder,
  name: string,
  description: string,
  original: OriginalCommand,
): void {
  parent.addSubcommand(sub => {
    sub.setName(name).setDescription(description);
    const opts = (original.data as { options: unknown[] }).options ?? [];
    for (const opt of opts) {
      (sub as SlashCommandSubcommandBuilder).options.push(opt as never);
    }
    return sub;
  });
}

/**
 * Copies all subcommands from an original (subcommand-based) command into
 * `parent`. Returns the set of subcommand names that belong to this original,
 * for routing.
 */
export function copySubcommands(
  parent: SlashCommandBuilder,
  original: OriginalCommand,
): Set<string> {
  const owned = new Set<string>();
  const opts = (original.data as { options: unknown[] }).options ?? [];
  for (const sub of opts) {
    parent.options.push(sub as never);
    const name = (sub as { name?: string }).name;
    if (name) owned.add(name);
  }
  return owned;
}

/**
 * Nests an original command that already has its own subcommands under a
 * named subcommand GROUP on `parent` (e.g. `/security antinuke setup`).
 * Discord only allows one level of subcommand groups, so `original` must
 * itself be a flat subcommand-based command (not one that already uses
 * subcommand groups) - that case must stay standalone instead.
 * Routing is unaffected: the original's execute() still reads
 * interaction.options.getSubcommand() exactly as before, regardless of the
 * group it's nested under.
 */
export function copyAsSubcommandGroup(
  parent: SlashCommandBuilder,
  groupName: string,
  groupDescription: string,
  original: OriginalCommand,
): void {
  parent.addSubcommandGroup(group => {
    group.setName(groupName).setDescription(groupDescription);
    const opts = (original.data as { options: unknown[] }).options ?? [];
    for (const sub of opts) {
      (group as unknown as { options: unknown[] }).options.push(sub as never);
    }
    return group;
  });
}
