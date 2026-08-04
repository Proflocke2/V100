import { Role } from 'discord.js';
import { logRoleUpdate } from '../modules/moderation/modLog';

export default {
  async execute(oldRole: Role, newRole: Role) {
    await logRoleUpdate(oldRole, newRole).catch(() => {});
  },
};
