import { Role } from 'discord.js';
import { logRoleCreate } from '../modules/moderation/modLog';

export default {
  async execute(role: Role) {
    await logRoleCreate(role).catch(() => {});
  },
};
