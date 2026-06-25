import IntlMessageFormat from "intl-messageformat";
import en from "./messages/en.json";
import es from "./messages/es.json";
import ru from "./messages/ru.json";
import fr from "./messages/fr.json";

export const SUPPORTED_LANGUAGES = ["en", "es", "ru", "fr"] as const;
export type Lang = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANG: Lang = "en";

export const LANGUAGE_LABELS: Record<Lang, string> = {
  en: "English",
  es: "Español",
  ru: "Русский",
  fr: "Français",
};

const bundles: Record<Lang, Record<string, string>> = { en, es, ru, fr };
const formatterCache = new Map<string, IntlMessageFormat>();

function getBundle(lang: Lang): Record<string, string> {
  return bundles[lang] ?? bundles[DEFAULT_LANG];
}

export function t(
  key: string,
  values?: Record<string, string | number | Date>,
  lang: Lang = DEFAULT_LANG,
): string {
  const cacheKey = `${lang}:${key}`;
  let formatter = formatterCache.get(cacheKey);
  if (!formatter) {
    const message = getBundle(lang)[key] ?? getBundle(DEFAULT_LANG)[key] ?? key;
    formatter = new IntlMessageFormat(message, lang);
    formatterCache.set(cacheKey, formatter);
  }
  return formatter.format(values ?? {}) as string;
}

export function isLang(value: string): value is Lang {
  return SUPPORTED_LANGUAGES.includes(value as Lang);
}
