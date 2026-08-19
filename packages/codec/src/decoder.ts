import { decodeBase32IgnorePadding, decodeBase64urlIgnorePadding } from "@oslojs/encoding";
import { deserializePayload } from "./payload.js";
import type { BrotliFunctions, DecodedPayload } from "./types.js";
import { PayloadDecodeError } from "./types.js";

/**
 * Decode a bare encoded payload string (without the #p=/#q= wrapper).
 * Transport is inferred from the prefix:
 *   C/R = URL adapter (base64url), D/S = QR adapter (base32).
 * Prefixes: C/D = brotli-compressed, R/S = raw msgpack.
 */
export async function decodeEncodedPayload(
  encoded: string,
  brotli: BrotliFunctions,
): Promise<DecodedPayload> {
  if (encoded.length === 0) {
    throw new PayloadDecodeError("Invalid URL fragment format");
  }

  const prefix = encoded[0];
  const body = encoded.slice(1);

  let bytes: Uint8Array;

  if (prefix === "C" || prefix === "R") {
    // URL adapter: base64url alphabet
    try {
      bytes = decodeBase64urlIgnorePadding(body);
    } catch {
      throw new PayloadDecodeError("Invalid base64url encoding");
    }
  } else if (prefix === "D" || prefix === "S") {
    // QR adapter: base32 alphabet
    try {
      bytes = decodeBase32IgnorePadding(body);
    } catch {
      throw new PayloadDecodeError("Invalid base32 encoding");
    }
  } else {
    throw new PayloadDecodeError("Unknown payload prefix");
  }

  // Decompress if needed
  let decompressed: Uint8Array;
  if (prefix === "C" || prefix === "D") {
    try {
      decompressed = brotli.decompress(bytes);
    } catch {
      throw new PayloadDecodeError("Failed to decompress payload");
    }
  } else {
    decompressed = bytes;
  }

  // Deserialize msgpack
  let payload;
  try {
    payload = deserializePayload(decompressed);
  } catch {
    throw new PayloadDecodeError("Invalid payload structure");
  }

  const { v, e, i, t } = payload;

  if (v !== 4 && v !== 5) {
    throw new PayloadDecodeError("Unsupported payload version");
  }

  if (!Array.isArray(i)) {
    throw new PayloadDecodeError("Invalid payload structure");
  }

  const now = Math.floor(Date.now() / 1000);

  return {
    version: v,
    expiry: e,
    items: i,
    isExpired: now > e,
    title: t,
  };
}

/**
 * Decode share URL fragment to payload.
 * Supports both #p= (base64url) and #q= (base32) fragments.
 */
export async function decodeShareUrl(
  fragment: string,
  brotli: BrotliFunctions,
): Promise<DecodedPayload> {
  const urlMatch = fragment.match(/^#p=(.+)$/);
  const qrMatch = fragment.match(/^#q=(.+)$/);

  if (!urlMatch && !qrMatch) {
    throw new PayloadDecodeError("Invalid URL fragment format");
  }

  return decodeEncodedPayload((urlMatch ?? qrMatch)![1], brotli);
}
