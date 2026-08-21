import type { BrotliFunctions } from "@stash/codec";
// brotli-wasm's package.json "exports" field maps ESM imports to the
// web bundle, which calls `fetch()` at init and fails under Node.
// Load it through CommonJS via createRequire to pick the Node entry,
// which is synchronous and works under both loaders. The Node CJS
// entry exposes the brotli API directly (not as a Promise), so we
// wrap it once at module load time.
import { createRequire } from "node:module";
const nodeRequire = createRequire(import.meta.url);
const nodeBrotli = nodeRequire("brotli-wasm") as {
  compress: (data: Uint8Array, opts: { quality: number }) => Uint8Array;
  decompress: (data: Uint8Array) => Uint8Array;
};
import { type DecodedPayload, PayloadDecodeError } from "@stash/codec";

export type { DecodedPayload };
export { PayloadDecodeError };

let _brotli: BrotliFunctions | null = null;

/**
 * Get brotli functions (cached). Backed by brotli-wasm's Node CJS entry.
 */
async function getBrotliFunctions(): Promise<BrotliFunctions> {
  if (!_brotli) {
    _brotli = {
      compress: (data, opts) => nodeBrotli.compress(data, opts),
      decompress: (data) => nodeBrotli.decompress(data),
    };
  }
  return _brotli;
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
export async function decodeShareUrl(fragment: string): Promise<DecodedPayload> {
  const brotli = await getBrotliFunctions();
  return import("@stash/codec").then((codec) => codec.decodeShareUrl(fragment, brotli));
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
    const urlMatch = urlObj.hash.match(/^#p=(.+)$/);
    const qrMatch = urlObj.hash.match(/^#q=(.+)$/);
    const match = urlMatch || qrMatch;
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
