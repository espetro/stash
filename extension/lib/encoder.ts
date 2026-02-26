import pako from 'pako';
import {
  PAYLOAD_VERSION,
  EXPIRY_HOURS,
  BUDGET_CHARS,
  MAX_TITLE_CHARS,
  VIEWER_ORIGIN,
  VIEWER_PATH
} from './constants.js';
import type { SharePayload, TabInfo, EncodingResult } from './types.js';

/**
 * Normalize title: trim, collapse whitespace, truncate to MAX_TITLE_CHARS
 */
export function normalizeTitle(title: string): string {
  return title
    .trim()
    .replace(/\s+/g, ' ')
    .substring(0, MAX_TITLE_CHARS);
}

/**
 * Create payload with expiry timestamp
 */
export function createPayload(tabs: TabInfo[]): SharePayload {
  const now = Math.floor(Date.now() / 1000);
  const expiry = now + (EXPIRY_HOURS * 3600);
  
  return {
    v: PAYLOAD_VERSION,
    e: expiry,
    i: tabs.map(tab => [tab.url, normalizeTitle(tab.title)] as [string, string])
  };
}

/**
 * Encode payload: JSON → UTF-8 → compress → base64url
 */
export function encodePayload(payload: SharePayload): string {
  // JSON stringify without whitespace
  const json = JSON.stringify(payload);
  
  // UTF-8 bytes
  const utf8Bytes = new TextEncoder().encode(json);
  
  // Compress with pako
  const compressed = pako.deflate(utf8Bytes);
  
  // Base64 encode
  const base64 = btoa(String.fromCharCode(...compressed));
  
  // Convert to base64url (URL-safe)
  const base64url = base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  return base64url;
}

/**
 * Build share URL from encoded payload
 */
export function buildShareUrl(encoded: string): string {
  return `${VIEWER_ORIGIN}${VIEWER_PATH}#p=${encoded}`;
}

/**
 * Find max number of tabs that fit within budget using binary search
 */
export function findMaxTabsWithinBudget(tabs: TabInfo[]): number {
  if (tabs.length === 0) return 0;
  
  // Check if full set fits
  const fullPayload = createPayload(tabs);
  const fullEncoded = encodePayload(fullPayload);
  const fullUrl = buildShareUrl(fullEncoded);
  
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
    const encoded = encodePayload(payload);
    const url = buildShareUrl(encoded);
    
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
export function encodeTabsToShareUrl(tabs: TabInfo[]): EncodingResult {
  if (tabs.length === 0) {
    return {
      url: buildShareUrl(''),
      itemCount: 0,
      truncated: false
    };
  }
  
  // Try full set first
  const fullPayload = createPayload(tabs);
  const fullEncoded = encodePayload(fullPayload);
  const fullUrl = buildShareUrl(fullEncoded);
  
  if (fullUrl.length <= BUDGET_CHARS) {
    return {
      url: fullUrl,
      itemCount: tabs.length,
      truncated: false
    };
  }
  
  // Find max tabs that fit
  const maxTabs = findMaxTabsWithinBudget(tabs);
  
  if (maxTabs === 0) {
    return {
      url: buildShareUrl(''),
      itemCount: 0,
      truncated: true
    };
  }
  
  const subset = tabs.slice(0, maxTabs);
  const payload = createPayload(subset);
  const encoded = encodePayload(payload);
  const url = buildShareUrl(encoded);
  
  return {
    url,
    itemCount: maxTabs,
    truncated: true
  };
}
