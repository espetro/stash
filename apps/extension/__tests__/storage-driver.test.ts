import { describe, it, expect } from "vitest";
import { createStorage } from "unstorage";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { browserStorageDriver } from "../lib/server/storage-driver";

function makeStorage() {
  return createStorage({
    driver: browserStorageDriver({ area: fakeBrowser.storage.local as never }),
  });
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

describe("browserStorageDriver", () => {
  it("setItem/getItem roundtrip", async () => {
    const storage = makeStorage();
    await storage.setItem("k", "hello");
    expect(await storage.getItem("k")).toBe("hello");
  });

  it("hasItem true/false", async () => {
    const storage = makeStorage();
    await storage.setItem("k", "v");
    expect(await storage.hasItem("k")).toBe(true);
    expect(await storage.hasItem("missing")).toBe(false);
  });

  it("removeItem removes the entry", async () => {
    const storage = makeStorage();
    await storage.setItem("k", "v");
    await storage.removeItem("k");
    expect(await storage.getItem("k")).toBeNull();
    expect(await storage.hasItem("k")).toBe(false);
  });

  it("getKeys lists stored keys (with base filter)", async () => {
    const storage = makeStorage();
    await storage.setItem("a:1", "v");
    await storage.setItem("a:2", "v");
    await storage.setItem("b:1", "v");
    expect((await storage.getKeys()).sort()).toEqual(["a:1", "a:2", "b:1"]);
    expect((await storage.getKeys("a:")).sort()).toEqual(["a:1", "a:2"]);
  });

  it("drops expired entries on read and removes them", async () => {
    const area = fakeBrowser.storage.local as unknown as {
      get(keys: string[] | null): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(keys: string[]): Promise<void>;
    };
    await area.set({ expired: { value: "old", e: nowSec() - 10 } });
    const storage = makeStorage();
    expect(await storage.getItem("expired")).toBeNull();
    // key was removed from the area
    expect((await area.get(["expired"]))["expired"]).toBeUndefined();
  });

  it("mirrors payload `e` as the entry TTL", async () => {
    const storage = makeStorage();
    const past = nowSec() - 5;
    await storage.setItem("k", JSON.stringify({ p: "x", c: "y", e: past }));
    expect(await storage.getItem("k")).toBeNull();
  });

  it("caps entries at 500 on write, evicting oldest first", async () => {
    const area = fakeBrowser.storage.local as unknown as {
      get(keys: string[] | null): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(keys: string[]): Promise<void>;
    };
    const items: Record<string, { value: string; e: number }> = {};
    const base = nowSec() + 10_000;
    for (let i = 0; i < 501; i++) {
      // increasing e = later write; lowest e are evicted first
      items[`k${String(i).padStart(3, "0")}`] = { value: `v${i}`, e: base + i };
    }
    await area.set(items);

    const storage = makeStorage();
    await storage.setItem("fresh", "fresh-value"); // triggers evict()
    // 501 existing + 1 new = 502 live; cap drops 2 (k000, k001)
    const keys = await storage.getKeys();
    expect(keys.length).toBeLessThanOrEqual(500);
    expect(keys).not.toContain("k000");
    expect(keys).not.toContain("k001");
    expect(keys).toContain("fresh");
    expect(keys).toContain("k500");
    expect(await storage.getItem("fresh")).toBe("fresh-value");
  });
});
