import { readdirSync } from 'fs';
import path from 'path';
import { BotClient } from '../utils/types';
import { logError } from '../modules/errorTracking/service';

export async function loadEvents(client: BotClient) {
  const eventsDir = path.join(__dirname, '../events');
  const files = readdirSync(eventsDir).filter(f => (f.endsWith('.js') || f.endsWith('.ts')) && !f.endsWith('.d.ts'));

  for (const file of files) {
    const event = require(path.join(eventsDir, file));
    const def = event.default;
    // Use exported name if available, otherwise use filename
    const name = def?.name || file.replace(/\.(ts|js)$/, '');
    const onError = (err: unknown) => {
      console.error(`[Event:${name}]`, err);
      logError(`event:${name}`, err);
    };
    if (def?.once) {
      client.once(name, (...args) => Promise.resolve(def.execute(...args, client)).catch(onError));
    } else {
      client.on(name, (...args) => Promise.resolve(def.execute(...args, client)).catch(onError));
    }
  }

  console.log(`[Events] Loaded ${files.length} events`);
}
