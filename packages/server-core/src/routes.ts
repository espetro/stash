import { decodeEncodedPayload, PayloadDecodeError } from "@stash/codec";
import {
  createStash,
  getStash,
  removeItem,
  isServerTtl,
  isExpired,
  cacheControlFor,
  renderMarkdown,
  renderPlainUrlList,
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
  BEACON_EVENTS,
  type TelemetryRoute,
  type TtlBucket,
} from "./telemetry";
import {
  negotiateFormat,
  isValidFormatParam,
  type NegotiatedFormat,
} from "@stash/shared/negotiation";
import { stashError, type StashErrorCode } from "@stash/shared/error-contract";
import type { StashServerDeps } from "./config";

function errorResponse(
  status: number,
  code: StashErrorCode,
  message: string,
  hint?: string,
  extra: Record<string, string> = {},
) {
  return new Response(JSON.stringify(stashError(code, message, hint)), {
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
      return errorResponse(400, "invalid_json", "Request body is not valid JSON");
    }
    if (!isBeaconEvent(body.event) || (body.surface !== "extension" && body.surface !== "web")) {
      return errorResponse(
        400,
        "invalid_beacon",
        "Invalid beacon event",
        `expected {event: one of ${BEACON_EVENTS.join("|")}, surface: "extension"|"web"}`,
      );
    }
    meta.beaconEvent = body.event;
    meta.surface = body.surface;
    return new Response(null, { status: 204, headers: cors });
  }

  // POST /api/stash  { ciphertext, ttl } | { payload, ttl } -> { id, url }
  // Dual-mode relay (F14): `ciphertext` stores a client-encrypted blob
  // (zero-trust: the server never sees plaintext or keys); `payload` keeps
  // the legacy contract — a decodable plaintext payload, validated and
  // stored readable so agent flows (?format=, MCP read-back) keep working.
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
      return errorResponse(400, "invalid_json", "Request body is not valid JSON");
    }

    const hasCiphertext = typeof body.ciphertext === "string" && body.ciphertext.length > 0;
    const hasPayload = typeof body.payload === "string" && body.payload.length > 0;
    if (!hasCiphertext && !hasPayload) {
      return errorResponse(
        400,
        "missing_field",
        "Missing required field: ciphertext or payload",
        'send {"payload": "<encoded>", "ttl?": "1d|7d|14d|30d"} for a plaintext stash, or {"ciphertext": "<base64url>"} for a client-encrypted one',
      );
    }
    if (hasCiphertext && hasPayload) {
      return errorResponse(
        400,
        "conflicting_fields",
        "Pass ciphertext OR payload, not both",
      );
    }

    const blob = (body.ciphertext ?? body.payload) as string;
    if (blob.length > MAX_PAYLOAD_CHARS) {
      return errorResponse(
        413,
        "payload_too_large",
        `Payload exceeds ${MAX_PAYLOAD_CHARS} chars`,
      );
    }

    // Validate per mode: ciphertext is opaque (base64url only); payload
    // must carry a known prefix and decode.
    if (hasCiphertext && !/^[A-Za-z0-9_-]+$/.test(blob)) {
      return errorResponse(400, "invalid_ciphertext", "Ciphertext must be a base64url string");
    }
    let decoded;
    if (hasPayload) {
      if (blob[0] !== "C" && blob[0] !== "R" && blob[0] !== "D" && blob[0] !== "S") {
        return errorResponse(
          400,
          "unknown_prefix",
          "Unknown payload prefix",
          "payload must start with C, R, D or S — take it from a share URL's #p= fragment or POST {ciphertext} for opaque client-encrypted data",
        );
      }
      try {
        const brotli = await deps.getBrotli();
        decoded = await decodeEncodedPayload(blob, brotli);
      } catch (error) {
        if (error instanceof PayloadDecodeError) {
          return errorResponse(400, "invalid_payload", "Invalid payload: " + error.message);
        }
        throw error;
      }
    }

    const ttl = body.ttl ?? deps.defaultTtl;
    if (!isServerTtl(ttl)) {
      return errorResponse(400, "invalid_ttl", 'ttl must be one of "1d", "7d", "14d", "30d"');
    }
    meta.ttlBucket = ttlBucketFor(ttl);
    if (deps.maxTtl && SERVER_TTL_HOURS[ttl] > SERVER_TTL_HOURS[deps.maxTtl]) {
      return errorResponse(
        400,
        "ttl_exceeded",
        `ttl exceeds maximum allowed (${deps.maxTtl})`,
        `this relay caps ttl at ${deps.maxTtl}; retry with a smaller value`,
      );
    }

    try {
      const { id, entry } = await createStash(deps.storage, blob, ttl, {
        encrypted: hasCiphertext,
      });
      return new Response(
        JSON.stringify(
          {
            id,
            url: `${deps.origin}/s/${id}`,
            expiry: entry.e,
            ...(decoded ? { itemCount: decoded.items.length } : {}),
          },
          null,
          2,
        ),
        { status: 201, headers: jsonHeaders() },
      );
    } catch (e) {
      if (e instanceof Error && e.message === "id-collision") {
        return errorResponse(503, "id_collision", "Could not allocate id", "retry the request");
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
    if (!(await deps.storage.hasItem(id))) return errorResponse(404, "not_found", "Not found");
    await removeItem(deps.storage, id);
    return new Response(null, { status: 204, headers: cors });
  }

  // GET /s/:id — content negotiation via ?format= then Accept header,
  // gated on entry.enc (F14 dual-mode):
  //  - plaintext entries (legacy + agent-created): decode and serve
  //    md/txt/json; HTML redirects with the payload inline as before.
  //  - encrypted entries (zero-trust client uploads): ?format=json returns
  //    the ciphertext envelope, md/txt fail closed 409, and HTML redirects
  //    to the viewer with ?id=<id>&relay=<origin> — the viewer fetches the
  //    ciphertext from the minting relay and decrypts with the fragment
  //    key, which never reaches any server.
  // The legacy .json|.md|.txt suffix routes are deprecated for one
  // release: they 301-redirect to /s/:id?format=<fmt>.
  const match = url.pathname.match(/^\/s\/([A-Za-z2-7]{6})(\.(json|md|txt))?\/?$/);
  if (match && request.method === "GET") {
    const id = match[1].toUpperCase();
    if (!ID_RE.test(id))
      return errorResponse(400, "invalid_id", "Invalid id", "expected a 6-character base32 id");

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
        "unknown_format",
        `Unknown format "${formatParam}"`,
        "supported: json, md, markdown, txt, plain, text — e.g. /s/<id>?format=json, or send Accept: application/json",
      );
    }
    const format = negotiateFormat(request.headers.get("Accept"), formatParam);

    const entry = await getStash(deps.storage, id);
    if (!entry) return errorResponse(404, "not_found", "Not found or expired");
    if (isExpired(entry))
      return errorResponse(410, "expired", "Stash expired", "short links are temporary; ask the owner to re-share");

    const cache = cacheControlFor(entry);
    const baseHeaders = { "Cache-Control": cache, ...cors };

    if (entry.enc) {
      if (format === "json") {
        meta.route = "s_view_json";
        return new Response(
          JSON.stringify({ id, ciphertext: entry.p, expiry: entry.e, encrypted: true }, null, 2),
          { status: 200, headers: jsonHeaders(baseHeaders) },
        );
      }
      if (format === "md" || format === "txt") {
        meta.route = format === "md" ? "s_view_md" : "s_view_txt";
        // Fail closed: the payload is client-encrypted; md/txt rendering
        // would require the fragment key, which never reaches the server.
        return errorResponse(
          409,
          "encrypted_payload",
          "Encrypted stash: plaintext formats require the link fragment",
          "GET ?format=json returns {id, ciphertext, expiry, encrypted} — decrypt locally with the AES-256-GCM key from the share URL's #<key> fragment",
        );
      }
      // HTML: hand the viewer the id + minting relay; the caller's URL
      // fragment (the key) is preserved across redirects by the browser.
      meta.route = "s_view_html";
      const viewer = url.searchParams.get("v") ?? `${deps.viewerOrigin}/s`;
      const relay = encodeURIComponent(deps.origin);
      return new Response(null, {
        status: 302,
        headers: {
          Location: `${viewer}?id=${id}&relay=${relay}`,
          Link: `<${deps.origin}/s/${id}?format=json>; rel="alternate"; type="application/json"`,
          ...cors,
        },
      });
    }

    const brotli = await deps.getBrotli();
    const decoded = await decodeEncodedPayload(entry.p, brotli);

    if (format === "md") {
      meta.route = "s_view_md";
      return new Response(renderMarkdown(decoded), {
        status: 200,
        headers: { "Content-Type": "text/markdown; charset=utf-8", ...baseHeaders },
      });
    }
    if (format === "json") {
      meta.route = "s_view_json";
      return new Response(JSON.stringify(decoded, null, 2), {
        status: 200,
        headers: jsonHeaders(baseHeaders),
      });
    }
    if (format === "txt") {
      meta.route = "s_view_txt";
      return new Response(renderPlainUrlList(decoded), {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8", ...baseHeaders },
      });
    }
    // HTML: redirect into the viewer SPA with the payload inline (stateless render)
    meta.route = "s_view_html";
    const viewer = url.searchParams.get("v") ?? `${deps.viewerOrigin}/s`;
    return new Response(null, {
      status: 302,
      headers: {
        Location: `${viewer}#p=${entry.p}`,
        Link: `<${deps.origin}/s/${id}?format=json>; rel="alternate"; type="application/json"`,
        ...cors,
      },
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

  return errorResponse(404, "not_found", "Not found");
}
