/**
 * URL normalizer - strips www. prefix and whitelisted TLDs
 */

/**
 * TLDs that are safe to strip (generic TLDs that won't cause ambiguity)
 */
export const TLD_WHITELIST = [".com", ".org", ".net", ".io", ".dev", ".app"] as const;

/**
 * Normalize URL by stripping www. prefix and whitelisted TLDs
 *
 * @param url - URL to normalize
 * @returns Normalized URL, or original if parsing fails
 */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);

    let hostname = parsed.hostname;
    if (hostname.startsWith("www.")) {
      hostname = hostname.slice(4);
    }

    for (const tld of TLD_WHITELIST) {
      if (hostname.endsWith(tld)) {
        const stripped = hostname.slice(0, -tld.length);
        if (stripped.length > 0) {
          hostname = stripped;
        }
        break;
      }
    }

    parsed.hostname = hostname;
    const normalized = parsed.toString();

    const originalHasTrailingSlash = url.endsWith("/");
    const parsedHasTrailingSlash = normalized.endsWith("/");
    const isRootPath = parsed.pathname === "/";

    if (!originalHasTrailingSlash && parsedHasTrailingSlash && isRootPath) {
      return normalized.slice(0, -1);
    }

    return normalized;
  } catch {
    return url;
  }
}
