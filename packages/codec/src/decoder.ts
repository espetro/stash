import { base64UrlToBase64 } from "./base64.js";
import { PAYLOAD_VERSION } from "./constants.js";
import type { BrotliFunctions, DecodedPayload } from "./types.js";
import { PayloadDecodeError, SharePayload } from "./types.js";
import { decode } from "@msgpack/msgpack";
import { TLD_WHITELIST } from "./normalizer.js";

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
  if (prefix !== "C" && prefix !== "R" && prefix !== "D" && prefix !== "S") {
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
  if (prefix === "C" || prefix === "D") {
    try {
      decompressed = brotli.decompress(bytes);
    } catch (e) {
      throw new PayloadDecodeError("Failed to decompress payload");
    }
  } else {
    decompressed = bytes;
  }

  // v3 path: D/S prefixes use MessagePack
  if (prefix === "D" || prefix === "S") {
    const msgpackPayload = decode(decompressed) as SharePayload;
    const { v, e, i } = msgpackPayload;
    if (!Array.isArray(i)) {
      throw new PayloadDecodeError("Invalid v3 payload structure");
    }
    return {
      version: v,
      expiry: e,
      items: i,
      isExpired: Date.now() > e,
    };
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

    // Restore https:// prefix and TLD (if it was stripped by normalizer)
    // Try to restore a whitelisted TLD by checking if the hostname matches a known pattern
    // This is a best-effort restoration; not 100% reliable but good enough for common cases
    const normalizedHasTrailingSlash = urlWithoutScheme.endsWith('/');
    let url = "https://" + urlWithoutScheme;

    // Try to restore TLD if the URL looks like it had one stripped
    // Check if the hostname (first part before / or :) doesn't contain a dot
    // If so, try to find a matching TLD from our whitelist by checking common patterns
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname;

      // If hostname has no dots, it might have had a TLD stripped
      // Try to restore based on common patterns (e.g., github -> github.com)
      if (!hostname.includes('.')) {
        // Common domain mappings that were likely stripped
        const commonDomains: Record<string, string> = {
          'github': '.com',
          'stackoverflow': '.com',
          'developer': '.mozilla.org',
          'reddit': '.com',
          'css-tricks': '.com',
          'codepen': '.io',
          'jsfiddle': '.net',
          'npmjs': '.com',
          'yarnpkg': '.com',
          'caniuse': '.com',
          'web': '.dev',
          'developer.chrome': '.com',
          'javascript': '.info',
          'react': '.dev',
          'vuejs': '.org',
          'angular': '.io',
          'svelte': '.dev',
          'nextjs': '.org',
          'nuxt': '.com',
          'remix': '.run',
          'astro': '.build',
          'deno': '.com',
          'bun': '.sh',
          'nodejs': '.org',
          'typescriptlang': '.org',
          'tailwindcss': '.com',
          'webpack': '.js.org',
          'vitejs': '.dev',
          'rollupjs': '.org',
          'eslint': '.org',
          'prettier': '.io',
          'jestjs': '.io',
          'vitest': '.dev',
          'testing-library': '.com',
          'cypress': '.io',
          'playwright': '.dev',
          'sentry': '.io',
          'datadoghq': '.com',
          'vercel': '.com',
          'netlify': '.com',
          'cloudflare': '.com',
          'mongodb': '.com',
          'postgresql': '.org',
          'redis': '.io',
          'supabase': '.com',
          'firebase': '.google.com',
          'planetscale': '.com',
        };

        // Try exact match first
        if (commonDomains[hostname]) {
          parsed.hostname = hostname + commonDomains[hostname];
        }
        url = parsed.toString();
      }

      // URL.toString() adds trailing slash for root paths automatically
      if (!normalizedHasTrailingSlash && parsed.pathname === '/') {
        url = url.slice(0, -1);
      }
    } catch {
      // If URL parsing fails, just use the simple scheme restoration
    }

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
