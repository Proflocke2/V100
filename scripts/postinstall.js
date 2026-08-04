const { execSync } = require('child_process');
const path = require('path');

try {
  require('better-sqlite3');
  console.log('[postinstall] better-sqlite3 OK');
} catch (e) {
  console.log('[postinstall] Rebuilding better-sqlite3...');
  try {
    execSync('npm rebuild better-sqlite3 --build-from-source', {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..'),
    });
    console.log('[postinstall] Done ✓');
  } catch (err) {
    console.error('[postinstall] Failed:', err.message);
    process.exit(1);
  }
}
