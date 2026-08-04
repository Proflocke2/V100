/**
 * modules/audit/configAudit.ts
 *
 * Lightweight "who changed what, when" trail for config changes. NOT wired
 * into every single settings write in the bot (that touches dozens of
 * files) — scoped to the changes admins most want visibility into:
 * security/anti-nuke settings, per-channel exceptions, command
 * disable/enable, welcome toggles, and reaction-role panel structure.
 *
 * Never throws — an audit log write failing must never break the actual
 * config change it's describing.
 */

import db from '../../database/db';

export function logConfigChange(guildId: string, userId: string, action: string, detail?: string): void {
  try {
    db.prepare(
      'INSERT INTO config_audit_log (guild_id, user_id, action, detail) VALUES (?, ?, ?, ?)',
    ).run(guildId, userId, action, detail ?? null);
  } catch (err) {
    console.error('[ConfigAudit] Failed to log change (non-fatal):', err);
  }
}

export interface ConfigAuditRow {
  id: number;
  guild_id: string;
  user_id: string;
  action: string;
  detail: string | null;
  created_at: number;
}

export function getRecentConfigChanges(guildId: string, limit = 20): ConfigAuditRow[] {
  return db.prepare(
    'SELECT * FROM config_audit_log WHERE guild_id = ? ORDER BY created_at DESC LIMIT ?',
  ).all(guildId, limit) as ConfigAuditRow[];
}
