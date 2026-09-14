/**
 * Portable, runtime-agnostic `Request -> Response` handler for the /s route
 * (F13 W1). Free of Pages Functions `context` objects so the same logic can
 * be mounted by Cloudflare Pages Functions, the mirror origin (apps/mirror),
 * or any Web-standard runtime (Vercel/Netlify/Deno Deploy/Fly).
 *
 * Behavior contract (unchanged from the original inline implementation):
 * - OPTIONS -> 204 with CORS headers
 * - no `?p=` query -> `next()` (SPA fallthrough); hash fragments never
 *   reach the server, only `?p=` payloads get server-side rendering
 * - explicit `?format=` wins, then Accept negotiation, then HTML fallthrough
 * - unknown format is a 400 client error, never a silent HTML redirect
 * - rate limit and decode errors return JSON, never HTML
 */
import { PayloadDecodeError, decodeEncodedPayload } from "@stash/codec";
import { isValidFormatParam, negotiateFormat } from "@stash/shared/negotiation";
import { getBrotli } from "../brotli";
import { checkRateLimit, extractClientIp } from "../ratelimit";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

// /s?p= responses carry payload data reconstructed from the URL; never index them.
const NOINDEX = { "X-Robots-Tag": "noindex" } as const;

interface Decoded {
  title?: string;
  tags: string[];
  note?: string;
  expiry: number;
  isExpired: boolean;
  version: number;
  items: Array<{ url: string; title: string; kind?: string }>;
}

async function decodePayload(p: string): Promise<Decoded> {
  const brotli = await getBrotli();
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

function buildCacheControl(expiry: number): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (expiry <= nowSeconds) return "public, max-age=31536000, immutable";
  return `public, max-age=${expiry - nowSeconds}`;
}

function renderMarkdown(decoded: Awaited<ReturnType<typeof decodePayload>>): string {
  const lines = decoded.items.map(({ url, title }) => {
    const escaped = title.replace(/]/g, "\\]").replace(/\[/g, "\\[");
    return `[${escaped}](${url})`;
  });
  return lines.join("\n");
}

function renderPlainUrlList(decoded: Awaited<ReturnType<typeof decodePayload>>): string {
  return decoded.items
    .filter(({ kind }) => kind !== "note")
    .map(({ url }) => url)
    .join("\n");
}

/** SPA fallthrough callback: invoked when the request should be handed to
 *  the host's static asset pipeline instead of rendered here. */
export type Fallthrough = () => Response | Promise<Response>;

export async function handleShareRequest(
  request: Request,
  next: Fallthrough = () => new Response(null, { status: 404 }),
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { ...CORS, ...NOINDEX },
    });
  }

  const url = new URL(request.url);

  // Only server-side render when the payload arrived via ?p= (query).
  const rawP = url.searchParams.get("p");
  if (!rawP) {
    return next();
  }

  // Explicit ?format= wins, then Accept negotiation, then HTML fallthrough.
  // An unknown format value is a client error, not a silent HTML redirect.
  const formatParam = url.searchParams.get("format");
  if (formatParam && !isValidFormatParam(formatParam)) {
    return new Response(
      JSON.stringify({
        error: `Unknown format parameter: ${formatParam} (expected json, md, or txt)`,
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json", ...CORS, ...NOINDEX },
      },
    );
  }

  const format = negotiateFormat(request.headers.get("Accept"), formatParam);
  if (!format) {
    return next();
  }

  try {
    if (!checkRateLimit(extractClientIp(request))) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": "60",
          ...CORS,
          ...NOINDEX,
        },
      });
    }

    const decoded = await decodePayload(rawP);
    const cacheControl = buildCacheControl(decoded.expiry);

    if (format === "json") {
      return new Response(JSON.stringify(decoded, null, 2), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": cacheControl,
          ...CORS,
          ...NOINDEX,
        },
      });
    }

    if (format === "txt") {
      return new Response(renderPlainUrlList(decoded), {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": cacheControl,
          ...CORS,
          ...NOINDEX,
        },
      });
    }

    return new Response(renderMarkdown(decoded), {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": cacheControl,
        ...CORS,
        ...NOINDEX,
      },
    });
  } catch (error) {
    if (error instanceof PayloadDecodeError) {
      return new Response(JSON.stringify({ error: "Invalid payload: " + error.message }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...CORS, ...NOINDEX },
      });
    }
    // A negotiated format was promised; fail with JSON, never HTML.
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS, ...NOINDEX },
    });
  }
}
