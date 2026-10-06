/**
 * Mirror storage wiring (F13 W2).
 *
 * Provider decision (ADR, F13 W5): Deno Deploy is the primary mirror host.
 * Deno KV gives native TTL semantics via `expireIn` on keys, which maps
 * onto the relay's hard requirement that short links expire (7d ceiling) —
 * links without expiry would leak. unstorage ships a Deno KV driver; the
 * redis / vercel-kv drivers cover alternative providers with TTL support.
 *
 * On Node (tests, self-hosting) the default is in-memory, which has NO
 * native TTL: entries carry a stored expiresAt and server-core already
 * refuses to serve expired entries; reclamation happens on read.
 */
import { createStorage, type Storage } from "unstorage";
import memoryDriver from "unstorage/drivers/memory";

const KV_PREFIX = "stash:";

/** Always-usable sync path: memory storage (tests, local dev, stateless
 *  previews). Production deploys MUST use resolveStorageAsync. */
export function memoryStorage(): Storage {
  return createStorage({ driver: memoryDriver() });
}

/** Async variant deploy entrypoints should use (allows ESM-only drivers). */
export async function resolveStorageAsync(
  env: Record<string, string | undefined> = {},
): Promise<Storage> {
  const backend = env.MIRROR_STORAGE ?? "memory";

  switch (backend) {
    case "deno-kv": {
      const driver = (await import("unstorage/drivers/deno-kv")).default;
      return createStorage({ driver: driver({ base: KV_PREFIX }) });
    }
    case "redis": {
      const driver = (await import("unstorage/drivers/redis")).default;
      return createStorage({ driver: driver({ base: KV_PREFIX, ttl: 7 * 24 * 3600 }) });
    }
    case "vercel-kv": {
      const driver = (await import("unstorage/drivers/vercel-kv")).default;
      return createStorage({ driver: driver({ base: KV_PREFIX }) });
    }
    case "memory":
    default:
      return memoryStorage();
  }
}
