import type { Storage } from "unstorage";
import type { BrotliFunctions } from "@stash/codec";

/** A Workers RateLimit-compatible binding (runtime-agnostic seam). */
export interface RateLimitBinding {
  limit(input: { key: string }): Promise<{ success: boolean }>;
}

/** Optional per-IP rate limiting, backed by runtime bindings. */
export interface RateLimiterConfig {
  /** POST /api/stash limiter (e.g. 20/min per IP per PoP) */
  stash?: RateLimitBinding;
  /** POST /mcp limiter (e.g. 60/min per IP per PoP) */
  mcp?: RateLimitBinding;
  /** Client IP resolution; falls back to "unknown" (e.g. CF-Connecting-IP) */
  clientIp?: (request: Request) => string;
}

/** Ports every runtime adapter must supply. */
export interface StashServerConfig {
  /** unstorage instance (KV binding, browser.storage.local, memory…) */
  storage: Storage;
  /** Reported origin for share URLs and the MCP server card. */
  origin: string;
  /** Lazily-loaded brotli (worker: vendored wasm; extension: @stash/shared). */
  getBrotli: () => Promise<BrotliFunctions>;
  /** Optional per-IP rate limiting via runtime bindings (fail-open). */
  rateLimiter?: RateLimiterConfig;
}

/** The resolved set of dependencies passed through routing and MCP layers. */
export interface StashServerDeps {
  storage: Storage;
  origin: string;
  getBrotli: () => Promise<BrotliFunctions>;
  rateLimiter?: RateLimiterConfig;
}
