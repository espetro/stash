import { encode } from "@msgpack/msgpack";
import { uint8ToBase64 } from "./base64.js";
import { buildShareUrl } from "./encoder.js";
import { COMPRESSION_THRESHOLD } from "./constants.js";
import type { SharePayload, BrotliFunctions } from "./types.js";

/**
 * Encode payload using v3 MessagePack serialization.
 * Prefix: "D" for compressed, "S" for raw (distinct from v2's "C"/"R").
 */
export async function encodePayloadV3(
  payload: SharePayload,
  brotli: BrotliFunctions,
): Promise<string> {
  const serialized = encode({
    v: payload.v,
    e: payload.e,
    i: payload.i,
  });

  const isCompressed = serialized.length > COMPRESSION_THRESHOLD;
  const bytes = isCompressed ? brotli.compress(serialized, { quality: 11 }) : serialized;

  const b64 = uint8ToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

  const prefix = isCompressed ? "D" : "S";
  return prefix + b64;
}

export function buildShareUrlV3(encoded: string, viewerOrigin?: string): string {
  return buildShareUrl(encoded, viewerOrigin);
}
