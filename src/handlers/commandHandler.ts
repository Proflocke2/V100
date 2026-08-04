import { readdirSync } from 'fs';
import path from 'path';
import { BotClient, Command } from '../utils/types';

export async function loadCommands(client: BotClient) {
  const cmdDir = path.join(__dirname, '../commands');
  const folders = readdirSync(cmdDir);

  for (const folder of folders) {
    const files = readdirSync(path.join(cmdDir, folder)).filter(f => (f.endsWith('.js') || f.endsWith('.ts')) && !f.endsWith('.d.ts'));
    for (const file of files) {
      const cmd = require(path.join(cmdDir, folder, file)) as { default?: Command };
      const def = cmd.default;
      if (def && def.data && typeof def.execute === 'function') {
        const name = def.data.name as string;
        if (client.commands.has(name)) {
          console.warn(`[Commands] WARNING: duplicate command name "${name}" in ${file} — overwriting previous definition.`);
        }
        client.commands.set(name, def);
      }
    }
  }

  console.log(`[Commands] Loaded ${client.commands.size} commands`);
}
