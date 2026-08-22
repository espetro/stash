import { jsonHeaders } from "./store";
import type { RateLimitBinding } from "./config";

export function defaultClientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "unknown";
}

/** Checks a rate limit binding. Missing binding always allows. On the
 *  binding throwing, `failMode` decides: "open" (default) allows, "closed"
 *  denies — used for the public shortener's write path so one misbehaving
 *  limiter can't be used to bypass quota. */
export async function allowRequest(
  binding: RateLimitBinding | undefined,
  key: string,
  failMode: "open" | "closed" = "open",
): Promise<boolean> {
  if (!binding) return true;
  try {
    const { success } = await binding.limit({ key });
    return success;
  } catch {
    return failMode === "open";
  }
}

export const RETRY_AFTER = 60;

export function tooManyRequests(): Response {
  return new Response(JSON.stringify({ error: "Too many requests" }), {
    status: 429,
    headers: { "Retry-After": String(RETRY_AFTER), ...jsonHeaders() },
  });
}

export function mcpTooManyRequests(): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32000, message: "Rate limit exceeded, retry after 60s" },
    }),
    {
      status: 429,
      headers: { "Retry-After": String(RETRY_AFTER), ...jsonHeaders() },
    },
  );
}
