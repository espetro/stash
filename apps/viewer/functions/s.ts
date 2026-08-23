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

function negotiateFormat(request: Request, url: URL): "md" | "json" | "txt" | null {
  // 1. Explicit ?format=
  const format = url.searchParams.get("format");
  if (format === "md" || format === "markdown") return "md";
  if (format === "json") return "json";
  if (format === "txt" || format === "plain" || format === "text") return "txt";

  // 2. Accept header
  const accept = (request.headers.get("Accept") ?? "").toLowerCase();
  // Only negotiate when HTML is NOT explicitly preferred (browsers send text/html first)
  const htmlIndex = accept.indexOf("text/html");
  const mdIndex = accept.indexOf("text/markdown");
  const jsonIndex = accept.indexOf("application/json");
  const txtIndex = accept.indexOf("text/plain");
  const minNonHtml = Math.min(
    mdIndex >= 0 ? mdIndex : Infinity,
    jsonIndex >= 0 ? jsonIndex : Infinity,
    txtIndex >= 0 ? txtIndex : Infinity,
  );
  if (minNonHtml !== Infinity && (htmlIndex < 0 || minNonHtml < htmlIndex)) {
    if (minNonHtml === mdIndex) return "md";
    if (minNonHtml === txtIndex) return "txt";
    return "json";
  }

  return null;
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

export const onRequest = async (context: any): Promise<Response> => {
  const { request } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { ...CORS_HEADERS },
    });
  }

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

    const decoded = await decodePayload(rawP);
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

    if (format === "txt") {
      return new Response(renderPlainUrlList(decoded), {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
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
