import init, { compress, decompress } from "../_vendor/brotli_wasm.js";
// @ts-expect-error wasm import is handled by Cloudflare's CompiledWasm bundler rule
import wasmModule from "../_vendor/brotli_wasm_bg.wasm";
import { decodeEncodedPayload } from "@stash/codec";
import { PayloadDecodeError } from "@stash/codec";
import type { BrotliFunctions } from "@stash/codec";

/**
 * Load brotli functions for the Pages Functions runtime (workerd).
 *
 * `import "brotli-wasm"` resolves to index.web.js, whose default export is a
 * Promise and whose init() fetch()es the wasm relative to import.meta.url —
 * that fetch has no corresponding asset in Pages Functions, so decompress
 * threw "Failed to decompress payload" in production. Instead we vendored
 * pkg.web's JS and wasm and hand init() a WebAssembly.Module (or the raw
 * bytes when the bundler rule has not compiled the .wasm import).
 */
export async function getBrotliFunctions(): Promise<BrotliFunctions> {
  const module =
    wasmModule instanceof WebAssembly.Module
      ? wasmModule
      : new WebAssembly.Module(
          new Uint8Array(
            wasmModule as unknown as ArrayBuffer | Uint8Array,
          ),
        );
  await init(module);
  return {
    compress: (data, opts) => compress(data, opts),
    decompress: (data) => decompress(data),
  };
}

export interface DecodedPayload {
  title?: string;
  tags: string[];
  note?: string;
  expiry: number;
  isExpired: boolean;
  version: number;
  items: Array<{ url: string; title: string; kind?: string }>;
}

export async function decodePayload(p: string): Promise<DecodedPayload> {
  const brotli = await getBrotliFunctions();
  const decoded = await decodeEncodedPayload(p, brotli);

  return {
    title: decoded.title,
    tags: decoded.tags,
    note: decoded.note,
    expiry: decoded.expiry,
    isExpired: decoded.isExpired,
    version: decoded.version,
    items: decoded.items.map(([url, title, kind]) => ({ url, title, kind })),
  };
}

export function buildCacheControl(expiry: number): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (expiry <= nowSeconds) return "public, max-age=31536000, immutable";
  return `public, max-age=${expiry - nowSeconds}`;
}

type RateLimitEntry = { count: number; resetAt: number };
const rateLimitMap = new Map<string, RateLimitEntry>();
const RATE_LIMIT = 30;
const WINDOW_MS = 60_000;

export function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

export function extractClientIp(request: Request): string {
  const cfConnectingIp = request.headers.get("CF-Connecting-IP");
  if (cfConnectingIp) return cfConnectingIp;

  const xForwardedFor = request.headers.get("X-Forwarded-For");
  if (xForwardedFor) return xForwardedFor.split(",")[0].trim();

  return "unknown";
}
