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

  // POST /api/stash  { payload, ttl } -> { id, url }
  if (url.pathname === "/api/stash" && request.method === "POST") {
    meta.route = "api_stash";
    const limiter = deps.rateLimiter;
    if (
      limiter &&
      !(await allowRequest(limiter.stash, (limiter.clientIp ?? defaultClientIp)(request), "closed"))
    ) {
      return tooManyRequests();
    }
    let body: { payload?: string; ttl?: string };
    try {
      body = await request.json();
    } catch {
      return errorResponse(400, "Invalid JSON body");
    }

    const payload = body.payload;
    if (typeof payload !== "string" || payload.length === 0) {
      return errorResponse(400, "Missing required field: payload");
    }
    if (payload.length > MAX_PAYLOAD_CHARS) {
      return errorResponse(413, `Payload exceeds ${MAX_PAYLOAD_CHARS} chars`);
    }
    if (payload[0] !== "C" && payload[0] !== "R" && payload[0] !== "D" && payload[0] !== "S") {
      return errorResponse(400, "Unknown payload prefix");
    }

    const ttl = body.ttl ?? deps.defaultTtl;
    if (!isServerTtl(ttl)) {
      return errorResponse(400, "ttl must be one of 1d, 7d, 14d, 30d");
    }
    meta.ttlBucket = ttlBucketFor(ttl);
    if (deps.maxTtl && SERVER_TTL_HOURS[ttl] > SERVER_TTL_HOURS[deps.maxTtl]) {
      return errorResponse(400, `ttl exceeds maximum allowed (${deps.maxTtl})`);
    }

    // Validate the payload decodes before storing
    let decoded;
    try {
      const brotli = await deps.getBrotli();
      decoded = await decodeEncodedPayload(payload, brotli);
    } catch (error) {
      if (error instanceof PayloadDecodeError) {
        return errorResponse(400, "Invalid payload: " + error.message);
      }
      throw error;
    }

    try {
      const { id, entry } = await createStash(deps.storage, payload, ttl);
      return new Response(
        JSON.stringify(
          {
            id,
            url: `${deps.origin}/s/${id}`,
            expiry: entry.e,
            itemCount: decoded.items.length,
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

  // GET /s/:id — content negotiation via ?format= then Accept header.
  // The legacy .json|.md|.txt suffix routes are deprecated for one
  // release: they 301-redirect to /s/:id?format=<fmt>.
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

    const brotli = await deps.getBrotli();
    const decoded = await decodeEncodedPayload(entry.p, brotli);
    const cache = cacheControlFor(entry);
    const baseHeaders = { "Cache-Control": cache, ...cors };

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
    const viewer = url.searchParams.get("v") ?? `${deps.origin}/s`;
    return Response.redirect(`${viewer}#p=${entry.p}`, 302);
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
