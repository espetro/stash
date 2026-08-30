import { generateShareKey, encryptForRelay } from "@stash/shared";

export interface CreateShortLinkParams {
  /** The encoded payload string (the `#p=` value), NOT yet encrypted. */
  payload: string;
  ttlDays: 1 | 7 | 14 | 30;
  shortenerOrigin: string;
}

export type CreateShortLinkResult = { url: string } | { fallback: true };

/** Zero-trust relay upload (F14): generates a per-share 128-bit key,
 *  encrypts the encoded payload with AES-256-GCM client-side, and POSTs
 *  only the ciphertext to the shortener's /api/stash. The key lives
 *  exclusively in the returned URL fragment (`/s/<id>#<key>`) and never
 *  reaches the server. Any non-2xx response (quota, rate limit,
 *  misconfiguration) or network failure returns `{ fallback: true }`
 *  rather than throwing, so callers can silently fall back to the
 *  self-contained payload URL. */
export async function createShortLink({
  payload,
  ttlDays,
  shortenerOrigin,
}: CreateShortLinkParams): Promise<CreateShortLinkResult> {
  try {
    const key = generateShareKey();
    const ciphertext = await encryptForRelay(payload, key);
    const res = await fetch(`${shortenerOrigin}/api/stash`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ciphertext, ttl: `${ttlDays}d` }),
    });
    if (!res.ok) return { fallback: true };
    const data = (await res.json()) as { url?: string };
    if (typeof data.url !== "string") return { fallback: true };
    // The share URL gets the fragment key appended; the server never sees it.
    return { url: `${data.url}#${key}` };
  } catch {
    return { fallback: true };
  }
}

/** Shortens a payload share link (contains `#p=`) via the shortener,
 *  encrypting client-side first. Non-payload URLs or any shortener
 *  failure return `{ fallback: true }` so callers can fail open and keep
 *  the self-contained link. */
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
