import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import {
  createStash,
  deleteStash,
  listStashes,
  materializeStashes,
  updateStash,
  type StashRecord,
} from "../stash-store";
import { getOutbox } from "./outbox";
import { getProfileId, resetProfileId } from "./profile";

beforeEach(() => {
  fakeBrowser.reset();
  resetProfileId();
});

describe("profileId (W1 peer identity)", () => {
  it("generates once and persists across simulated worker restarts", async () => {
    const a = await getProfileId();
    const b = await getProfileId();
    expect(a).toBe(b);
    const stored = await browser.storage.local.get("sync-profile-id");
    expect(stored["sync-profile-id"]).toBe(a);
  });
});

describe("outbox interception (W2)", () => {
  it("records create/update/delete user writes", async () => {
    const created = await createStash({ title: "t", items: [{ url: "https://a", title: "a" }] });
    await updateStash(created.id, { title: "t2" });
    await deleteStash(created.id);
    const box = await getOutbox();
    expect(box.map((c) => c.op)).toEqual(["create", "update", "delete"]);
    const origin = await getProfileId();
    expect(box.every((c) => c.origin === origin)).toBe(true);
  });

  it("does NOT record materialized (daemon-origin) writes — no echo loop", async () => {
    await materializeStashes((stashes) => [
      ...stashes,
      { id: "d1", tags: [], items: [], createdAt: 1, updatedAt: 1 } as StashRecord,
    ]);
    const box = await getOutbox();
    expect(box).toHaveLength(0);
    expect((await listStashes()).map((s) => s.id)).toContain("d1");
  });

  it("materialize upsert + delete by id (W3)", async () => {
    await materializeStashes((stashes) => [
      ...stashes,
      { id: "d1", tags: ["x"], items: [], createdAt: 1, updatedAt: 1 } as StashRecord,
    ]);
    await materializeStashes((stashes) =>
      stashes.map((s) => (s.id === "d1" ? { ...s, tags: ["y"], updatedAt: 2 } : s)),
    );
    expect((await listStashes()).find((s) => s.id === "d1")?.tags).toEqual(["y"]);
    await materializeStashes((stashes) => stashes.filter((s) => s.id !== "d1"));
    expect(await listStashes()).toHaveLength(0);
    expect(await getOutbox()).toHaveLength(0);
  });

  it("a local write and a materialize in the same tick do not clobber", async () => {
    await createStash({ title: "user", items: [{ url: "https://u", title: "u" }] });
    const [materializeDone] = await Promise.all([
      materializeStashes((stashes) => [
        ...stashes,
        { id: "d1", tags: [], items: [], createdAt: 1, updatedAt: 1 } as StashRecord,
      ]),
      createStash({ title: "user2", items: [{ url: "https://u2", title: "u2" }] }),
    ]);
    expect(materializeDone).toBeUndefined();
    const ids = (await listStashes()).map((s) => s.title).sort();
    expect(ids).toEqual(["user", "user2"]);
  });

  it("seed path never empties the local store (§11.3)", async () => {
    await createStash({ title: "keep", items: [{ url: "https://k", title: "k" }] });
    const before = await listStashes();
    await materializeStashes((stashes) => stashes); // identity seed
    expect(await listStashes()).toEqual(before);
  });
});
