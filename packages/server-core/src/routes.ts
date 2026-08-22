import { decodeEncodedPayload, PayloadDecodeError } from "@stash/codec";
import {
  createStash,
  getStash,
  isServerTtl,
  isExpired,
  cacheControlFor,
  renderMarkdown,
  jsonHeaders,
  SERVER_TTL_HOURS,
} from "./store";
import { handleMcpRequest, serverCardResponse } from "./mcp";
import { cors, ID_RE, MAX_PAYLOAD_CHARS } from "./constants";
import {
  allowRequest,
  defaultClientIp,
  tooManyRequests,
  mcpTooManyRequests,
} from "./ratelimit";
import {
  classifyClient,
  classifyOrigin,
  ttlBucketFor,
  isBeaconEvent,
  type TelemetryRoute,
  type TtlBucket,
} from "./telemetry";
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
      !(await allowRequest(
        limiter.stash,
        (limiter.clientIp ?? defaultClientIp)(request),
        "closed",
      ))
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

    const ttl = body.ttl ?? "7d";
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

  // GET /s/:id(.json|.md)? — content negotiation by suffix (path URL, no fragment limits)
  const match = url.pathname.match(/^\/s\/([A-Za-z2-7]{6})(\.(?:json|md))?\/?$/);
  if (match && request.method === "GET") {
    const id = match[1].toUpperCase();
    if (!ID_RE.test(id)) return errorResponse(400, "Invalid id");

    const entry = await getStash(deps.storage, id);
    if (!entry) return errorResponse(404, "Not found or expired");
    if (isExpired(entry)) return errorResponse(410, "Stash expired");

    const brotli = await deps.getBrotli();
    const decoded = await decodeEncodedPayload(entry.p, brotli);
    const cache = cacheControlFor(entry);
    const baseHeaders = { "Cache-Control": cache, ...cors };

    const format = match[2]?.slice(1) ?? negotiate(request.headers.get("Accept"));

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
      !(await allowRequest(
        limiter.mcp,
        (limiter.clientIp ?? defaultClientIp)(request),
      ))
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

function negotiate(accept: string | null): "md" | "json" | null {
  if (!accept) return null;
  const a = accept.toLowerCase();
  const html = a.indexOf("text/html");
  const md = a.indexOf("text/markdown");
  const json = a.indexOf("application/json");
  const best = Math.min(md >= 0 ? md : Infinity, json >= 0 ? json : Infinity);
  if (best === Infinity || (html >= 0 && html < best)) return null;
  return best === md ? "md" : "json";
}
