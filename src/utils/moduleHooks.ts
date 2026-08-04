/**
 * moduleHooks.ts
 *
 * Some commands are pure interactive actions (/ping, /avatar, /dice) —
 * for those, blocking the slash command via /disable already disables
 * "the action", there's nothing else running in the background.
 *
 * Others are just the config front-end for a passive system that keeps
 * running independently of the command (XP gain on every message,
 * automod scanning every message, the verify button, etc.). For those,
 * /disable blocking the command alone does NOT stop the underlying
 * feature — e.g. /disable level would stop people running /level, but
 * XP would keep being awarded on every message, because messageCreate.ts
 * checks guild.level_enabled directly, not whether the command is blocked.
 *
 * This registry closes that gap: whenever a command's real effect lives
 * outside its own execute() (event listeners, schedulers), add a hook here
 * so /disable and /enable also flip the actual feature flag.
 */

import { setGuildValue } from '../database/db';
import { VerificationService } from '../services/verificationService';

export interface ModuleHook {
  onDisable(guildId: string): void;
  onEnable(guildId: string): void;
}

export const MODULE_HOOKS: Record<string, ModuleHook> = {
  // /level → messageCreate.ts gates XP gain on guilds.level_enabled
  level: {
    onDisable: guildId => setGuildValue(guildId, 'level_enabled', 0),
    onEnable:  guildId => setGuildValue(guildId, 'level_enabled', 1),
  },

  // /automod → automod message scanner gates on guilds.automod_enabled
  automod: {
    onDisable: guildId => setGuildValue(guildId, 'automod_enabled', 0),
    onEnable:  guildId => setGuildValue(guildId, 'automod_enabled', 1),
  },

  // /v-setup → verify button / captcha flow gates on verification_config.enabled
  'v-setup': {
    onDisable: guildId => {
      if (VerificationService.getConfig(guildId)) {
        VerificationService.saveConfig({ guildId, enabled: false });
      }
    },
    onEnable: guildId => {
      if (VerificationService.getConfig(guildId)) {
        VerificationService.saveConfig({ guildId, enabled: true });
      }
    },
  },
};
