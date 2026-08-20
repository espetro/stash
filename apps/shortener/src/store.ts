import { createStorage, type Storage } from "unstorage";
import cloudflareKVBindingDriver from "unstorage/drivers/cloudflare-kv-binding";
import memoryDriver from "unstorage/drivers/memory";
import type { DecodedPayload } from "@stash/codec";

export interface Env {
  STASH_KV?: KVNamespace;
  /** Test seam: inject an in-memory storage instead of the KV binding */
  TEST_STORAGE?: Storage;
}

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

export interface StoredEntry {
  /** The encoded payload string (prefix + body), exactly as accepted on write */
  p: string;
  /** Creation time (Unix seconds) */
  c: number;
  /** Expiry time (Unix seconds) */
  e: number;
  /** Original decoded metadata for listing/debug */
  t?: string;
}

const KV_PREFIX = "stash:";

function storageFor(env: Env): Storage {
  if (env.TEST_STORAGE) return env.TEST_STORAGE;
  if (!env.STASH_KV) throw new Error("STASH_KV binding missing");
  return createStorage({
    driver: cloudflareKVBindingDriver({ binding: env.STASH_KV, base: KV_PREFIX }),
  });
}

export async function createStash(
  env: Env,
  payload: string,
  ttl: ServerTtl,
): Promise<{ id: string; entry: StoredEntry }> {
  const storage = storageFor(env);
  const now = Math.floor(Date.now() / 1000);
  const ttlSeconds = SERVER_TTL_HOURS[ttl] * 3600;
  const expiry = now + ttlSeconds;

  // Retry on the (unlikely) ID collision
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = randomId();
    if (await storage.hasItem(id)) continue;
    const entry: StoredEntry = { p: payload, c: now, e: expiry };
    await storage.setItem(id, JSON.stringify(entry), { ttl: ttlSeconds });
    return { id, entry };
  }
  throw new Error("id-collision");
}

export async function getStash(env: Env, id: string): Promise<StoredEntry | null> {
  const storage = storageFor(env);
  const raw = await storage.getItem<StoredEntry | string>(id);
  if (raw === null || raw === undefined) return null;
  // cloudflare-kv-binding returns the stored string; memory driver returns the object
  return typeof raw === "string" ? (JSON.parse(raw) as StoredEntry) : raw;
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

export function jsonHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    ...extra,
  };
}

export { memoryDriver };
