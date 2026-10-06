/**
 * Portable, runtime-agnostic handler for GET /api/title (F13 W1).
 * No Pages Functions `context` object; callable from any Web-standard
 * runtime (Pages Functions adapter, apps/mirror, Deno Deploy, ...).
 */
import { checkRateLimit, extractClientIp } from "../ratelimit";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m);
}

function json(body: unknown, status: number, cacheControl = "public, max-age=86400"): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cacheControl,
      ...CORS_HEADERS,
    },
  });
}

/**
 * Best-effort page title extraction for the /s/new form.
 * GET /api/title?url=<encoded url> -> { title }
 * Falls back to the hostname when the page can't be fetched or has no title.
 */
export async function handleTitleRequest(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "GET") {
    return json({ error: "Method not allowed" }, 405, "no-store");
  }

  if (!checkRateLimit(extractClientIp(request))) {
    return json({ error: "Rate limit exceeded" }, 429, "no-store");
  }

  const raw = new URL(request.url).searchParams.get("url");
  if (!raw) return json({ error: "Missing required parameter: url" }, 400, "no-store");

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return json({ error: "Invalid url" }, 400, "no-store");
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return json({ error: "url must be http(s)" }, 400, "no-store");
  }

  try {
    const res = await fetch(target.toString(), {
      redirect: "follow",
      signal: AbortSignal.timeout(4000),
      headers: {
        // Some sites gate browsers by UA; keep a plain browser-ish one
        "User-Agent": "Mozilla/5.0 (compatible; StashTitleBot/1.0; +https://stash.illo.fyi)",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    // Only read a prefix; titles live in <head>
    const reader = res.body?.getReader();
    let html = "";
    if (reader) {
      const decoder = new TextDecoder();
      while (html.length < 100_000) {
        const { done, value } = await reader.read();
        if (done) break;
        html += decoder.decode(value, { stream: true });
      }
      reader.cancel();
    } else {
      html = (await res.text()).slice(0, 100_000);
    }

    const match =
      html.match(/<title[^>]*>([^<]{1,300})<\/title>/i) ??
      html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']{1,300})["']/i) ??
      html.match(/<meta[^>]+content=["']([^"']{1,300})["'][^>]+property=["']og:title["']/i);

    const title = match ? decodeEntities(match[1].trim()) : target.hostname;
    return json({ title }, 200);
  } catch {
    // Network/timeout/parse failure: graceful fallback
    return json({ title: target.hostname }, 200);
  }
}
