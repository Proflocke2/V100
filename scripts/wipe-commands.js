/**
 * wipe-commands.js — hard reset of every slash command this bot has registered.
 *
 * Deletes ALL global commands and ALL guild commands in every guild the bot
 * is in. Use when Discord shows stale/duplicate commands that no longer match
 * the code. After running, restart the bot: it re-registers the current set
 * on boot.
 *
 * Usage:
 *   node scripts/wipe-commands.js
 *
 * Requires BOT_TOKEN and CLIENT_ID in the environment (or a .env file).
 */

require('dotenv').config();
const { REST, Routes } = require('discord.js');

const token = process.env.BOT_TOKEN;
const clientId = process.env.CLIENT_ID;

if (!token || !clientId) {
  console.error('Missing BOT_TOKEN or CLIENT_ID in environment.');
  process.exit(1);
}

const rest = new REST().setToken(token);

(async () => {
  try {
    const globals = await rest.get(Routes.applicationCommands(clientId));
    console.log(`Global commands found: ${globals.length}`);
    if (globals.length > 0) {
      await rest.put(Routes.applicationCommands(clientId), { body: [] });
      console.log(`Cleared ${globals.length} global command(s).`);
    }
  } catch (err) {
    console.error('Failed clearing global commands:', err.message);
  }

  let guilds = [];
  try {
    guilds = await rest.get(Routes.userGuilds());
  } catch (err) {
    console.error('Could not fetch guild list:', err.message);
    process.exit(1);
  }

  console.log(`Bot is in ${guilds.length} guild(s).`);

  for (const g of guilds) {
    try {
      const existing = await rest.get(Routes.applicationGuildCommands(clientId, g.id));
      await rest.put(Routes.applicationGuildCommands(clientId, g.id), { body: [] });
      console.log(`Guild ${g.id} (${g.name ?? 'unknown'}): cleared ${existing.length} command(s).`);
    } catch (err) {
      console.error(`Guild ${g.id}: failed — ${err.message}`);
    }
  }

  console.log('\nDone. Every command is now removed.');
  console.log('Restart the bot to re-register the current 48 commands.');
})();
