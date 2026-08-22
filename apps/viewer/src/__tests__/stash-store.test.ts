import { describe, it, expect, beforeEach } from "vitest";

// This suite runs under vitest's default "node" environment (no jsdom),
// which doesn't provide `localStorage`. Stub the minimal Storage surface
// stash-store.ts relies on.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string) {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
  clear() {
    this.store.clear();
  }
}
(globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage();

import {
  listStashes,
  getStash,
  createStash,
  updateStash,
  deleteStash,
  searchStashes,
  exportStashes,
  importStashes,
} from "../lib/stash-store";

beforeEach(() => {
  localStorage.clear();
});

describe("stash-store CRUD", () => {
  it("creates and lists a stash", () => {
    const record = createStash({
      title: "Research",
      items: [{ url: "https://a.com", title: "A" }],
    });
    expect(listStashes()).toHaveLength(1);
    expect(getStash(record.id)?.title).toBe("Research");
  });

  it("lists newest-updated first", () => {
    const first = createStash({ items: [] });
    const second = createStash({ items: [] });
    updateStash(first.id, { title: "touched" });
    expect(listStashes().map((r) => r.id)).toEqual([first.id, second.id]);
  });

  it("updates a stash and bumps updatedAt", async () => {
    const record = createStash({ title: "Old", items: [] });
    await new Promise((r) => setTimeout(r, 2));
    const updated = updateStash(record.id, { title: "New", tags: ["a"] });
    expect(updated?.title).toBe("New");
    expect(updated?.tags).toEqual(["a"]);
    expect(updated!.updatedAt).toBeGreaterThan(record.updatedAt);
  });

  it("deletes a stash", () => {
    const record = createStash({ items: [] });
    deleteStash(record.id);
    expect(getStash(record.id)).toBeUndefined();
  });

  it("searches by title, tags, and note", () => {
    createStash({ title: "Astro migration", items: [] });
    createStash({ title: "Groceries", tags: ["home"], items: [] });
    createStash({ title: "Untitled", note: "contains astro notes", items: [] });

    expect(searchStashes("astro")).toHaveLength(2);
    expect(searchStashes("home")).toHaveLength(1);
    expect(searchStashes("")).toHaveLength(3);
  });
});

describe("stash-store import/export", () => {
  it("round-trips export -> import into an empty store", () => {
    createStash({ title: "A", tags: ["x"], items: [{ url: "https://a.com", title: "A" }] });
    createStash({ title: "B", items: [] });
    const exported = exportStashes();
    expect(exported.version).toBe(1);
    expect(exported.stashes).toHaveLength(2);

    localStorage.clear();
    const result = importStashes(exported);
    expect(result.imported).toBe(2);
    expect(listStashes()).toHaveLength(2);
  });

  it("dedupes by id on import", () => {
    const record = createStash({ title: "A", items: [] });
    const exported = exportStashes();
    const result = importStashes(exported);
    expect(result.imported).toBe(0);
    expect(listStashes()).toHaveLength(1);
    expect(getStash(record.id)).toBeDefined();
  });

  it("rejects malformed input without crashing", () => {
    expect(importStashes(null).error).toBeDefined();
    expect(importStashes({}).error).toBeDefined();
    expect(importStashes({ stashes: "nope" }).error).toBeDefined();
    expect(listStashes()).toHaveLength(0);
  });

  it("skips invalid records within an otherwise valid array", () => {
    const result = importStashes({
      version: 1,
      stashes: [{ id: "1", tags: [], items: [], createdAt: 1, updatedAt: 1 }, { garbage: true }],
    });
    expect(result.imported).toBe(1);
    expect(listStashes()).toHaveLength(1);
  });
});
