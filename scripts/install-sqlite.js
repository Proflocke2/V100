/**
 * Lädt das passende better-sqlite3 Binary für die aktuelle Platform herunter.
 * Wird als postinstall ausgeführt.
 */
const { execSync, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const modulePath = path.join(__dirname, '..', 'node_modules', 'better-sqlite3');
const binaryPath = path.join(modulePath, 'build', 'Release', 'better_sqlite3.node');

// Falls Binary bereits existiert, nichts tun
if (fs.existsSync(binaryPath)) {
  console.log('[sqlite] Binary bereits vorhanden ✓');
  process.exit(0);
}

console.log('[sqlite] Versuche better-sqlite3 zu kompilieren...');

const result = spawnSync('npm', ['rebuild', 'better-sqlite3'], {
  cwd: path.join(__dirname, '..'),
  stdio: 'inherit',
  shell: true,
});

if (result.status === 0) {
  console.log('[sqlite] Kompilierung erfolgreich ✓');
} else {
  console.warn('[sqlite] Kompilierung fehlgeschlagen — versuche node-pre-gyp download...');
  
  const preGyp = path.join(modulePath, 'node_modules', '.bin', 'node-pre-gyp');
  const result2 = spawnSync(preGyp, ['install', '--fallback-to-build=false'], {
    cwd: modulePath,
    stdio: 'inherit',
    shell: true,
  });
  
  if (result2.status !== 0) {
    console.error('[sqlite] FEHLER: better-sqlite3 konnte nicht installiert werden!');
    process.exit(1);
  }
}
