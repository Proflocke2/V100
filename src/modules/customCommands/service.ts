/**
 * CUSTOM COMMANDS — admins define simple named responses that anyone can
 * trigger via /cmd <name>. Autocomplete on the name field so users never
 * have to remember exact strings.
 *
 * Response types:
 *   text    — plain message (may contain Discord markdown)
 *   embed   — wrapped in a colored embed with optional title
 *
 * The actual execution is in /cmd; admin CRUD is in /cmd-admin.
 */

import db from '../../database/db';

db.exec(`
  CREATE TABLE IF NOT EXISTS custom_commands (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id    TEXT NOT NULL,
    name        TEXT NOT NULL,
    response    TEXT NOT NULL,
    title       TEXT,
    color       TEXT DEFAULT '#5865f2',
    use_embed   INTEGER DEFAULT 0,
    ephemeral   INTEGER DEFAULT 0,
    created_by  TEXT NOT NULL,
    uses        INTEGER DEFAULT 0,
    created_at  INTEGER DEFAULT (unixepoch()),
    UNIQUE (guild_id, name)
  );
`);

export interface CustomCommand {
  id: number; guild_id: string; name: string; response: string;
  title: string | null; color: string; use_embed: number; ephemeral: number;
  created_by: string; uses: number; created_at: number;
}

export function getCommand(guildId: string, name: string): CustomCommand | null {
  return (db.prepare('SELECT * FROM custom_commands WHERE guild_id = ? AND name = ?').get(guildId, name.toLowerCase()) as CustomCommand | undefined) ?? null;
}

export function listCommands(guildId: string): CustomCommand[] {
  return db.prepare('SELECT * FROM custom_commands WHERE guild_id = ? ORDER BY name ASC').all(guildId) as CustomCommand[];
}

export function upsertCommand(
  guildId: string, name: string, response: string, title: string | null,
  color: string, useEmbed: boolean, ephemeral: boolean, createdBy: string,
): void {
  db.prepare(`
    INSERT INTO custom_commands (guild_id, name, response, title, color, use_embed, ephemeral, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(guild_id, name) DO UPDATE SET
      response   = excluded.response,
      title      = excluded.title,
      color      = excluded.color,
      use_embed  = excluded.use_embed,
      ephemeral  = excluded.ephemeral
  `).run(guildId, name.toLowerCase(), response, title, color, useEmbed ? 1 : 0, ephemeral ? 1 : 0, createdBy);
}

export function deleteCommand(guildId: string, name: string): boolean {
  return db.prepare('DELETE FROM custom_commands WHERE guild_id = ? AND name = ?').run(guildId, name.toLowerCase()).changes > 0;
}

export function incrementUses(guildId: string, name: string): void {
  db.prepare('UPDATE custom_commands SET uses = uses + 1 WHERE guild_id = ? AND name = ?').run(guildId, name.toLowerCase());
}

/** Returns name list for Discord autocomplete (max 25). */
export function autocompleteNames(guildId: string, partial: string): string[] {
  const all = listCommands(guildId);
  const q   = partial.toLowerCase();
  return all.filter(c => c.name.startsWith(q)).slice(0, 25).map(c => c.name);
}
