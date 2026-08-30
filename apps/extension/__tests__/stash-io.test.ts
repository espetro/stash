import { describe, it, expect } from "vitest";
import { exportStashesToJSON, parseStashesImport } from "../lib/stash-io";
import type { StashRecord } from "../lib/stash-store";

const sample: StashRecord = {
  shares: undefined,
  id: "abc123",
  title: "Reading list",
  tags: ["research"],
  note: "For later",
  items: [{ url: "https://example.com", title: "Example" }],
  createdAt: 1000,
  updatedAt: 2000,
};

describe("stash-io", () => {
  it("exports stashes wrapped in the versioned envelope", () => {
    const json = exportStashesToJSON([sample]);
    const parsed = JSON.parse(json);
    expect(parsed).toEqual({ version: 2, stashes: [sample] });
  });

  it("round-trips through export then import", () => {
    const json = exportStashesToJSON([sample]);
    const imported = parseStashesImport(json);
    expect(imported).toEqual([sample]);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseStashesImport("not json")).toThrow();
  });

  it("throws when the envelope shape is wrong", () => {
    expect(() => parseStashesImport(JSON.stringify({ foo: "bar" }))).toThrow();
    expect(() => parseStashesImport(JSON.stringify({ version: 3, stashes: [] }))).toThrow();
    expect(() =>
      parseStashesImport(JSON.stringify({ version: 1, stashes: [{ id: "x" }] })),
    ).toThrow();
  });

  it("accepts stashes without optional title/note fields", () => {
    const minimal = { ...sample, title: undefined, note: undefined };
    const json = JSON.stringify({
      version: 2,
      stashes: [{ id: minimal.id, tags: minimal.tags, items: minimal.items, createdAt: minimal.createdAt, updatedAt: minimal.updatedAt }],
    });
    const imported = parseStashesImport(json);
    expect(imported).toHaveLength(1);
    expect(imported[0].title).toBeUndefined();
  });
});
