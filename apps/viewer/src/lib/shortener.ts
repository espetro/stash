export interface CreateShortLinkParams {
  payload: string;
  ttlDays: 1 | 7 | 14 | 30;
  shortenerOrigin: string;
}

export type CreateShortLinkResult = { url: string } | { fallback: true };

const BUILD_TIME_SHORTENER_ORIGIN = import.meta.env.VITE_SHORTENER_ORIGIN || "https://s.illo.fyi";

export function getShortenerOrigin(): string {
  return BUILD_TIME_SHORTENER_ORIGIN;
}

/** POSTs to the shortener's /api/stash. Any non-2xx response (quota, rate
 *  limit, misconfiguration) or network failure returns `{ fallback: true }`
 *  rather than throwing, so callers can silently fall back to the payload URL. */
export async function createShortLink({
  payload,
  ttlDays,
  shortenerOrigin,
}: CreateShortLinkParams): Promise<CreateShortLinkResult> {
  try {
    const res = await fetch(`${shortenerOrigin}/api/stash`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload, ttl: `${ttlDays}d` }),
    });
    if (!res.ok) return { fallback: true };
    const data = (await res.json()) as { url?: string };
    if (typeof data.url !== "string") return { fallback: true };
    return { url: data.url };
  } catch {
    return { fallback: true };
  }
}
