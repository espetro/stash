import pako from 'pako';
import {
  type DecodedPayload,
  PayloadDecodeError,
  PAYLOAD_VERSION,
  getDomain,
  getFaviconUrl,
} from '@stash/codec';

export type { DecodedPayload };
export { PayloadDecodeError, getDomain, getFaviconUrl };

/**
 * Decode share URL fragment to payload
 * NOTE: This is a test helper that uses pako directly for compatibility with existing tests.
 * The actual viewer uses @stash/codec's decodeShareUrl.
 */
export function decodeShareUrl(fragment: string): DecodedPayload {
  // Extract #p=... from fragment
  const match = fragment.match(/^#p=(.+)$/);
  if (!match) {
    throw new PayloadDecodeError('Invalid URL fragment format');
  }

  const base64url = match[1];

  // Convert base64url to base64
  let base64 = base64url
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  // Add padding if needed
  while (base64.length % 4) {
    base64 += '=';
  }

  // Decode base64 to binary string
  let binaryString: string;
  try {
    binaryString = atob(base64);
  } catch (e) {
    throw new PayloadDecodeError('Invalid base64 encoding');
  }

  // Convert binary string to Uint8Array
  const compressed = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    compressed[i] = binaryString.charCodeAt(i);
  }

  // Decompress with pako
  let decompressed: Uint8Array;
  try {
    decompressed = pako.inflate(compressed);
  } catch (e) {
    throw new PayloadDecodeError('Failed to decompress payload');
  }

  // Decode UTF-8 bytes to string
  const json = new TextDecoder().decode(decompressed);

  // Parse JSON
  let payload: any;
  try {
    payload = JSON.parse(json);
  } catch (e) {
    throw new PayloadDecodeError('Invalid JSON payload');
  }

  // Validate structure
  if (typeof payload.v !== 'number') {
    throw new PayloadDecodeError('Missing or invalid version');
  }

  if (typeof payload.e !== 'number') {
    throw new PayloadDecodeError('Missing or invalid expiry timestamp');
  }

  if (!Array.isArray(payload.i)) {
    throw new PayloadDecodeError('Missing or invalid items array');
  }

  // Validate version
  if (payload.v !== PAYLOAD_VERSION) {
    throw new PayloadDecodeError(`Unsupported payload version: ${payload.v}`);
  }

  // Validate items are [url, title] tuples
  for (const item of payload.i) {
    if (!Array.isArray(item) || item.length !== 2) {
      throw new PayloadDecodeError('Invalid item format');
    }
    if (typeof item[0] !== 'string' || typeof item[1] !== 'string') {
      throw new PayloadDecodeError('Invalid item format');
    }
  }

  // Check expiry
  const now = Math.floor(Date.now() / 1000);
  const isExpired = payload.e < now;

  return {
    version: payload.v,
    expiry: payload.e,
    items: payload.i,
    isExpired
  };
}

/**
 * Decode a full viewer URL
 */
export function decodeViewerUrl(url: string): DecodedPayload {
  try {
    const urlObj = new URL(url);
    const fragment = urlObj.hash;
    return decodeShareUrl(fragment);
  } catch (e) {
    throw new PayloadDecodeError('Invalid viewer URL');
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
      throw new PayloadDecodeError('No payload found in URL');
    }
    return match[1];
  } catch (e) {
    throw new PayloadDecodeError('Invalid viewer URL');
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
