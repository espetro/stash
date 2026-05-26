import { encodeBase32UpperCaseNoPadding } from "@oslojs/encoding";
import { serializePayload } from "../payload.js";
import { VIEWER_ORIGIN, VIEWER_PATH } from "../constants.js";
import type { SharePayload, BrotliFunctions } from "../types.js";

/**
 * Encode a v4 payload to a base32 transport string (for #q= fragments).
 * Always Brotli-compresses for QR density.
 * Prefix: D = compressed (always), S = raw (unused but reserved).
 */
export async function encodePayloadToQr(
  payload: SharePayload,
  brotli: BrotliFunctions,
): Promise<string> {
  const msgpackBytes = serializePayload(payload);
  const compressed = brotli.compress(msgpackBytes, { quality: 11 });
  const b32 = encodeBase32UpperCaseNoPadding(compressed);
  return "D" + b32;
}

/**
 * Build a QR share URL from an encoded payload string.
 */
export function buildQrUrl(encoded: string, viewerOrigin?: string): string {
  const origin = viewerOrigin ?? VIEWER_ORIGIN;
  return `${origin}${VIEWER_PATH}#q=${encoded}`;
}

/**
 * Split a QR URL into prefix and payload segments for lean-qr mixed-mode encoding.
 * Prefix = byte-mode segment (everything up to and including "#q=")
 * Payload = alphanumeric-mode segment (the base32-encoded data)
 */
export function getQrSegments(qrUrl: string): { prefix: string; payload: string } {
  const hashIndex = qrUrl.indexOf("#q=");
  if (hashIndex === -1) {
    throw new Error("Invalid QR URL: missing #q= fragment");
  }
  return {
    prefix: qrUrl.slice(0, hashIndex + 3),
    payload: qrUrl.slice(hashIndex + 3),
  };
}

/**
 * Estimate the QR bit length for a QR URL using mixed-mode encoding.
 * Assumes byte mode for the URL prefix and alphanumeric mode for the base32 payload.
 */
export function estimateQrBitLength(qrUrl: string): number {
  const { prefix, payload } = getQrSegments(qrUrl);

  // Byte mode: 4-bit mode indicator + 8-bit character count + 8 bits per byte
  const prefixBytes = new TextEncoder().encode(prefix);
  const prefixBits = 4 + 8 + 8 * prefixBytes.length;

  // Alphanumeric mode: 4-bit mode indicator + 9-bit character count (v1-9) +
  // 11 bits per pair + 6 bits if odd
  const payloadLen = payload.length;
  const payloadBits = 4 + 9 + 11 * Math.floor(payloadLen / 2) + 6 * (payloadLen % 2);

  return prefixBits + payloadBits;
}

/**
 * Maximum bits for common QR versions at error-correction level L.
 * Used by capacity preflight checks.
 */
export const QR_CAPACITY_BITS_L = {
  1: 152,
  2: 272,
  3: 440,
  4: 640,
  5: 864,
  6: 1088,
  7: 1248,
  8: 1552,
  9: 1856,
  10: 2192,
  15: 3706,
  20: 5506,
  25: 7456,
  40: 23648,
} as const;

export const MAX_QR_CAPACITY = QR_CAPACITY_BITS_L[40];
