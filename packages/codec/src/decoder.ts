import { base64UrlToBase64 } from "./base64.js";
import { PAYLOAD_VERSION } from "./constants.js";
import type { BrotliFunctions, DecodedPayload } from "./types.js";
import { PayloadDecodeError } from "./types.js";

/**
 * Extract domain from URL
 */
export function getDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return url;
  }
}

/**
 * Get Google favicon URL for a domain
 */
export function getFaviconUrl(url: string): string {
  const domain = getDomain(url);
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
}

/**
 * Decode share URL fragment to payload using v2 format:
 * "C" or "R" prefix + base64url(encoded data)
 *
 * Decoding steps:
 * 1. Detect prefix (C=compressed, R=raw)
 * 2. Base64url decode
 * 3. Decompress if needed (brotli)
 * 4. Parse v2 delimiter format
 */
export async function decodeShareUrl(
  fragment: string,
  brotli: BrotliFunctions,
): Promise<DecodedPayload> {
  // Extract #p=... from fragment
  const match = fragment.match(/^#p=(.+)$/);
  if (!match) {
    throw new PayloadDecodeError("Invalid URL fragment format");
  }

  const encoded = match[1];
  if (encoded.length === 0) {
    throw new PayloadDecodeError("Invalid URL fragment format");
  }

  // Detect prefix
  const prefix = encoded[0];
  if (prefix !== "C" && prefix !== "R") {
    throw new PayloadDecodeError("Unknown payload prefix");
  }

  // Strip prefix and decode base64url
  const base64url = encoded.slice(1);
  const base64 = base64UrlToBase64(base64url);

  // Decode base64 to binary string
  let binaryString: string;
  try {
    binaryString = atob(base64);
  } catch (e) {
    throw new PayloadDecodeError("Invalid base64 encoding");
  }

  // Convert binary string to Uint8Array
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Decompress if compressed
  let decompressed: Uint8Array;
  if (prefix === "C") {
    try {
      decompressed = brotli.decompress(bytes);
    } catch (e) {
      throw new PayloadDecodeError("Failed to decompress payload");
    }
  } else {
    decompressed = bytes;
  }

  // Decode UTF-8 bytes to string
  const packed = new TextDecoder().decode(decompressed);

  // Validate version prefix
  if (packed[0] !== "2") {
    throw new PayloadDecodeError("Unsupported payload version");
  }

  // Strip version char and split on group separator
  const withoutVersion = packed.slice(1);
  const sepIndex = withoutVersion.indexOf("\x1d");
  if (sepIndex === -1) {
    throw new PayloadDecodeError("Invalid payload structure");
  }

  const header = withoutVersion.slice(0, sepIndex);
  const itemsBlock = withoutVersion.slice(sepIndex + 1);

  // Parse expiry from header
  const expiry = parseInt(header, 10);
  if (!isFinite(expiry)) {
    throw new PayloadDecodeError("Invalid payload structure");
  }

  // Split items block on record separator
  const itemStrings = itemsBlock.split("\x1e").filter((s) => s.length > 0);

  // Parse each item: url + unit separator + title
  const items: [string, string][] = [];
  for (const itemStr of itemStrings) {
    const usIndex = itemStr.indexOf("\x1f");
    if (usIndex === -1) {
      throw new PayloadDecodeError("Invalid payload structure");
    }

    const urlWithoutScheme = itemStr.slice(0, usIndex);
    const title = itemStr.slice(usIndex + 1);

    // Restore https:// prefix
    const url = "https://" + urlWithoutScheme;
    items.push([url, title]);
  }

  // Check expiry
  const now = Math.floor(Date.now() / 1000);
  const isExpired = expiry < now;

  return {
    version: 2,
    expiry,
    items,
    isExpired,
  };
}
