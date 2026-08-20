import { jsonHeaders } from "./store";

export function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "unknown";
}

/** Fail-open check. Returns true = allow (binding missing, check passed, or binding threw). */
export async function allowRequest(binding: RateLimit | undefined, key: string): Promise<boolean> {
  if (!binding) return true;
  try {
    const { success } = await binding.limit({ key });
    return success;
  } catch {
    return true; // fail-open
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
