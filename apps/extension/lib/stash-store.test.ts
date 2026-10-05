import { beforeEach, describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import {
  appendShareEvent,
  createStash,
  deleteStash,
  importStashes,
  listStashes,
  materializeStashes,
  updateStash,
  type ShareEvent,
  type StashRecord,
} from "./stash-store";
import { addToHistory, historyItem } from "./history";
import { getProfileId, resetProfileId } from "./sync/profile";
import { getOutbox } from "./sync/outbox";

beforeEach(() => {
  fakeBrowser.reset();
  resetProfileId();
});

const share = (over: Partial<ShareEvent> = {}): ShareEvent => ({
  url: "https://stash.illo.fyi/s/abc",
  itemCount: 2,
  truncated: false,
  createdAt: 1000,
  expiresAt: 2000,
  ...over,
});

const importedRecord = (): StashRecord => ({
  id: "imported-record",
  title: "Research trip",
  tags: ["travel"],
  note: "Collected links",
  items: [{ url: "https://example.com", title: "Example" }],
  shares: [share()],
  createdAt: 123,
  updatedAt: 456,
});

describe("importStashes", () => {
  it("restores the same id, creation time, and shares after deletion", async () => {
    const record = importedRecord();

    expect(await importStashes([record])).toEqual([record]);
    expect(await deleteStash(record.id)).toBe(true);

    const restored = await importStashes([record]);

    expect(restored).toEqual([record]);
    expect(restored[0]).toMatchObject({
      id: record.id,
      createdAt: record.createdAt,
      shares: record.shares,
    });
    expect(await listStashes()).toEqual([record]);
  });

  it("does not overwrite or re-import an existing id", async () => {
    const record = importedRecord();
    await importStashes([record]);
    const outboxLength = (await getOutbox()).length;

    expect(await importStashes([{ ...record, title: "Changed" }])).toEqual([]);
    expect(await listStashes()).toEqual([record]);
    expect(await getOutbox()).toHaveLength(outboxLength);
  });

  it("records each added stash in the outbox", async () => {
    const record = importedRecord();

    await importStashes([record]);

    const outbox = await getOutbox();
    expect(outbox).toContainEqual(
      expect.objectContaining({
        op: "create",
        record: expect.objectContaining({ id: record.id }),
      }),
    );
  });
});

describe("shares[] (F8)", () => {
  it("createStash emits shares: []", async () => {
    const rec = await createStash({ items: [{ url: "https://a", title: "a" }] });
    expect(rec.shares).toEqual([]);
  });

  it("updateStash preserves shares on a partial patch", async () => {
    const rec = await createStash({ items: [] });
    await appendShareEvent(rec.id, share());
    const updated = await updateStash(rec.id, { title: "t" });
    expect(updated?.shares).toHaveLength(1);
    expect(updated?.title).toBe("t");
  });

  it("appendShareEvent appends and persists", async () => {
    const rec = await createStash({ items: [] });
    await appendShareEvent(rec.id, share({ url: "https://x/1" }));
    await appendShareEvent(rec.id, share({ url: "https://x/2", createdAt: 2 }));
    const stored = (await listStashes()).find((s) => s.id === rec.id);
    expect(stored?.shares?.map((s) => s.url)).toEqual(["https://x/1", "https://x/2"]);
  });

  it("appendShareEvent upgrades a pre F8 record without shares", async () => {
    await materializeStashes((stashes) => [
      ...stashes,
      { id: "old", tags: [], items: [], createdAt: 1, updatedAt: 1 },
    ]);
    const updated = await appendShareEvent("old", share());
    expect(updated?.shares).toHaveLength(1);
  });

  it("appendShareEvent on a missing record is a no-op returning undefined", async () => {
    expect(await appendShareEvent("nope", share())).toBeUndefined();
  });

  it("appendShareEvent records an outbox update like a user write", async () => {
    const rec = await createStash({ items: [] });
    const origin = await getProfileId();
    await appendShareEvent(rec.id, share());
    const box = await getOutbox();
    expect(box[box.length - 1]?.op).toBe("update");
    expect(box[box.length - 1]?.origin).toBe(origin);
    expect(box[box.length - 1]?.record?.shares).toHaveLength(1);
  });

  it("deleteStash keeps working on records carrying shares", async () => {
    const rec = await createStash({ items: [] });
    await appendShareEvent(rec.id, share());
    expect(await deleteStash(rec.id)).toBe(true);
    expect(await listStashes()).toHaveLength(0);
  });

  it("deleteStash removes the deleted stash's share URLs from history", async () => {
    const rec = await createStash({ items: [] });
    const event = share({ url: "https://stash.illo.fyi/s/shared" });
    await appendShareEvent(rec.id, event);
    await addToHistory({
      id: "matching",
      url: event.url,
      itemCount: event.itemCount,
      truncated: event.truncated,
      createdAt: event.createdAt,
      expiresAt: event.expiresAt,
    });
    await addToHistory({
      id: "other",
      url: "https://stash.illo.fyi/s/other",
      itemCount: 1,
      truncated: false,
      createdAt: Date.now(),
      expiresAt: Date.now() + 1000,
    });

    await deleteStash(rec.id);

    expect((await historyItem.get())?.map((entry) => entry.id)).toEqual(["other"]);
  });
});
