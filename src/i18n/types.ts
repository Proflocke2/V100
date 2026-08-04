/**
 * i18n — type definitions.
 *
 * Locales live in src/locales/{locale}/{module}.json.
 * The system is module-aware: keys are addressed as "module.path.to.key".
 */

export type Locale = 'en-US' | 'de-DE' | 'fr-FR' | 'ru-RU';

export const SUPPORTED_LOCALES: Locale[] = ['en-US', 'de-DE', 'fr-FR', 'ru-RU'];
export const DEFAULT_LOCALE: Locale = 'en-US';

export interface LocaleBundle {
  [moduleName: string]: LocaleNamespace;
}

export interface LocaleNamespace {
  [key: string]: string | LocaleNamespace;
}

export interface TranslateOptions {
  /** placeholder values that will be substituted into `{name}` markers */
  vars?: Record<string, string | number>;
  /** explicit locale override (otherwise resolved from guild) */
  locale?: Locale;
  /** explicit fallback string when the key is missing entirely */
  fallback?: string;
  /** any extra keys are treated as flat placeholder variables */
  [key: string]: string | number | Record<string, string | number> | Locale | undefined;
}

/**
 * The `t()` function bound to a guild — convenient for handlers that always
 * translate for the same guild.
 */
export type GuildTranslator = (key: string, opts?: Omit<TranslateOptions, 'locale'>) => string;
