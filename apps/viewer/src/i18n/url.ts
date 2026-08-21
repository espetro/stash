import { DEFAULT_LANG, SUPPORTED_LANGUAGES, type Lang } from "@/i18n";

const LOCALE_PREFIX: Record<Lang, string> = {
  en: "/",
  es: "/es",
  ru: "/ru",
  fr: "/fr",
};

/**
 * The landing page (`/`) is the only route with locale-prefixed variants.
 * Every other route (`/privacy`, `/terms`, `/s/*`, `/docs/*`) is served
 * unprefixed regardless of locale picked.
 */
export function isLandingRoute(pathname: string): boolean {
  const path = stripTrailingSlash(pathname);
  return path === "/" || SUPPORTED_LANGUAGES.some((l) => l !== DEFAULT_LANG && path === `/${l}`);
}

export function localizedHomePath(locale: Lang): string {
  if (locale === DEFAULT_LANG) return "/";
  return `/${locale}`;
}

/**
 * Returns the URL for a given `pathname` in the given `locale`.
 * Only landing routes are localized; everything else is returned unchanged.
 */
export function localizedPathFor(pathname: string, locale: Lang): string {
  if (!isLandingRoute(pathname)) return pathname;
  return localizedHomePath(locale);
}

export { LOCALE_PREFIX };

function stripTrailingSlash(path: string): string {
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path;
}
