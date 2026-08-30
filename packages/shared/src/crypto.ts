import { encodeBase64urlNoPadding, decodeBase64urlIgnorePadding } from "@oslojs/encoding";

/**
 * Zero-trust relay encryption (F14, option B).
 *
 * Per share, the client generates a random 128-bit key that lives ONLY in
 * the URL fragment (`/s/<id>#<key>`); fragments never reach any server.
 * The encoded payload is AES-256-GCM encrypted client-side and the relay
 * stores only the opaque ciphertext (base64url, random 96-bit IV prepended).
 * There is no KDF: the key is random per share, nothing is derived.
 */

const KEY_BYTES = 16;
const IV_BYTES = 12; // 96-bit IV, the GCM-recommended size
const ALGORITHM = "AES-GCM";

function bytesToBase64Url(bytes: Uint8Array): string {
  return encodeBase64urlNoPadding(bytes);
}

function base64UrlToBytes(s: string): Uint8Array {
  // Throws on invalid characters/padding — callers surface that as an error.
  return decodeBase64urlIgnorePadding(s);
}

async function importKey(keyB64Url: string): Promise<CryptoKey> {
  let raw: Uint8Array;
  try {
    raw = base64UrlToBytes(keyB64Url);
  } catch {
    throw new Error("Invalid share key encoding");
  }
  if (raw.length !== KEY_BYTES) {
    throw new Error("Invalid share key length");
  }
  return crypto.subtle.importKey("raw", raw as BufferSource, { name: ALGORITHM }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/** Generate a fresh per-share key: 16 random bytes, base64url-encoded.
 *  This is the value carried in the URL fragment. */
export function generateShareKey(): string {
  const bytes = new Uint8Array(KEY_BYTES);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

/** Encrypt an encoded payload string for relay storage. Returns base64url
 *  (IV || ciphertext+tag). The key never leaves the client. */
export async function encryptForRelay(payload: string, key: string): Promise<string> {
  const cryptoKey = await importKey(key);
  const iv = new Uint8Array(IV_BYTES);
  crypto.getRandomValues(iv);
  const plaintext = new TextEncoder().encode(payload);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: ALGORITHM, iv: iv as BufferSource }, cryptoKey, plaintext),
  );
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv, 0);
  combined.set(ciphertext, iv.length);
  return bytesToBase64Url(combined);
}

/** Decrypt a relay-stored ciphertext (base64url, IV-prefixed) back into the
 *  encoded payload string. Throws on wrong key or tampered ciphertext
 *  (GCM authentication failure) — callers must fail closed. */
export async function decryptFromRelay(ciphertext: string, key: string): Promise<string> {
  let raw: Uint8Array;
  try {
    raw = base64UrlToBytes(ciphertext);
  } catch {
    throw new Error("Invalid ciphertext encoding");
  }
  if (raw.length <= IV_BYTES) {
    throw new Error("Ciphertext too short");
  }
  const cryptoKey = await importKey(key);
  const iv = raw.slice(0, IV_BYTES);
  const data = raw.slice(IV_BYTES);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv: iv as BufferSource },
      cryptoKey,
      data as BufferSource,
    );
  } catch {
    throw new Error("Decryption failed: wrong key or corrupted ciphertext");
  }
  return new TextDecoder().decode(plaintext);
}
