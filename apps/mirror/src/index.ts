/**
 * @stash/mirror — portable mirror origin app (F13 W1+W2+W5).
 *
 * Single entry: `handleMirrorRequest(request, config) -> Response`.
 * Mounts, on one deployment:
 *   - the W2 relay (@stash/server-core): POST /api/stash, GET /s/:id,
 *     DELETE /api/stash/:id, POST /mcp, GET /.well-known/mcp-server-card,
 *     GET /health
 *   - the W1 decode surface (extracted from apps/viewer/functions):
 *     GET /s?p=..&format=, GET /api/title
 *   - GET /llms.txt (W3 probe target; small, cacheable, always present)
 *
 * Provider wiring: any runtime that supplies a `unstorage` Storage and
 * passes standard Requests works. Deno Deploy is the chosen mirror host
 * (ADR in commit message): Deno KV has native TTL-compatible expiry via
 * keys' `expireIn`, a free tier sized for share-link traffic, wasm asset
 * bundling, and non-Cloudflare IP space. Storage selection is runtime
 * config (env MIRROR_STORAGE), never build-time.
 *
 * Rate limiting: Workers RL_* bindings are Cloudflare-specific. The mirror
 * uses a best-effort in-process limiter and FAILS OPEN: during a
 * Cloudflare null-route outage the mirror is the availability path, and a
 * per-instance limiter is advisory only (each instance counts separately,
 * so it cannot bound global abuse anyway). This divergence from the
 * primary (fails closed after F7.W4) is deliberate and recorded here.
 * Providers with an edge rate limiter (Vercel WAF, Deno Deploy
 * constraints at the platform level) should prefer that.
 */
import { createStorage, type Storage } from "unstorage";
import memoryDriver from "unstorage/drivers/memory";
import { createStashServer, type StashServerConfig, type TelemetrySink } from "@stash/server-core";
import { getBrotli } from "./brotli";
import { inProcessRateLimiter } from "./ratelimit";
import { handleShareRequest } from "./handlers/share";
import { handleTitleRequest } from "./handlers/title";

/** Mirror runtime configuration (env / provider config, not build-time). */
export interface MirrorConfig {
  /** unstorage Storage instance. Defaults to in-memory (stateful instances
   *  only; horizontal scaling needs Redis/Vercel KV/Deno KV — see storage
   *  note below). Tests inject memory. */
  storage?: Storage;
  /** Origin override; derived from the request URL when unset (so the
   *  discovery card advertises the mirror origin automatically). */
  origin?: string;
  /** TTL ceiling for relay uploads on this backend. Backends WITHOUT a
   *  native TTL concept MUST NOT claim a ceiling they can't enforce; the
   *  in-memory driver has none, so expiresAt is stored alongside the
   *  entry and swept on read (server-core already 404s expired entries;
   *  the sweep just reclaims memory). */
  maxTtl?: "1d" | "7d" | "14d" | "30d";
  telemetry?: TelemetrySink;
}

/** Fetch-style handler: `Deno.serve` / Bun / Vercel edge / Node adapters
 *  all call this with a Request. */
export async function handleMirrorRequest(
  request: Request,
  config: MirrorConfig = {},
): Promise<Response> {
  const url = new URL(request.url);

  // W3 probe target: tiny, cacheable, always present on both origins.
  if (url.pathname === "/llms.txt") {
    return new Response(LLMS_TXT, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    });
  }

  if (url.pathname === "/health") {
    return new Response(JSON.stringify({ ok: true, role: "mirror" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Decode surface (W1): identical behavior to the primary /s?p= handler.
  if (url.pathname === "/s" || url.pathname === "/s/") {
    return handleShareRequest(request, () => new Response(null, { status: 404 }));
  }
  if (url.pathname === "/api/title") {
    return handleTitleRequest(request);
  }

  // Relay surface (W2): same route contract as apps/shortener.
  const storage = config.storage ?? defaultStorage();
  const origin = config.origin ?? url.origin;
  const serverConfig: StashServerConfig = {
    storage,
    origin,
    getBrotli,
    rateLimiter: { ...inProcessRateLimiter() },
    maxTtl: config.maxTtl ?? "7d",
    telemetry: config.telemetry, // optional: mirror runs without Analytics Engine
  };
  const server = createStashServer(serverConfig);
  return server.handle(request);
}

const LLMS_TXT = `# stash mirror

This origin is the non-Cloudflare mirror for Stash (https://stash.illo.fyi).
It serves the same relay + decode surface as the primary; during a primary
outage, failover-aware clients emit share links pointing here.

Agent surface:
- POST /api/stash { payload, ttl } -> { id, url }
- GET /s/{id}?format=json|md|txt
- DELETE /api/stash/{id} (revoke)
- GET /s?p=<encoded payload>&format=json|md|txt (stateless decode)
- POST /mcp (MCP: stash_create, stash_get, stash_decode)
- GET /.well-known/mcp-server-card
`;

let _default: Storage | null = null;

function defaultStorage(): Storage {
  // In-memory is the safe default for local/dev and tests. Production
  // mirror deploys must set MIRROR_STORAGE=deno-kv (or inject a Redis /
  // Vercel KV storage here) — see src/storage.ts for the env wiring.
  if (!_default) _default = createStorage({ driver: memoryDriver() });
  return _default;
}
