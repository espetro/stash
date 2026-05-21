import { decodeBase32IgnorePadding, decodeBase64urlIgnorePadding } from "@oslojs/encoding";
import { deserializePayload } from "./payload.js";
import type { BrotliFunctions, DecodedPayload } from "./types.js";
import { PayloadDecodeError } from "./types.js";

/**
 * Decode share URL fragment to v4 payload.
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

  const encoded = urlMatch ? urlMatch[1] : qrMatch![1];
  if (encoded.length === 0) {
    throw new PayloadDecodeError("Invalid URL fragment format");
  }

  const prefix = encoded[0];
  const body = encoded.slice(1);

  let bytes: Uint8Array;

  if (urlMatch) {
    // URL adapter: base64url alphabet
    if (prefix !== "C" && prefix !== "R") {
      throw new PayloadDecodeError("Unknown payload prefix");
    }
    try {
      bytes = decodeBase64urlIgnorePadding(body);
    } catch {
      throw new PayloadDecodeError("Invalid base64url encoding");
    }
  } else {
    // QR adapter: base32 alphabet
    if (prefix !== "D" && prefix !== "S") {
      throw new PayloadDecodeError("Unknown payload prefix");
    }
    try {
      bytes = decodeBase32IgnorePadding(body);
    } catch {
      throw new PayloadDecodeError("Invalid base32 encoding");
    }
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

  if (v !== 4) {
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
