import { encodeBase64urlNoPadding } from "@oslojs/encoding";
import { serializePayload } from "../payload.js";
import { COMPRESSION_THRESHOLD, VIEWER_ORIGIN, VIEWER_PATH } from "../constants.js";
import type { SharePayload, BrotliFunctions } from "../types.js";

/**
 * Encode a v4 payload to a base64url transport string (for #p= fragments).
 * Prefix: C = compressed, R = raw.
 */
export async function encodePayloadToUrl(
  payload: SharePayload,
  brotli: BrotliFunctions,
): Promise<string> {
  const msgpackBytes = serializePayload(payload);
  const isCompressed = msgpackBytes.length > COMPRESSION_THRESHOLD;
  const bytes = isCompressed ? brotli.compress(msgpackBytes, { quality: 11 }) : msgpackBytes;
  const b64 = encodeBase64urlNoPadding(bytes);
  return (isCompressed ? "C" : "R") + b64;
}

/**
 * Build a share URL from an encoded payload string.
 */
export function buildShareUrl(encoded: string, viewerOrigin?: string): string {
  const origin = viewerOrigin ?? VIEWER_ORIGIN;
  return `${origin}${VIEWER_PATH}#p=${encoded}`;
}
