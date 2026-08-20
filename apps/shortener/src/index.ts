import { decodeEncodedPayload } from "@stash/codec";
import { PayloadDecodeError } from "@stash/codec";
import { getBrotli } from "./brotli";
import {
  createStash,
  getStash,
  isServerTtl,
  isExpired,
  cacheControlFor,
  renderMarkdown,
  jsonHeaders,
  type Env,
} from "./store";
import { handleMcpRequest, serverCardResponse } from "./mcp";
import { allowRequest, clientIp, tooManyRequests, mcpTooManyRequests } from "./ratelimit";

const MAX_PAYLOAD_CHARS = 8000;
const ID_RE = /^[A-Z2-7]{6}$/;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
} as const;

function errorResponse(status: number, message: string, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: jsonHeaders(extra),
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    // POST /api/stash  { payload, ttl } -> { id, url }
    if (url.pathname === "/api/stash" && request.method === "POST") {
      if (!(await allowRequest(env.RL_STASH, clientIp(request)))) return tooManyRequests();
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

      // Validate the payload decodes before storing
      let decoded;
      try {
        const brotli = await getBrotli();
        decoded = await decodeEncodedPayload(payload, brotli);
      } catch (error) {
        if (error instanceof PayloadDecodeError) {
          return errorResponse(400, "Invalid payload: " + error.message);
        }
        throw error;
      }

      try {
        const { id, entry } = await createStash(env, payload, ttl);
        return new Response(
          JSON.stringify(
            {
              id,
              url: `${url.origin}/s/${id}`,
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

      const entry = await getStash(env, id);
      if (!entry) return errorResponse(404, "Not found or expired");
      if (isExpired(entry)) return errorResponse(410, "Stash expired");

      const brotli = await getBrotli();
      const decoded = await decodeEncodedPayload(entry.p, brotli);
      const cache = cacheControlFor(entry);
      const baseHeaders = { "Cache-Control": cache, ...cors };

      const format = match[2]?.slice(1) ?? negotiate(request.headers.get("Accept"));

      if (format === "md") {
        return new Response(renderMarkdown(decoded), {
          status: 200,
          headers: { "Content-Type": "text/markdown; charset=utf-8", ...baseHeaders },
        });
      }
      if (format === "json") {
        return new Response(JSON.stringify(decoded, null, 2), {
          status: 200,
          headers: jsonHeaders(baseHeaders),
        });
      }
      // HTML: redirect into the viewer SPA with the payload inline (stateless render)
      const viewer = url.searchParams.get("v") ?? `${url.origin}/s`;
      return Response.redirect(`${viewer}#p=${entry.p}`, 302);
    }

    // MCP: stateless Streamable-HTTP server
    if (url.pathname === "/mcp" && (request.method === "POST" || request.method === "GET")) {
      if (request.method === "POST" && !(await allowRequest(env.RL_MCP, clientIp(request)))) {
        return mcpTooManyRequests();
      }
      return handleMcpRequest(request, env);
    }

    // GET /.well-known/mcp-server-card — discovery card
    if (url.pathname === "/.well-known/mcp-server-card" && request.method === "GET") {
      return serverCardResponse(url.origin);
    }

    // GET /health
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true }), { headers: jsonHeaders() });
    }

    return errorResponse(404, "Not found");
  },
};

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
