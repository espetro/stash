import { beforeEach, describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { encodeTabsToShareUrl, EXPIRY_HOURS_MAP } from "@stash/codec";
import { getBrotliFunctions } from "@stash/shared";
import { historyItem, addToHistory, type HistoryEntry } from "./history";
import { createStash, listStashes } from "./stash-store";
import {
  HISTORY_CARRIERS_REPAIRED_KEY,
  HISTORY_MERGED_KEY,
  migrateHistoryToShares,
  repairCarrierRecords,
} from "./history-merge";

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

async function encodedEntry(over: Partial<HistoryEntry> = {}): Promise<HistoryEntry> {
  const result = await encodeTabsToShareUrl(
    [
      { url: "https://example.com", title: "Example" },
      { url: "Remember to pack a camera", title: "Note", kind: "note" },
      { url: "https://maps.example", title: "Map" },
    ],
    await getBrotliFunctions(),
    EXPIRY_HOURS_MAP.never,
    "https://stash.illo.fyi",
    "Research trip",
    ["travel"],
    "Book the train",
  );
  return entry({
    url: result.url,
    itemCount: 3,
    ...over,
  });
}

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

  it("decodes an unmatched history link into a Recent stash", async () => {
    const historyEntry = await encodedEntry();
    await addToHistory(historyEntry);

    await migrateHistoryToShares();

    const record = (await listStashes()).find((stash) => stash.id === `h${historyEntry.id}`);
    expect(record).toMatchObject({
      title: "Research trip",
      tags: ["travel"],
      note: "Book the train",
      kept: false,
      items: [
        { url: "https://example.com", title: "Example" },
        { url: "https://maps.example", title: "Map" },
      ],
    });
  });

  it("repairs an existing empty carrier once", async () => {
    const historyEntry = await encodedEntry();
    const carrier = {
      id: "hcarrier",
      items: [],
      shares: [
        {
          url: historyEntry.url,
          itemCount: historyEntry.itemCount,
          truncated: historyEntry.truncated,
          createdAt: historyEntry.createdAt,
          expiresAt: historyEntry.expiresAt,
        },
      ],
      createdAt: historyEntry.createdAt,
      updatedAt: historyEntry.createdAt,
    };
    await browser.storage.local.set({ "stash-records": [carrier] });

    expect(await repairCarrierRecords()).toBe(1);
    expect(await repairCarrierRecords()).toBe(0);
    expect(await browser.storage.local.get(HISTORY_CARRIERS_REPAIRED_KEY)).toEqual({
      [HISTORY_CARRIERS_REPAIRED_KEY]: true,
    });
    expect((await listStashes())[0]).toMatchObject({
      id: "hcarrier",
      title: "Research trip",
      kept: false,
      items: [
        { url: "https://example.com", title: "Example" },
        { url: "https://maps.example", title: "Map" },
      ],
    });
  });

  it("leaves an undecodable carrier untouched", async () => {
    const carrier = {
      id: "hlegacy",
      title: "Legacy title",
      tags: ["preserve"],
      note: "preserve this",
      items: [],
      shares: [
        {
          url: "https://stash.illo.fyi/s/not-a-payload",
          itemCount: 1,
          truncated: false,
          createdAt: 1,
          expiresAt: 2,
        },
      ],
      createdAt: 1,
      updatedAt: 1,
    };
    await browser.storage.local.set({ "stash-records": [carrier] });

    expect(await repairCarrierRecords()).toBe(0);
    expect(await listStashes()).toEqual([carrier]);
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
    await addToHistory(
      entry({ id: "e2", url: "https://stash.illo.fyi/s/h1", createdAt: Date.now() - 500 }),
    );
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
