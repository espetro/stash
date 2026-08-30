/**
 * Mirror rate limiting (F13 W2).
 *
 * Best-effort in-process sliding window, FAILING OPEN on internal errors
 * (deliberate divergence from the primary, which fails closed — see the
 * note in src/index.ts). Provider edge limiters should replace this when
 * available; each instance counts independently so it bounds per-instance
 * abuse only.
 */

const LIMITS = {
  /** POST /api/stash: 20/min per IP per instance (primary uses 5/min per PoP) */
  stash: { max: 20, windowMs: 60_000 },
  /** POST /mcp: 60/min per IP per instance */
  mcp: { max: 60, windowMs: 60_000 },
} as const;

type Entry = { count: number; resetAt: number };
const buckets = new Map<string, Entry>();

export function checkRateLimit(ip: string, route: "stash" | "mcp" = "stash"): boolean {
  const limits = LIMITS[route as keyof typeof LIMITS] ?? LIMITS.stash;
  const { max, windowMs } = limits;
  const now = Date.now();
  const entry = buckets.get(ip);
  if (!entry || now >= entry.resetAt) {
    buckets.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count++;
  return true;
}

export function extractClientIp(request: Request): string {
  const cfConnectingIp = request.headers.get("CF-Connecting-IP");
  if (cfConnectingIp) return cfConnectingIp;

  const xForwardedFor = request.headers.get("X-Forwarded-For");
  if (xForwardedFor) return xForwardedFor.split(",")[0].trim();

  return "unknown";
}

/** RateLimiterConfig shape expected by @stash/server-core. Fail-open: an
 *  internal error admits the request (recorded decision, see module doc). */
export function inProcessRateLimiter() {
  return {
    stash: {
      limit: async (input: { key: string }) => {
        try {
          return { success: checkRateLimit(input.key, "stash") };
        } catch {
          return { success: true };
        }
      },
    },
    mcp: {
      limit: async (input: { key: string }) => {
        try {
          return { success: checkRateLimit(input.key, "mcp") };
        } catch {
          return { success: true };
        }
      },
    },
  };
}
