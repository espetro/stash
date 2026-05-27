import { decodeShareUrl, PayloadDecodeError } from "@stash/codec";
import type { BrotliFunctions } from "@stash/codec";

let brotliInstance: BrotliFunctions | null = null;

export async function getBrotliFunctions(): Promise<BrotliFunctions> {
  if (brotliInstance) return brotliInstance;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const brotliWasm = await import("brotli-wasm") as any;
  brotliInstance = {
    compress: (data, opts) => brotliWasm.compress(data, opts),
    decompress: (data) => brotliWasm.decompress(data),
  };
  return brotliInstance;
}

export interface DecodedPayload {
  title?: string;
  expiry: number;
  isExpired: boolean;
  items: Array<{ url: string; title: string }>;
}

export async function decodePayload(p: string): Promise<DecodedPayload> {
  const brotli = await getBrotliFunctions();
  const fragment = `#p=${p}`;
  const decoded = await decodeShareUrl(fragment, brotli);

  return {
    title: decoded.title,
    expiry: decoded.expiry,
    isExpired: decoded.isExpired,
    items: decoded.items.map(([url, title]) => ({ url, title })),
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
