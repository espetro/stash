/**
 * Stack-safe Uint8Array → base64 string.
 * Uses a loop instead of spread to avoid call stack overflow on large arrays.
 */
export function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * base64url → base64 conversion (add padding, replace chars).
 */
export function base64UrlToBase64(b64url: string): string {
  let b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  return b64;
}
