import { decodeEncodedPayload, PayloadDecodeError } from "@stash/codec";
import {
  createStash,
  getStash,
  removeItem,
  isServerTtl,
  isExpired,
  cacheControlFor,
  jsonHeaders,
  SERVER_TTL_HOURS,
} from "./store";
import { handleMcpRequest, serverCardResponse } from "./mcp";
import { cors, ID_RE, MAX_PAYLOAD_CHARS } from "./constants";
import { allowRequest, defaultClientIp, tooManyRequests, mcpTooManyRequests } from "./ratelimit";
import {
  classifyClient,
  classifyOrigin,
  ttlBucketFor,
  isBeaconEvent,
  type TelemetryRoute,
  type TtlBucket,
} from "./telemetry";
import {
  negotiateFormat,
  isValidFormatParam,
  type NegotiatedFormat,
} from "@stash/shared/negotiation";
import type { StashServerDeps } from "./config";

function errorResponse(status: number, message: string, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: jsonHeaders(extra),
  });
}

/** Filled in by routeRequest as it determines which route matched, so
 *  handleRequest can record one telemetry event per request afterward. */
interface TelemetryMeta {
  route?: TelemetryRoute;
  ttlBucket?: TtlBucket;
  beaconEvent?: string;
  surface?: "extension" | "web";
}

/** Route a web-standard Request through the stash server.
 *  Pure web APIs only (Request/Response/URL/crypto) — runtime-agnostic. */
export async function handleRequest(request: Request, deps: StashServerDeps): Promise<Response> {
  const meta: TelemetryMeta = {};
  const response = await routeRequest(request, deps, meta);
  if (deps.telemetry && meta.route) {
    deps.telemetry.record({
      route: meta.route,
      clientClass: classifyClient(request),
      status: response.status,
      ttlBucket: meta.ttlBucket ?? "n/a",
      origin: classifyOrigin(request, deps.origin),
      beaconEvent: meta.beaconEvent,
      surface: meta.surface,
    });
  }
  return response;
}

async function routeRequest(
  request: Request,
  deps: StashServerDeps,
  meta: TelemetryMeta,
): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  // POST /beacon  { event, surface } -> 204 — client-side funnel events
  if (url.pathname === "/beacon" && request.method === "POST") {
    meta.route = "beacon";
    let body: { event?: string; surface?: string };
    try {
      body = await request.json();
    } catch {
      return errorResponse(400, "Invalid JSON body");
    }
    if (!isBeaconEvent(body.event) || (body.surface !== "extension" && body.surface !== "web")) {
      return errorResponse(400, "Invalid beacon event");
    }
    meta.beaconEvent = body.event;
    meta.surface = body.surface;
    return new Response(null, { status: 204, headers: cors });
  }

  // POST /api/stash  { ciphertext, ttl } -> { id, url }
  // Zero-trust relay (F14): the client encrypts the encoded payload with a
  // per-share AES-GCM key carried in the URL fragment; the server stores
  // only opaque ciphertext and never sees plaintext or keys.
  if (url.pathname === "/api/stash" && request.method === "POST") {
    meta.route = "api_stash";
    const limiter = deps.rateLimiter;
    if (
      limiter &&
      !(await allowRequest(limiter.stash, (limiter.clientIp ?? defaultClientIp)(request), "closed"))
    ) {
      return tooManyRequests();
    }
    let body: { ciphertext?: string; payload?: string; ttl?: string };
    try {
      body = await request.json();
    } catch {
      return errorResponse(400, "Invalid JSON body");
    }

    // Back-compat alias: a bare `payload` field is treated as ciphertext.
    const ciphertext = body.ciphertext ?? body.payload;
    if (typeof ciphertext !== "string" || ciphertext.length === 0) {
      return errorResponse(400, "Missing required field: ciphertext");
    }
    if (ciphertext.length > MAX_PAYLOAD_CHARS) {
      return errorResponse(413, `Ciphertext exceeds ${MAX_PAYLOAD_CHARS} chars`);
    }
    if (!/^[A-Za-z0-9_-]+$/.test(ciphertext)) {
      return errorResponse(400, "Ciphertext must be a base64url string");
    }

    const ttl = body.ttl ?? deps.defaultTtl;
    if (!isServerTtl(ttl)) {
      return errorResponse(400, "ttl must be one of 1d, 7d, 14d, 30d");
    }
    meta.ttlBucket = ttlBucketFor(ttl);
    if (deps.maxTtl && SERVER_TTL_HOURS[ttl] > SERVER_TTL_HOURS[deps.maxTtl]) {
      return errorResponse(400, `ttl exceeds maximum allowed (${deps.maxTtl})`);
    }

    try {
      const { id, entry } = await createStash(deps.storage, ciphertext, ttl, {
        encrypted: true,
      });
      return new Response(
        JSON.stringify(
          {
            id,
            url: `${deps.origin}/s/${id}`,
            expiry: entry.e,
          },
          null,
          2,
        ),
        { status: 201, headers: jsonHeaders() },
      );
    } catch (e) {
      if (e instanceof Error && e.message === "id-collision") {
        return errorResponse(503, "Could not allocate id, retry");
      }
      throw e;
    }
  }

  // DELETE /api/stash/:id -> 204 (revokes a short link before TTL expiry).
  // No auth in v1: the id is a 6-char unguessable base32 secret; abuse is
  // bounded by the rate limiter. See the relay README.
  const deleteMatch = url.pathname.match(/^\/api\/stash\/([A-Za-z2-7]{6})\/?$/);
  if (deleteMatch && request.method === "DELETE") {
    meta.route = "api_stash_delete";
    const limiter = deps.rateLimiter;
    if (
      limiter &&
      !(await allowRequest(limiter.stash, (limiter.clientIp ?? defaultClientIp)(request), "closed"))
    ) {
      return tooManyRequests();
    }
    const id = deleteMatch[1].toUpperCase();
    if (!(await deps.storage.hasItem(id))) return errorResponse(404, "Not found");
    await removeItem(deps.storage, id);
    return new Response(null, { status: 204, headers: cors });
  }

  // GET /s/:id — zero-trust relay: entries are opaque ciphertext. The
  // client (viewer/extension) fetches it and decrypts with the fragment
  // key, which never reaches this server. ?format=json returns the
  // ciphertext envelope; md/txt negotiation is impossible without the key
  // and fails closed. HTML redirects into the viewer SPA with the id,
  // preserving the caller's fragment (the key) across the redirect.
  const match = url.pathname.match(/^\/s\/([A-Za-z2-7]{6})(\.(json|md|txt))?\/?$/);
  if (match && request.method === "GET") {
    const id = match[1].toUpperCase();
    if (!ID_RE.test(id)) return errorResponse(400, "Invalid id");

    if (match[2]) {
      const suffix = match[2].slice(1) as NegotiatedFormat;
      return new Response(null, {
        status: 301,
        headers: { Location: `${url.origin}/s/${id}?format=${suffix}`, ...cors },
      });
    }

    const formatParam = url.searchParams.get("format");
    if (formatParam !== null && formatParam !== "" && !isValidFormatParam(formatParam)) {
      return errorResponse(
        400,
        `Unknown format "${formatParam}"; supported: json, md, markdown, txt, plain, text`,
      );
    }
    const format = negotiateFormat(request.headers.get("Accept"), formatParam);

    const entry = await getStash(deps.storage, id);
    if (!entry) return errorResponse(404, "Not found or expired");
    if (isExpired(entry)) return errorResponse(410, "Stash expired");

    const cache = cacheControlFor(entry);
    const baseHeaders = { "Cache-Control": cache, ...cors };

    if (format === "json") {
      meta.route = "s_view_json";
      // Ciphertext envelope: the caller decrypts client-side with the
      // fragment key. The server holds no key material and cannot help.
      return new Response(
        JSON.stringify({ id, ciphertext: entry.p, expiry: entry.e, encrypted: true }, null, 2),
        { status: 200, headers: jsonHeaders(baseHeaders) },
      );
    }
    if (format === "md" || format === "txt") {
      meta.route = format === "md" ? "s_view_md" : "s_view_txt";
      // Fail closed: the payload is client-encrypted; md/txt rendering
      // would require the fragment key, which never reaches the server.
      return errorResponse(409, "Encrypted stash: plaintext formats require the link fragment");
    }
    // HTML: redirect into the viewer SPA, preserving the fragment (key).
    meta.route = "s_view_html";
    const viewer = url.searchParams.get("v") ?? `${deps.origin}/s`;
    return new Response(null, {
      status: 302,
      headers: { Location: `${viewer}?id=${id}${url.hash}`, ...cors },
    });
  }

  // MCP: stateless Streamable-HTTP server
  if (url.pathname === "/mcp" && (request.method === "POST" || request.method === "GET")) {
    meta.route = "mcp";
    const limiter = deps.rateLimiter;
    if (
      request.method === "POST" &&
      limiter &&
      // Fail-closed (§12.2): /mcp is a quota-consuming write path on the
      // hosted relay, so a degraded RateLimit binding blocks writes
      // instead of admitting them. Missing binding still allows.
      !(await allowRequest(limiter.mcp, (limiter.clientIp ?? defaultClientIp)(request), "closed"))
    ) {
      return mcpTooManyRequests();
    }
    return handleMcpRequest(request, deps);
  }

  // GET /.well-known/mcp-server-card — discovery card
  if (url.pathname === "/.well-known/mcp-server-card" && request.method === "GET") {
    meta.route = "card";
    return serverCardResponse(deps.origin);
  }

  // GET /health
  if (url.pathname === "/health") {
    meta.route = "health";
    return new Response(JSON.stringify({ ok: true }), { headers: jsonHeaders() });
  }

  return errorResponse(404, "Not found");
}
