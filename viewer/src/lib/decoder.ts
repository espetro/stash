import pako from "pako";
import { PAYLOAD_VERSION } from "./constants.js";
import type { DecodedPayload } from "./types.js";
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
 * Decode share URL fragment to payload
 */
export function decodeShareUrl(fragment: string): DecodedPayload {
  // Extract #p=... from fragment
  const match = fragment.match(/^#p=(.+)$/);
  if (!match) {
    throw new PayloadDecodeError("Invalid URL fragment format");
  }

  const base64url = match[1];

  // Convert base64url to base64
  let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");

  // Add padding if needed
  while (base64.length % 4) {
    base64 += "=";
  }

  // Decode base64 to binary string
  let binaryString: string;
  try {
    binaryString = atob(base64);
  } catch (e) {
    throw new PayloadDecodeError("Invalid base64 encoding");
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
    throw new PayloadDecodeError("Failed to decompress payload");
  }

  // Decode UTF-8 bytes to string
  const json = new TextDecoder().decode(decompressed);

  // Parse JSON
  let payload: any;
  try {
    payload = JSON.parse(json);
  } catch (e) {
    throw new PayloadDecodeError("Invalid JSON payload");
  }

  // Validate structure
  if (typeof payload.v !== "number") {
    throw new PayloadDecodeError("Missing or invalid version");
  }

  if (typeof payload.e !== "number") {
    throw new PayloadDecodeError("Missing or invalid expiry timestamp");
  }

  if (!Array.isArray(payload.i)) {
    throw new PayloadDecodeError("Missing or invalid items array");
  }

  // Validate version
  if (payload.v !== PAYLOAD_VERSION) {
    throw new PayloadDecodeError(`Unsupported payload version: ${payload.v}`);
  }

  // Validate items are [url, title] tuples
  for (const item of payload.i) {
    if (!Array.isArray(item) || item.length !== 2) {
      throw new PayloadDecodeError("Invalid item format");
    }
    if (typeof item[0] !== "string" || typeof item[1] !== "string") {
      throw new PayloadDecodeError("Invalid item format");
    }
  }

  // Check expiry
  const now = Math.floor(Date.now() / 1000);
  const isExpired = payload.e < now;

  return {
    version: payload.v,
    expiry: payload.e,
    items: payload.i,
    isExpired,
  };
}
