import { encodePayloadToUrl, buildShareUrl } from "./adapters/url-adapter.js";
import { encodePayloadToQr, buildQrUrl } from "./adapters/qr-adapter.js";
import { EXPIRY_HOURS, BUDGET_CHARS, MAX_TITLE_CHARS } from "./constants.js";
import type {
  SharePayload,
  TabInfo,
  EncodingResult,
  QrEncodingResult,
  BrotliFunctions,
} from "./types.js";

/**
 * Normalize title: trim, collapse whitespace, truncate to MAX_TITLE_CHARS
 */
export function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").substring(0, MAX_TITLE_CHARS);
}

/**
 * Create payload with expiry timestamp
 */
export function createPayload(
  tabs: TabInfo[],
  expiryHours: number = EXPIRY_HOURS,
  title?: string,
): SharePayload {
  const now = Math.floor(Date.now() / 1000);
  const expiry = now + expiryHours * 3600;

  const payload: SharePayload = {
    v: 4,
    e: expiry,
    i: tabs.map((tab) => [tab.url, normalizeTitle(tab.title)] as [string, string]),
  };

  if (title && title.trim().length > 0) {
    payload.t = normalizeTitle(title);
  }

  return payload;
}

/**
 * Find max number of tabs that fit within budget using binary search.
 * The encoderFn produces the encoded string whose length is checked.
 */
async function _findMaxTabsWithinBudget(
  tabs: TabInfo[],
  brotli: BrotliFunctions,
  encoderFn: (payload: SharePayload, brotli: BrotliFunctions) => Promise<string>,
  buildUrlFn: (encoded: string) => string,
  expiryHours: number = 24,
  title?: string,
): Promise<number> {
  if (tabs.length === 0) return 0;

  const fullPayload = createPayload(tabs, expiryHours, title);
  const fullEncoded = await encoderFn(fullPayload, brotli);
  const fullUrl = buildUrlFn(fullEncoded);

  if (fullUrl.length <= BUDGET_CHARS) {
    return tabs.length;
  }

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

    const payload = createPayload(subset, expiryHours, title);
    const encoded = await encoderFn(payload, brotli);
    const url = buildUrlFn(encoded);

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
  expiryHours: number = EXPIRY_HOURS,
  viewerOrigin?: string,
  title?: string,
): Promise<EncodingResult> {
  if (tabs.length === 0) {
    return {
      url: buildShareUrl("", viewerOrigin),
      itemCount: 0,
      truncated: false,
    };
  }

  const fullPayload = createPayload(tabs, expiryHours, title);
  const fullEncoded = await encodePayloadToUrl(fullPayload, brotli);
  const fullUrl = buildShareUrl(fullEncoded, viewerOrigin);

  if (fullUrl.length <= BUDGET_CHARS) {
    return {
      url: fullUrl,
      itemCount: tabs.length,
      truncated: false,
    };
  }

  const maxTabs = await _findMaxTabsWithinBudget(
    tabs,
    brotli,
    encodePayloadToUrl,
    (encoded) => buildShareUrl(encoded, viewerOrigin),
    expiryHours,
    title,
  );

  if (maxTabs === 0) {
    return {
      url: buildShareUrl("", viewerOrigin),
      itemCount: 0,
      truncated: true,
    };
  }

  const subset = tabs.slice(0, maxTabs);
  const payload = createPayload(subset, expiryHours, title);
  const encoded = await encodePayloadToUrl(payload, brotli);
  const url = buildShareUrl(encoded, viewerOrigin);

  return {
    url,
    itemCount: maxTabs,
    truncated: true,
  };
}

/**
 * Find max number of tabs that fit within budget using binary search.
 * Uses the URL adapter for encoding.
 */
export async function findMaxTabsWithinBudget(
  tabs: TabInfo[],
  brotli: BrotliFunctions,
  viewerOrigin?: string,
  expiryHours: number = 24,
  title?: string,
): Promise<number> {
  return _findMaxTabsWithinBudget(
    tabs,
    brotli,
    encodePayloadToUrl,
    (encoded) => buildShareUrl(encoded, viewerOrigin),
    expiryHours,
    title,
  );
}

/**
 * Encode tabs to a QR-optimized share URL with budget enforcement.
 */
export async function encodeTabsToQrUrl(
  tabs: TabInfo[],
  brotli: BrotliFunctions,
  expiryHours: number = EXPIRY_HOURS,
  viewerOrigin?: string,
  title?: string,
): Promise<QrEncodingResult> {
  if (tabs.length === 0) {
    return {
      qrUrl: buildQrUrl("", viewerOrigin),
      itemCount: 0,
      truncated: false,
    };
  }

  const fullPayload = createPayload(tabs, expiryHours, title);
  const fullEncoded = await encodePayloadToQr(fullPayload, brotli);
  const fullUrl = buildQrUrl(fullEncoded, viewerOrigin);

  if (fullUrl.length <= BUDGET_CHARS) {
    return {
      qrUrl: fullUrl,
      itemCount: tabs.length,
      truncated: false,
    };
  }

  const maxTabs = await _findMaxTabsWithinBudget(
    tabs,
    brotli,
    encodePayloadToQr,
    (encoded) => buildQrUrl(encoded, viewerOrigin),
    expiryHours,
    title,
  );

  if (maxTabs === 0) {
    return {
      qrUrl: buildQrUrl("", viewerOrigin),
      itemCount: 0,
      truncated: true,
    };
  }

  const subset = tabs.slice(0, maxTabs);
  const payload = createPayload(subset, expiryHours, title);
  const encoded = await encodePayloadToQr(payload, brotli);
  const qrUrl = buildQrUrl(encoded, viewerOrigin);

  return {
    qrUrl,
    itemCount: maxTabs,
    truncated: true,
  };
}
