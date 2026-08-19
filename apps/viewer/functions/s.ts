import { PayloadDecodeError } from "@stash/codec";
import {
  decodePayload,
  buildCacheControl,
  checkRateLimit,
  extractClientIp,
} from "./_shared/decode";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

function negotiateFormat(request: Request, url: URL): "md" | "json" | null {
  // 1. Explicit ?format=
  const format = url.searchParams.get("format");
  if (format === "md" || format === "markdown") return "md";
  if (format === "json") return "json";

  // 2. Suffix on the p parameter (/s?p=xxx.md or /s?p=xxx.json)
  const p = url.searchParams.get("p");
  if (p) {
    if (p.endsWith(".md") && p.length > 3) return "md";
    if (p.endsWith(".json") && p.length > 5) return "json";
  }

  // 3. Accept header
  const accept = (request.headers.get("Accept") ?? "").toLowerCase();
  // Only negotiate when HTML is NOT explicitly preferred (browsers send text/html first)
  const htmlIndex = accept.indexOf("text/html");
  const mdIndex = accept.indexOf("text/markdown");
  const jsonIndex = accept.indexOf("application/json");
  const minNonHtml = Math.min(
    mdIndex >= 0 ? mdIndex : Infinity,
    jsonIndex >= 0 ? jsonIndex : Infinity,
  );
  if (minNonHtml !== Infinity && (htmlIndex < 0 || minNonHtml < htmlIndex)) {
    return minNonHtml === mdIndex ? "md" : "json";
  }

  return null;
}

function stripSuffix(p: string, format: "md" | "json"): string {
  return p.endsWith(`.${format}`) ? p.slice(0, -(format.length + 1)) : p;
}

function renderMarkdown(decoded: Awaited<ReturnType<typeof decodePayload>>): string {
  const lines = decoded.items.map(({ url, title }) => {
    const escaped = title.replace(/]/g, "\\]").replace(/\[/g, "\\[");
    return `[${escaped}](${url})`;
  });
  return lines.join("\n");
}

export const onRequest = async (context: any): Promise<Response> => {
  const { request } = context;
  const url = new URL(request.url);

  // Only server-side render when the payload arrived via ?p= (query).
  // Hash fragments never reach the server; those requests fall through to the SPA.
  const rawP = url.searchParams.get("p");
  if (!rawP) {
    return context.next();
  }

  const format = negotiateFormat(request, url);
  if (!format) {
    return context.next();
  }

  try {
    if (!checkRateLimit(extractClientIp(request))) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": "60",
          ...CORS_HEADERS,
        },
      });
    }

    const payload = stripSuffix(rawP, format);
    const decoded = await decodePayload(payload);
    const cacheControl = buildCacheControl(decoded.expiry);

    if (format === "json") {
      return new Response(JSON.stringify(decoded, null, 2), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": cacheControl,
          ...CORS_HEADERS,
        },
      });
    }

    return new Response(renderMarkdown(decoded), {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": cacheControl,
        ...CORS_HEADERS,
      },
    });
  } catch (error) {
    if (error instanceof PayloadDecodeError) {
      return new Response(
        JSON.stringify({ error: "Invalid payload: " + error.message }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...CORS_HEADERS },
        },
      );
    }
    return context.next();
  }
};
