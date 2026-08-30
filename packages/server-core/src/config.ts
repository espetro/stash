import type { Storage } from "unstorage";
import type { BrotliFunctions } from "@stash/codec";
import type { ServerTtl } from "./store";
import type { TelemetrySink } from "./telemetry";

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

/** Ports every runtime adapter must supply.
 *
 *  NOTE (payload storage): a parallel zero-trust-encryption analysis may
 *  change how payloads are persisted (ciphertext server-side vs fragment-
 *  only). Storage access is deliberately funneled through `storage` (the
 *  unstorage instance) plus the small helpers in `store.ts`
 *  (`createStash` / `getStash` / `removeItem`), so an encrypted-storage
 *  strategy can slot in behind that seam without touching routes or MCP.
 */
export interface StashServerConfig {
  /** unstorage instance (KV binding, browser.storage.local, memory…) */
  storage: Storage;
  /** Reported origin for share URLs and the MCP server card. */
  origin: string;
  /** Lazily-loaded brotli (worker: vendored wasm; extension: @stash/shared). */
  getBrotli: () => Promise<BrotliFunctions>;
  /** Optional per-IP rate limiting via runtime bindings. Write paths
   *  (POST /api/stash, POST /mcp) fail closed: a limiter that throws
   *  blocks the request rather than admitting it. */
  rateLimiter?: RateLimiterConfig;
  /** Default TTL applied to relay uploads that don't specify one
   *  (HTTP `ttl` field or MCP `ttlDays`). Defaults to "7d" when unset. */
  defaultTtl?: ServerTtl;
  /** Optional TTL ceiling enforced on write paths (HTTP + MCP). Self-hosted
   *  deployments can omit this to keep the full 1d-30d range.
   *  Relay-side concept only; the TTL is bound to the relay upload. */
  maxTtl?: ServerTtl;
  /** Optional aggregate telemetry sink (e.g. Cloudflare Analytics Engine).
   *  Self-hosted / test consumers simply omit it — no-op. */
  telemetry?: TelemetrySink;
}

/** The resolved set of dependencies passed through routing and MCP layers. */
export interface StashServerDeps {
  storage: Storage;
  origin: string;
  getBrotli: () => Promise<BrotliFunctions>;
  defaultTtl: ServerTtl;
  rateLimiter?: RateLimiterConfig;
  maxTtl?: ServerTtl;
  telemetry?: TelemetrySink;
}
