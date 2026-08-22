import { describe, it, expect } from "vitest";
import {
  listStashes,
  getStash,
  createStash,
  updateStash,
  deleteStash,
  searchStashes,
} from "../lib/stash-store";

describe("stash-store", () => {
  it("createStash persists a record and listStashes returns it", async () => {
    const record = await createStash({
      title: "Reading list",
      tags: ["research"],
      items: [{ url: "https://example.com", title: "Example" }],
    });

    expect(record.id).toBeTruthy();
    expect(record.title).toBe("Reading list");
    expect(record.tags).toEqual(["research"]);
    expect(record.items).toHaveLength(1);
    expect(record.createdAt).toBe(record.updatedAt);

    const all = await listStashes();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(record.id);
  });

  it("createStash defaults tags to empty array when omitted", async () => {
    const record = await createStash({ items: [{ url: "https://example.com", title: "Ex" }] });
    expect(record.tags).toEqual([]);
    expect(record.note).toBeUndefined();
  });

  it("getStash returns undefined for unknown id", async () => {
    expect(await getStash("nope")).toBeUndefined();
  });

  it("getStash returns the matching record", async () => {
    const record = await createStash({ items: [{ url: "https://example.com", title: "Ex" }] });
    const found = await getStash(record.id);
    expect(found?.id).toBe(record.id);
  });

  it("updateStash patches fields and bumps updatedAt", async () => {
    const record = await createStash({
      title: "Old",
      items: [{ url: "https://example.com", title: "Ex" }],
    });

    const updated = await updateStash(record.id, { title: "New", tags: ["a", "b"] });
    expect(updated?.title).toBe("New");
    expect(updated?.tags).toEqual(["a", "b"]);
    expect(updated?.items).toEqual(record.items);
    expect(updated?.updatedAt).toBeGreaterThanOrEqual(record.createdAt);
  });

  it("updateStash returns undefined for unknown id", async () => {
    expect(await updateStash("nope", { title: "x" })).toBeUndefined();
  });

  it("deleteStash removes the record and returns true", async () => {
    const record = await createStash({ items: [{ url: "https://example.com", title: "Ex" }] });
    expect(await deleteStash(record.id)).toBe(true);
    expect(await getStash(record.id)).toBeUndefined();
    expect(await listStashes()).toHaveLength(0);
  });

  it("deleteStash returns false for unknown id", async () => {
    expect(await deleteStash("nope")).toBe(false);
  });

  it("searchStashes matches title, tags and note case-insensitively", async () => {
    await createStash({
      title: "Cooking recipes",
      tags: ["food"],
      note: "Weeknight dinners",
      items: [{ url: "https://example.com", title: "Ex" }],
    });
    await createStash({
      title: "Travel plans",
      tags: ["japan"],
      items: [{ url: "https://example.org", title: "Ex2" }],
    });

    expect(await searchStashes("cooking")).toHaveLength(1);
    expect(await searchStashes("JAPAN")).toHaveLength(1);
    expect(await searchStashes("dinners")).toHaveLength(1);
    expect(await searchStashes("nonexistent")).toHaveLength(0);
    expect(await searchStashes("")).toHaveLength(2);
  });
});
