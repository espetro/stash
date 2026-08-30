import { beforeEach, describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import {
  appendShareEvent,
  createStash,
  deleteStash,
  listStashes,
  materializeStashes,
  updateStash,
  type ShareEvent,
} from "./stash-store";
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
});
