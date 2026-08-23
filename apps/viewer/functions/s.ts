import { PayloadDecodeError } from "@stash/codec";
import { isValidFormatParam, negotiateFormat } from "@stash/shared/negotiation";
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
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      },
    );
  }

  const format = negotiateFormat(request.headers.get("Accept"), formatParam);
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
      return new Response(JSON.stringify({ error: "Invalid payload: " + error.message }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }
    // A negotiated format was promised; fail with JSON, never HTML.
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
};
