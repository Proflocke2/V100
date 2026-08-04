/**
 * i18n — core translate function and guild-language resolution.
 *
 * Public surface:
 *   t(locale, key, opts)   – pure translate
 *   tGuild(guildId, key)   – resolve guild's language, then translate
 *   getGuildLocale(id)     – read guild language from DB (mapped to Locale)
 *   setGuildLocale(id, l)  – persist guild language
 *
 * Key format: "module.path.to.key"  (first segment = JSON file name)
 * Variable interpolation: "{name}" -> opts.vars.name
 *
 * Fallback chain: requested locale -> en-US -> opts.fallback -> key
 */

import db from '../database/db';
import {
  Locale,
  LocaleBundle,
  TranslateOptions,
  GuildTranslator,
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
} from './types';
import { ensureLoaded, getBundle } from './loader';

// Old single-letter codes ('en', 'de') still live in the DB. Map them in.
const LEGACY_TO_LOCALE: Record<string, Locale> = {
  en: 'en-US',
  de: 'de-DE',
  fr: 'fr-FR',
  ru: 'ru-RU',
  'en-US': 'en-US',
  'de-DE': 'de-DE',
  'fr-FR': 'fr-FR',
  'ru-RU': 'ru-RU',
};

export function normalizeLocale(input: string | null | undefined): Locale {
  if (!input) return DEFAULT_LOCALE;
  return LEGACY_TO_LOCALE[input] ?? DEFAULT_LOCALE;
}

export function isSupportedLocale(input: string): input is Locale {
  return (SUPPORTED_LOCALES as string[]).includes(input);
}

/**
 * Walk a dotted key into a nested locale namespace and return the leaf string.
 * Returns null if the key path doesn't resolve to a string.
 */
function lookup(bundle: LocaleBundle, key: string): string | null {
  const parts = key.split('.');
  let cur: unknown = bundle;
  for (const part of parts) {
    if (cur && typeof cur === 'object' && part in (cur as object)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return null;
    }
  }
  return typeof cur === 'string' ? cur : null;
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : `{${name}}`,
  );
}

/**
 * Reserved keys on the options object — anything else is treated as a placeholder
 * variable. This lets callers write `tGuild(gid, 'key', { user: 'a', count: 3 })`
 * instead of `tGuild(gid, 'key', { vars: { user: 'a', count: 3 } })`.
 */
const RESERVED_OPTS = new Set(['vars', 'locale', 'fallback']);

function extractVars(opts: TranslateOptions): Record<string, string | number> | undefined {
  // Explicit `vars` always wins; if absent, treat extra keys as placeholders.
  if (opts.vars) return opts.vars;
  const extracted: Record<string, string | number> = {};
  let any = false;
  for (const k of Object.keys(opts)) {
    if (RESERVED_OPTS.has(k)) continue;
    const v = (opts as Record<string, unknown>)[k];
    if (typeof v === 'string' || typeof v === 'number') {
      extracted[k] = v;
      any = true;
    }
  }
  return any ? extracted : undefined;
}

/**
 * Pure translate — does not read from DB. Use this when you already know the locale.
 */
export function t(locale: Locale, key: string, opts: TranslateOptions = {}): string {
  ensureLoaded();
  const vars = extractVars(opts);

  // Try requested locale first
  const primary = lookup(getBundle(locale), key);
  if (primary !== null) return interpolate(primary, vars);

  // Fall back to en-US
  if (locale !== DEFAULT_LOCALE) {
    const fallback = lookup(getBundle(DEFAULT_LOCALE), key);
    if (fallback !== null) return interpolate(fallback, vars);
  }

  // Explicit fallback string from caller
  if (opts.fallback) return interpolate(opts.fallback, vars);

  // Last-ditch — return the raw key so missing strings are visible
  if (process.env.NODE_ENV !== 'production') {
    console.warn(`[i18n] Missing key: ${key} (locale=${locale})`);
  }
  return key;
}

/** Read the guild's persisted language and return a Locale. */
export function getGuildLocale(guildId: string): Locale {
  try {
    const row = db.prepare('SELECT language FROM guilds WHERE id = ?').get(guildId) as
      | { language: string | null }
      | undefined;
    return normalizeLocale(row?.language);
  } catch {
    return DEFAULT_LOCALE;
  }
}

/** Persist a new language for a guild — upserts the row if missing. */
export function setGuildLocale(guildId: string, locale: Locale): void {
  db.prepare('INSERT OR IGNORE INTO guilds (id) VALUES (?)').run(guildId);
  db.prepare('UPDATE guilds SET language = ? WHERE id = ?').run(locale, guildId);
}

/** Translate against the guild's current language. */
export function tGuild(
  guildId: string,
  key: string,
  opts: Omit<TranslateOptions, 'locale'> = {},
): string {
  return t(getGuildLocale(guildId), key, opts);
}

/** Bind a translator to a guild — handy for closures inside handlers. */
export function makeGuildTranslator(guildId: string): GuildTranslator {
  const locale = getGuildLocale(guildId);
  return (key, opts = {}) => t(locale, key, opts);
}

export { Locale, SUPPORTED_LOCALES, DEFAULT_LOCALE } from './types';
export { loadLocales, reloadLocales, getBundle, ensureLoaded } from './loader';
