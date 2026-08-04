import { Role } from 'discord.js';
import { logRoleDelete } from '../modules/moderation/modLog';

export default {
  async execute(role: Role) {
    await logRoleDelete(role).catch(() => {});
  },
};
