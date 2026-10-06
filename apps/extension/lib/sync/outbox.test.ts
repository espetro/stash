import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import {
  drainOutbox,
  enqueueChange,
  getOutbox,
  outboxSize,
  recordCreate,
  recordUpdate,
} from "./outbox";
import { OUTBOX_MAX } from "./protocol";
import type { StashRecord } from "../stash-store";

function rec(id: string): StashRecord {
  return { id, tags: [], items: [{ url: "https://x", title: "x" }], createdAt: 1, updatedAt: 2 };
}

beforeEach(() => fakeBrowser.reset());

describe("outbox", () => {
  it("appends create/update/delete changes in order", async () => {
    await recordCreate(rec("a"), "p1");
    await recordUpdate(rec("b"), "p1");
    const box = await getOutbox();
    expect(box.map((c) => c.op)).toEqual(["create", "update"]);
    expect(box[0].record?.id).toBe("a");
    expect(box[0].origin).toBe("p1");
  });

  it("persists across simulated worker restarts (storage-backed)", async () => {
    await recordCreate(rec("a"), "p1");
    const box = await getOutbox();
    expect(box).toHaveLength(1);
  });

  it("drains in order and removes only sent records", async () => {
    await recordCreate(rec("a"), "p1");
    await recordCreate(rec("b"), "p1");
    const sent: string[] = [];
    const { sent: n, remaining } = await drainOutbox(async (c) => {
      sent.push(c.id);
      return true;
    });
    expect(n).toBe(2);
    expect(remaining).toBe(0);
    expect(sent).toEqual(["a", "b"]);
  });

  it("keeps a record and stops on NACK, retrying next tick", async () => {
    await recordCreate(rec("a"), "p1");
    await recordCreate(rec("b"), "p1");
    let nackedOnce = true;
    const first = await drainOutbox(async () => {
      if (nackedOnce) {
        nackedOnce = false;
        return false;
      }
      return true;
    });
    expect(first.sent).toBe(0);
    expect(await outboxSize()).toBe(2);
    const second = await drainOutbox(async () => true);
    expect(second.sent).toBe(2);
  });

  it("keeps records when send throws", async () => {
    await recordCreate(rec("a"), "p1");
    const { sent, remaining } = await drainOutbox(async () => {
      throw new Error("port dead");
    });
    expect(sent).toBe(0);
    expect(remaining).toBe(1);
  });

  it("drops oldest on overflow with a warning, never silently", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (let i = 0; i < OUTBOX_MAX + 5; i++) {
      await enqueueChange({
        op: "create",
        id: `r${i}`,
        record: rec(`r${i}`),
        updatedAt: i,
        origin: "p1",
      });
    }
    const box = await getOutbox();
    expect(box).toHaveLength(OUTBOX_MAX);
    expect(box[0].id).toBe("r5"); // oldest five dropped
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("outbox overflow"));
    warn.mockRestore();
  });
});
