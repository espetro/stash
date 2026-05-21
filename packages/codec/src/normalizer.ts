/**
 * URL normalizer - strips www. prefix and encodes whitelisted TLDs as $INDEX
 * e.g., https://github.com/user → https://github$0/user
 */

export const TLD_WHITELIST = [".com", ".org", ".net", ".io", ".dev", ".app"] as const;

export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);

    let hostname = parsed.hostname;
    if (hostname.startsWith("www.")) {
      hostname = hostname.slice(4);
    }

    let tldIndex = -1;
    for (let i = 0; i < TLD_WHITELIST.length; i++) {
      if (hostname.endsWith(TLD_WHITELIST[i])) {
        const stripped = hostname.slice(0, -TLD_WHITELIST[i].length);
        if (stripped.length > 0) {
          hostname = stripped;
          tldIndex = i;
        }
        break;
      }
    }

    const encodedHostname = tldIndex >= 0 ? `${hostname}$${tldIndex}` : hostname;
    const port = parsed.port ? `:${parsed.port}` : "";
    const path = parsed.pathname + parsed.search + parsed.hash;

    const originalHasTrailingSlash = url.endsWith("/");
    const isRootPath = path === "/";

    let result = `${parsed.protocol}//${encodedHostname}${port}${path}`;

    if (!originalHasTrailingSlash && isRootPath && result.endsWith("/")) {
      result = result.slice(0, -1);
    }

    return result;
  } catch {
    return url;
  }
}

export function restoreTldFromIndex(urlPart: string): string {
  const match = urlPart.match(/^([^\/:\?#]+)/);
  if (!match) return urlPart;

  const hostname = match[1];
  const rest = urlPart.slice(hostname.length);

  const dollarIdx = hostname.lastIndexOf("$");
  if (dollarIdx === -1) return urlPart;

  const base = hostname.slice(0, dollarIdx);
  const idxStr = hostname.slice(dollarIdx + 1);
  const idx = parseInt(idxStr, 10);

  if (isNaN(idx) || idx < 0 || idx >= TLD_WHITELIST.length) return urlPart;

  return base + TLD_WHITELIST[idx] + rest;
}
