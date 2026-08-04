/**
 * prestart.js — no-op stub.
 *
 * The GitHub DB-sync feature has been removed for legal reasons
 * (GDPR international data transfer, risk of accidental public repo exposure).
 *
 * Previously this script pulled bot.db from GitHub before startup.
 * Data persistence is now handled via the /bot-backup command and
 * can be manually exported/imported by server operators using
 * /bot-backup export and /bot-backup import.
 *
 * The render.yaml startCommand still calls `node prestart.js && node dist/index.js`
 * for forward compatibility — this script simply exits 0.
 */

process.exit(0);
