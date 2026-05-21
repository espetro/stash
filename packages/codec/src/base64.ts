import {
  encodeBase64,
  encodeBase32UpperCaseNoPadding,
  decodeBase32IgnorePadding,
} from "@oslojs/encoding";

/**
 * Stack-safe Uint8Array → base64 string.
 * Uses a loop instead of spread to avoid call stack overflow on large arrays.
 * @deprecated Use @oslojs/encoding directly where possible.
 */
export function uint8ToBase64(bytes: Uint8Array): string {
  return encodeBase64(bytes);
}

/**
 * base64url → base64 conversion (add padding, replace chars).
 * @deprecated Use @oslojs/encoding's decodeBase64urlIgnorePadding directly.
 */
export function base64UrlToBase64(b64url: string): string {
  let b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  return b64;
}

/**
 * Uint8Array → base32 uppercase string (no padding).
 */
export function uint8ToBase32(bytes: Uint8Array): string {
  return encodeBase32UpperCaseNoPadding(bytes);
}

/**
 * base32 string → Uint8Array (ignores padding).
 */
export function base32ToUint8(str: string): Uint8Array {
  return decodeBase32IgnorePadding(str);
}
