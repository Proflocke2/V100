/**
 * i18n — loads locale JSON files from disk into a single in-memory bundle.
 *
 * Layout:
 *   src/locales/en-US/common.json    -> bundle["common"]
 *   src/locales/en-US/tickets.json   -> bundle["tickets"]
 *   ...
 *
 * Hot-reload supported via reload() — useful when admins change a guild's
 * language and we want to re-render persistent messages.
 */

import { readdirSync, readFileSync, existsSync } from 'fs';
import path from 'path';
import { Locale, LocaleBundle, SUPPORTED_LOCALES } from './types';

/**
 * Resolve the locales directory.
 *
 * Order of attempts:
 *   1. Sibling of compiled output: dist/i18n/loader.js -> dist/locales
 *   2. Sibling of source:          src/i18n/loader.ts  -> src/locales
 *   3. Project-root fallback:      <cwd>/src/locales   (handles odd build layouts)
 *
 * The first directory that exists wins. Production users running `npm run build`
 * should add a copy step (or `tsc --resolveJsonModule` + bundler), but this
 * fallback chain means the bot starts even if they didn't.
 */
function resolveLocalesRoot(): string {
  const candidates = [
    path.join(__dirname, '..', 'locales'),
    path.resolve(__dirname, '..', '..', 'src', 'locales'),
    path.resolve(process.cwd(), 'src', 'locales'),
    path.resolve(process.cwd(), 'dist', 'locales'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  // Last resort — return first candidate; loadLocales() will warn.
  return candidates[0];
}

const localesRoot = resolveLocalesRoot();

const bundles: Map<Locale, LocaleBundle> = new Map();

/**
 * Load all locale files for all supported languages.
 * Called once on bot startup, but safe to call repeatedly.
 */
export function loadLocales(): void {
  bundles.clear();

  for (const locale of SUPPORTED_LOCALES) {
    const dir = path.join(localesRoot, locale);
    if (!existsSync(dir)) {
      console.warn(`[i18n] Missing locale directory: ${dir}`);
      bundles.set(locale, {});
      continue;
    }

    const bundle: LocaleBundle = {};
    const files = readdirSync(dir).filter(f => f.endsWith('.json'));

    for (const file of files) {
      const moduleName = file.replace(/\.json$/, '');
      const filePath = path.join(dir, file);
      try {
        const raw = readFileSync(filePath, 'utf-8');
        bundle[moduleName] = JSON.parse(raw);
      } catch (err) {
        console.error(`[i18n] Failed to load ${filePath}:`, err);
        bundle[moduleName] = {};
      }
    }

    bundles.set(locale, bundle);
  }

  console.log(`[i18n] Loaded locales: ${[...bundles.keys()].join(', ')}`);
}

/** Reload from disk — used when an admin edits locale files at runtime. */
export function reloadLocales(): void {
  loadLocales();
}

/** Internal: fetch the bundle object for a locale. Empty object if not loaded. */
export function getBundle(locale: Locale): LocaleBundle {
  return bundles.get(locale) ?? {};
}

/** Lazy-init: ensure bundles exist before first translate call. */
export function ensureLoaded(): void {
  if (bundles.size === 0) loadLocales();
}
