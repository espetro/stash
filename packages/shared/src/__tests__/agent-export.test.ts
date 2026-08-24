import { describe, it, expect } from "vitest";
import {
  MAX_STASHES,
  isStashExport,
  toStashExport,
  type StashRecordLike,
  type StashExport,
} from "../agent-export";

const baseRecord: StashRecordLike = {
  id: "rec-1",
  title: "Example",
  tags: ["a", "b"],
  note: "hello",
  items: [
    { url: "https://example.com", title: "Example" },
    { url: "http://example.org", title: "Org" },
  ],
  createdAt: 1700000000000,
  updatedAt: 1700000001000,
};

describe("toStashExport", () => {
  it("normalizes undefined optional fields to null", () => {
    const record: StashRecordLike = {
      id: "rec-1",
      // title and note intentionally omitted
      tags: [],
      items: [{ url: "https://example.com", title: "Example" }],
      createdAt: 1,
      updatedAt: 2,
    };
    const out = toStashExport([record], "viewer-local");
    expect(out.stashes).toHaveLength(1);
    expect(out.stashes[0].title).toBeNull();
    expect(out.stashes[0].note).toBeNull();
  });

  it("preserves source as 'extension'", () => {
    const out = toStashExport([baseRecord], "extension");
    expect(out.source).toBe("extension");
    expect(out.version).toBe(1);
  });

  it("preserves source as 'viewer-local'", () => {
    const out = toStashExport([baseRecord], "viewer-local");
    expect(out.source).toBe("viewer-local");
  });

  it("filters out records whose items contain non-http(s) URLs", () => {
    const ok: StashRecordLike = {
      ...baseRecord,
      id: "ok",
      items: [{ url: "https://example.com", title: "Example" }],
    };
    const bad: StashRecordLike = {
      ...baseRecord,
      id: "bad",
      items: [
        { url: "javascript:alert(1)", title: "xss" },
        { url: "https://example.com", title: "Example" },
      ],
    };
    const out = toStashExport([ok, bad], "extension");
    expect(out.stashes.map((s) => s.id)).toEqual(["ok"]);
  });

  it("throws when records exceed MAX_STASHES", () => {
    const records: StashRecordLike[] = Array.from({ length: MAX_STASHES + 1 }, (_, i) => ({
      ...baseRecord,
      id: `rec-${i}`,
    }));
    expect(() => toStashExport(records, "extension")).toThrow(/too many records/);
  });

  it("accepts exactly MAX_STASHES records", () => {
    const records: StashRecordLike[] = Array.from({ length: MAX_STASHES }, (_, i) => ({
      ...baseRecord,
      id: `rec-${i}`,
    }));
    const out = toStashExport(records, "extension");
    expect(out.stashes).toHaveLength(MAX_STASHES);
  });
});

describe("isStashExport", () => {
  it("accepts canonical output", () => {
    const out = toStashExport([baseRecord], "extension");
    expect(isStashExport(out)).toBe(true);
  });

  it("rejects wrong version", () => {
    const out: unknown = { ...toStashExport([baseRecord], "extension"), version: 2 };
    expect(isStashExport(out)).toBe(false);
  });

  it("rejects unknown source", () => {
    const out: unknown = { ...toStashExport([baseRecord], "extension"), source: "unknown" };
    expect(isStashExport(out)).toBe(false);
  });

  it("rejects missing fields", () => {
    const partial = { version: 1, source: "extension", stashes: [] };
    expect(isStashExport(partial)).toBe(true); // empty stashes array is valid
    const noStashes = { version: 1, source: "extension" };
    expect(isStashExport(noStashes)).toBe(false);
  });

  it("rejects non-array stashes", () => {
    const out: unknown = {
      version: 1,
      source: "extension",
      stashes: "not-array",
    };
    expect(isStashExport(out)).toBe(false);
  });

  it("rejects oversized payloads", () => {
    const stashes: unknown[] = Array.from({ length: MAX_STASHES + 1 }, () => ({
      id: "r",
      title: null,
      tags: [],
      note: null,
      items: [],
      createdAt: 0,
      updatedAt: 0,
    }));
    expect(
      isStashExport({ version: 1, source: "extension", stashes }),
    ).toBe(false);
  });

  it("rejects items with non-http(s) URLs", () => {
    const out: unknown = {
      version: 1,
      source: "extension",
      stashes: [
        {
          id: "r",
          title: null,
          tags: [],
          note: null,
          items: [{ url: "ftp://example.com", title: "x" }],
          createdAt: 0,
          updatedAt: 0,
        },
      ],
    };
    expect(isStashExport(out)).toBe(false);
  });

  it("rejects non-object payloads", () => {
    expect(isStashExport(null)).toBe(false);
    expect(isStashExport(undefined)).toBe(false);
    expect(isStashExport("string")).toBe(false);
    expect(isStashExport(42)).toBe(false);
    expect(isStashExport([])).toBe(false);
  });
});

describe("round-trip", () => {
  it("JSON.parse(JSON.stringify(toStashExport(...))) is a valid StashExport", () => {
    const original = toStashExport([baseRecord], "extension");
    const json = JSON.parse(JSON.stringify(original)) as unknown;
    expect(isStashExport(json)).toBe(true);
    const reparsed = json as StashExport;
    expect(reparsed.version).toBe(1);
    expect(reparsed.source).toBe("extension");
    expect(reparsed.stashes).toHaveLength(1);
    expect(reparsed.stashes[0].id).toBe("rec-1");
  });

  it("round-trips an empty stashes list with viewer-local source", () => {
    const original = toStashExport([], "viewer-local");
    const json = JSON.parse(JSON.stringify(original)) as unknown;
    expect(isStashExport(json)).toBe(true);
  });
});
