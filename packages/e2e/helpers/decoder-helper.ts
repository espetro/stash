import type { BrotliFunctions } from "@stash/codec";
import brotliWasm from "brotli-wasm";
import {
  type DecodedPayload,
  PayloadDecodeError,
  PAYLOAD_VERSION,
} from "@stash/codec";

export type { DecodedPayload };
export { PayloadDecodeError };

let _brotli: BrotliFunctions | null = null;
let _initPromise: Promise<BrotliFunctions> | null = null;

/**
 * Get brotli functions (cached)
 */
async function getBrotliFunctions(): Promise<BrotliFunctions> {
  if (_brotli) return _brotli;

  if (!_initPromise) {
    _initPromise = (async () => {
      const brotliModule = await brotliWasm;
      _brotli = {
        compress: (data, opts) => brotliModule.compress(data, opts),
        decompress: (data) => brotliModule.decompress(data),
      };
      return _brotli;
    })();
  }

  return _initPromise;
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function getFaviconUrl(url: string): string {
  const domain = getDomain(url);
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
}

export { getDomain, getFaviconUrl };

/**
 * Decode share URL fragment to payload
 */
export async function decodeShareUrl(
  fragment: string,
): Promise<DecodedPayload> {
  const brotli = await getBrotliFunctions();
  return import("@stash/codec").then(codec => codec.decodeShareUrl(fragment, brotli));
}

/**
 * Decode a full viewer URL (async)
 */
export async function decodeViewerUrl(url: string): Promise<DecodedPayload> {
  try {
    const urlObj = new URL(url);
    const fragment = urlObj.hash;
    return decodeShareUrl(fragment);
  } catch (e) {
    throw new PayloadDecodeError("Invalid viewer URL");
  }
}

/**
 * Extract payload from viewer URL
 */
export function extractPayloadFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const match = urlObj.hash.match(/^#p=(.+)$/);
    if (!match) {
      throw new PayloadDecodeError("No payload found in URL");
    }
    return match[1];
  } catch (e) {
    throw new PayloadDecodeError("Invalid viewer URL");
  }
}

/**
 * Check if a payload is expired
 */
export function isPayloadExpired(expiryTimestamp: number): boolean {
  const now = Math.floor(Date.now() / 1000);
  return expiryTimestamp < now;
}

/**
 * Calculate hours until expiry
 */
export function hoursUntilExpiry(expiryTimestamp: number): number {
  const now = Math.floor(Date.now() / 1000);
  const secondsUntilExpiry = expiryTimestamp - now;
  return secondsUntilExpiry / 3600;
}

/**
 * Format expiry timestamp for display
 */
export function formatExpiry(expiryTimestamp: number): string {
  const date = new Date(expiryTimestamp * 1000);
  return date.toLocaleString();
}
