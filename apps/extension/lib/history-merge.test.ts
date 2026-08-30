import { beforeEach, describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { historyItem, addToHistory, type HistoryEntry } from "./history";
import { createStash, listStashes } from "./stash-store";
import { HISTORY_MERGED_KEY, migrateHistoryToShares } from "./history-merge";

beforeEach(() => {
  fakeBrowser.reset();
});

const entry = (over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id: "e1",
  url: "https://stash.illo.fyi/s/h1",
  itemCount: 3,
  truncated: false,
  createdAt: Date.now() - 1000,
  expiresAt: Date.now() + 1000,
  ...over,
});

describe("history → shares migration (F8.W5)", () => {
  it("merges a history entry into the matching record by item url", async () => {
    const rec = await createStash({
      items: [{ url: "https://stash.illo.fyi/s/h1", title: "x" }],
    });
    await addToHistory(entry());
    const n = await migrateHistoryToShares();
    expect(n).toBe(1);
    const stored = (await listStashes()).find((r) => r.id === rec.id);
    expect(stored?.shares).toHaveLength(1);
    expect(stored?.shares?.[0]).toMatchObject({ url: entry().url, itemCount: 3 });
  });

  it("creates a minimal carrier record when nothing matches", async () => {
    await addToHistory(entry());
    await migrateHistoryToShares();
    const all = await listStashes();
    const carrier = all.find((r) => r.id === `h${entry().id}`);
    expect(carrier).toBeDefined();
    expect(carrier?.items).toEqual([]);
    expect(carrier?.shares).toEqual([expect.objectContaining({ url: entry().url })]);
  });

  it("is idempotent via the historyMerged marker", async () => {
    await addToHistory(entry());
    expect(await migrateHistoryToShares()).toBe(1);
    expect(await migrateHistoryToShares()).toBe(0);
    const all = await listStashes();
    expect(all.filter((r) => r.shares?.length).length).toBe(1);
  });

  it("keeps stash-history untouched (downgrade path)", async () => {
    await addToHistory(entry());
    await migrateHistoryToShares();
    const history = await historyItem.get();
    expect(history).toHaveLength(1);
  });

  it("merges multiple entries for the same record into shares[]", async () => {
    const rec = await createStash({
      items: [{ url: "https://stash.illo.fyi/s/h1", title: "x" }],
    });
    await addToHistory(entry());
    await addToHistory(entry({ id: "e2", url: "https://stash.illo.fyi/s/h1", createdAt: Date.now() - 500 }));
    await migrateHistoryToShares();
    const stored = (await listStashes()).find((r) => r.id === rec.id);
    expect(stored?.shares).toHaveLength(2);
  });

  it("marker set upfront makes the run a no-op", async () => {
    await addToHistory(entry());
    await browser.storage.local.set({ [HISTORY_MERGED_KEY]: true });
    expect(await migrateHistoryToShares()).toBe(0);
    expect((await listStashes()).filter((r) => r.shares?.length)).toHaveLength(0);
  });
});
