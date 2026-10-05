import { getSettings } from "./settings";

export interface CreateShortLinkParams {
  payload: string;
  ttlDays: 1 | 7 | 14 | 30;
  shortenerOrigin: string;
}

export type CreateShortLinkResult = { url: string } | { fallback: true };

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

/** Shortens a payload share link (contains `#p=`) via the shortener.
 *  Non-payload URLs or any shortener failure return `{ fallback: true }`
 *  so callers can fail open and keep the self-contained link. */
export async function shortenShareUrl(
  url: string,
  shortenerOrigin: string,
): Promise<CreateShortLinkResult> {
  const fragmentIdx = url.indexOf("#p=");
  if (fragmentIdx === -1) return { fallback: true };
  return createShortLink({
    payload: url.slice(fragmentIdx + "#p=".length),
    ttlDays: 7,
    shortenerOrigin,
  });
}

export async function revokeShortLink(shortUrl: string): Promise<void> {
  try {
    const url = new URL(shortUrl);
    const settings = await getSettings();
    const shortenerOrigin = new URL(settings.shortenerOrigin).origin;
    const match = url.pathname.match(/^\/s\/([A-Z2-7]{6})\/?$/i);
    if (url.origin !== shortenerOrigin || !match) return;
    await fetch(`${shortenerOrigin}/api/stash/${match[1]}`, { method: "DELETE" });
  } catch {}
}
