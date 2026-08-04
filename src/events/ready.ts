import { Client, ActivityType } from 'discord.js';
import { BotClient } from '../utils/types';
import { StatsService } from '../stats/StatsService';

export default {
  name: 'clientReady',
  once: true,
  async execute(client: Client & BotClient) {
    console.log(`[Bot] Eingeloggt als ${client.user?.tag}`);
    client.user?.setActivity('Moderation & Fun 🎮', { type: ActivityType.Watching });
    StatsService.initializeAll(id => client.guilds.cache.get(id)).catch(err =>
      console.error('[Stats] Initialization error:', err)
    );
  },
};
