import type { Storage } from "unstorage";
import type { DecodedPayload } from "@stash/codec";

/** Server-stored stashes enforce one of these TTLs; `never` only exists in
 *  URL-payload mode. */
export const SERVER_TTL_HOURS = {
  "1d": 24,
  "7d": 168,
  "14d": 336,
  "30d": 720,
} as const;

export type ServerTtl = keyof typeof SERVER_TTL_HOURS;

export function isServerTtl(v: string): v is ServerTtl {
  return v in SERVER_TTL_HOURS;
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; // base32 (RFC 4648, no padding)

/** 6-char base32 ID = 30 bits ≈ 1e9; collision-checked against storage. */
function randomId(len = 6): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % 32];
  return out;
}

/** Server-stored stash entries. Zero-trust relay (F14): `p` is the
 *  client-encrypted ciphertext (base64url, IV-prefixed AES-256-GCM) — the
 *  server never sees plaintext payloads or key material. `enc` marks
 *  entries whose `p` is ciphertext, so decode paths can fail closed
 *  instead of attempting a server-side decode that cannot succeed. */
export interface StoredEntry {
  /** Encoded payload or ciphertext, exactly as accepted on write */
  p: string;
  /** Creation time (Unix seconds) */
  c: number;
  /** Expiry time (Unix seconds) */
  e: number;
  /** True when `p` is ciphertext (zero-trust relay entry) */
  enc?: true;
}

export async function createStash(
  storage: Storage,
  payload: string,
  ttl: ServerTtl,
  options: { encrypted?: boolean } = {},
): Promise<{ id: string; entry: StoredEntry }> {
  const now = Math.floor(Date.now() / 1000);
  const ttlSeconds = SERVER_TTL_HOURS[ttl] * 3600;
  const expiry = now + ttlSeconds;

  // Retry on the (unlikely) ID collision
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = randomId();
    if (await storage.hasItem(id)) continue;
    const entry: StoredEntry = {
      p: payload,
      c: now,
      e: expiry,
      ...(options.encrypted ? { enc: true as const } : {}),
    };
    await storage.setItem(id, JSON.stringify(entry), { ttl: ttlSeconds });
    return { id, entry };
  }
  throw new Error("id-collision");
}

export async function getStash(storage: Storage, id: string): Promise<StoredEntry | null> {
  const raw = await storage.getItem<StoredEntry | string>(id);
  if (raw === null || raw === undefined) return null;
  // some drivers return the stored string, others the parsed object
  return typeof raw === "string" ? (JSON.parse(raw) as StoredEntry) : raw;
}

/** Explicitly remove a stored stash (DELETE /api/stash/:id). Returns true
 *  when an entry was removed, false when the id was already absent. */
export async function removeItem(storage: Storage, id: string): Promise<boolean> {
  const existed = await storage.hasItem(id);
  if (existed) await storage.removeItem(id);
  return existed;
}

export function cacheControlFor(entry: StoredEntry): string {
  // Immutable content + TTL: edge-cacheable for the entry's remaining lifetime
  const remaining = entry.e - Math.floor(Date.now() / 1000);
  if (remaining <= 0) return "public, max-age=60";
  return `public, max-age=${Math.min(remaining, 86400)}, immutable`;
}

export function isExpired(entry: StoredEntry): boolean {
  return Math.floor(Date.now() / 1000) > entry.e;
}

/** Render decoded payload as markdown (same shape as the viewer /md route). */
export function renderMarkdown(decoded: DecodedPayload): string {
  const lines = decoded.items.map(([url, title]) => {
    const escaped = title.replace(/]/g, "\\]").replace(/\[/g, "\\[");
    return `[${escaped}](${url})`;
  });
  if (decoded.title) return `# ${decoded.title}\n\n${lines.join("\n")}`;
  return lines.join("\n");
}

/**
 * Render decoded payload as a plain URL list (one URL per line). Notes
 * (kind=note) are skipped because they have no canonical URL — their
 * text is intentionally not exposed in this format.
 */
export function renderPlainUrlList(decoded: DecodedPayload): string {
  return decoded.items
    .filter(([, , kind]) => kind !== "note")
    .map(([url]) => url)
    .join("\n");
}

export function jsonHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    ...extra,
  };
}
