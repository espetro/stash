import { uint8ToBase64 } from "./base64.js";
import {
  PAYLOAD_VERSION,
  BUDGET_CHARS,
  MAX_TITLE_CHARS,
  VIEWER_ORIGIN,
  VIEWER_PATH,
} from "./constants.js";
import type { SharePayload, TabInfo, EncodingResult, BrotliFunctions } from "./types.js";

/**
 * Normalize title: trim, collapse whitespace, truncate to MAX_TITLE_CHARS
 */
export function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").substring(0, MAX_TITLE_CHARS);
}

/**
 * Strip https?:// prefix from URL
 */
function stripUrlScheme(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

/**
 * Create payload with expiry timestamp
 */
export function createPayload(tabs: TabInfo[]): SharePayload {
  const now = Math.floor(Date.now() / 1000);
  const expiry = now + 24 * 3600; // 24 hours

  return {
    v: PAYLOAD_VERSION,
    e: expiry,
    i: tabs.map((tab) => [tab.url, normalizeTitle(tab.title)] as [string, string]),
  };
}

/**
 * Encode payload using v2 delimiter format:
 * "2" + expiry + "\x1d" + items
 *
 * Compression: brotli quality 11, only if > 50 bytes
 * Prefix: "C" for compressed, "R" for raw
 */
export async function encodePayload(payload: SharePayload, brotli: BrotliFunctions): Promise<string> {
  // Build v2 format: version char + expiry + group separator + items
  const items = payload.i
    .filter(([url]) => {
      // Defensive filter: only http:// and https:// URLs
      return url.startsWith("http://") || url.startsWith("https://");
    })
    .map(([url, title]) => {
      // Strip scheme from URL
      const urlWithoutScheme = stripUrlScheme(url);
      // Item format: url + unit separator + title
      return `${urlWithoutScheme}\x1f${title}`;
    });

  // Full packed: "2" + expiry + "\x1d" + items.join("\x1e")
  const packed = "2" + payload.e + "\x1d" + items.join("\x1e");

  // UTF-8 bytes
  const utf8 = new TextEncoder().encode(packed);

  // Compress only if > 50 bytes
  const isCompressed = utf8.length > 50;
  const bytes = isCompressed
    ? brotli.compress(utf8, { quality: 11 })
    : utf8;

  // Base64 encode and convert to base64url
  const b64 = uint8ToBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  return (isCompressed ? "C" : "R") + b64;
}

/**
 * Build share URL from encoded payload
 */
export function buildShareUrl(encoded: string, viewerOrigin?: string): string {
  const origin = viewerOrigin ?? VIEWER_ORIGIN;
  return `${origin}${VIEWER_PATH}#p=${encoded}`;
}

/**
 * Find max number of tabs that fit within budget using binary search
 */
export async function findMaxTabsWithinBudget(
  tabs: TabInfo[],
  brotli: BrotliFunctions,
  viewerOrigin?: string
): Promise<number> {
  if (tabs.length === 0) return 0;

  // Check if full set fits
  const fullPayload = createPayload(tabs);
  const fullEncoded = await encodePayload(fullPayload, brotli);
  const fullUrl = buildShareUrl(fullEncoded, viewerOrigin);

  if (fullUrl.length <= BUDGET_CHARS) {
    return tabs.length;
  }

  // Binary search for max prefix that fits
  let left = 0;
  let right = tabs.length;
  let result = 0;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const subset = tabs.slice(0, mid);

    if (subset.length === 0) {
      left = mid + 1;
      continue;
    }

    const payload = createPayload(subset);
    const encoded = await encodePayload(payload, brotli);
    const url = buildShareUrl(encoded, viewerOrigin);

    if (url.length <= BUDGET_CHARS) {
      result = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return result;
}

/**
 * Main entry point: encode tabs to share URL with budget enforcement
 */
export async function encodeTabsToShareUrl(
  tabs: TabInfo[],
  brotli: BrotliFunctions,
  viewerOrigin?: string
): Promise<EncodingResult> {
  if (tabs.length === 0) {
    return {
      url: buildShareUrl("", viewerOrigin),
      itemCount: 0,
      truncated: false,
    };
  }

  // Try full set first
  const fullPayload = createPayload(tabs);
  const fullEncoded = await encodePayload(fullPayload, brotli);
  const fullUrl = buildShareUrl(fullEncoded, viewerOrigin);

  if (fullUrl.length <= BUDGET_CHARS) {
    return {
      url: fullUrl,
      itemCount: tabs.length,
      truncated: false,
    };
  }

  // Find max tabs that fit
  const maxTabs = await findMaxTabsWithinBudget(tabs, brotli, viewerOrigin);

  if (maxTabs === 0) {
    return {
      url: buildShareUrl("", viewerOrigin),
      itemCount: 0,
      truncated: true,
    };
  }

  const subset = tabs.slice(0, maxTabs);
  const payload = createPayload(subset);
  const encoded = await encodePayload(payload, brotli);
  const url = buildShareUrl(encoded, viewerOrigin);

  return {
    url,
    itemCount: maxTabs,
    truncated: true,
  };
}
