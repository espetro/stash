import { defineDriver } from "unstorage";

/**
 * Structural type over browser.storage.local (works with the real API and
 * wxt's fakeBrowser in tests).
 */
export interface StorageArea {
  get(keys: string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

const MAX_ENTRIES = 500;

interface Wrapped {
  value: string;
  /** Expiry (Unix seconds); 0 = no expiry */
  e: number;
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function isWrapped(v: unknown): v is Wrapped {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as Wrapped).value === "string" &&
    typeof (v as Wrapped).e === "number"
  );
}

/**
 * unstorage driver over browser.storage.local. browser.storage has no native
 * TTL, so entries are stored as `{ value, e }` and expired ones are dropped on
 * read. Writes evict expired entries and enforce a cap (oldest first).
 */
export const browserStorageDriver = defineDriver((opts: { area: StorageArea }) => {
  const area = opts.area;

  async function scan(): Promise<Map<string, Wrapped>> {
    const all = await area.get(null);
    const out = new Map<string, Wrapped>();
    for (const [k, v] of Object.entries(all)) {
      if (isWrapped(v)) out.set(k, v);
    }
    return out;
  }

  async function evict(): Promise<void> {
    const entries = [...(await scan()).entries()];
    const now = nowSec();
    const expired = entries.filter(([, w]) => w.e > 0 && w.e <= now).map(([k]) => k);
    const live = entries.filter(([, w]) => !(w.e > 0 && w.e <= now));
    if (live.length >= MAX_ENTRIES) {
      // drop oldest by expiry first (closest to expiring = oldest write)
      live.sort((a, b) => a[1].e - b[1].e);
      const excess = live.slice(0, live.length - MAX_ENTRIES + 1).map(([k]) => k);
      expired.push(...excess);
    }
    if (expired.length > 0) await area.remove(expired);
  }

  return {
    async getItem(key) {
      const found = await area.get([key]);
      const v = found[key];
      if (!isWrapped(v)) return null;
      if (v.e > 0 && v.e <= nowSec()) {
        await area.remove([key]);
        return null;
      }
      return v.value;
    },
    async setItem(key, value) {
      await evict();
      const stored = `${value}`;
      // Stash entries ({p,c,e}) already carry their own expiry in `e`; mirror
      // it so the driver enforces TTL even without unstorage ttl support.
      let e = 0;
      try {
        const parsed = JSON.parse(stored) as { e?: number };
        if (typeof parsed.e === "number") e = parsed.e;
      } catch {
        // non-JSON payload: no TTL
      }
      const w: Wrapped = { value: stored, e };
      await area.set({ [key]: w });
    },
    async hasItem(key) {
      const found = await area.get([key]);
      return isWrapped(found[key]);
    },
    async removeItem(key) {
      await area.remove([key]);
    },
    async getKeys(base) {
      const keys = [...(await scan()).keys()];
      return base ? keys.filter((k) => k.startsWith(base)) : keys;
    },
    async clear() {
      const keys = [...(await scan()).keys()];
      await area.remove(keys);
    },
    async dispose() {},
  };
});
