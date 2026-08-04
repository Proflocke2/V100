/**
 * src/ui/publicCommands.ts
 *
 * The only slash commands that get registered with Discord.
 *
 * Every other command file stays loaded in `client.commands` — the wizard
 * invokes them through the interaction bridge — it simply no longer clutters
 * the autocomplete list. That is the whole "49 → 5" reduction, and it is
 * reversible per deployment via `LEGACY_COMMANDS=true`, which registers the
 * full historical set alongside the hubs for anyone who prefers typing.
 *
 * Kept deliberately free of imports so both deploy.ts and catalog.ts can pull
 * it in without a cycle.
 */

export const PUBLIC_COMMANDS = new Set<string>([
  'menu',   // member hub
  'games',  // game launcher
  'staff',  // moderation & team tools
  'config', // administration
  'help',   // existing paginated help — already component-driven
  // These carry file-upload subcommands (backup JSON import, avatar/banner
  // images) that Discord cannot collect from a button, so they stay registered
  // as standalone commands. Every non-upload subcommand they own is still
  // reachable through the hubs as well.
  'bot-backup',
  'server-backup',
  'bot-customize',
]);

/** Legacy mode keeps every historical command registered next to the hubs. */
export function legacyCommandsEnabled(): boolean {
  return process.env.LEGACY_COMMANDS === 'true';
}
