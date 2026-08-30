import { describe, expect, it } from "vitest";
import { exportStashesToJSON, parseStashesImport } from "./stash-io";
import type { StashRecord } from "./stash-store";

const record = (over: Partial<StashRecord> = {}): StashRecord => ({
  id: "r1",
  tags: ["a"],
  items: [{ url: "https://a", title: "a" }],
  shares: [],
  createdAt: 1,
  updatedAt: 2,
  ...over,
});

describe("stash export (F8 v2)", () => {
  it("exports version 2 and round-trips unchanged", () => {
    const stashes = [
      record({
        shares: [
          { url: "https://s/1", itemCount: 1, truncated: false, createdAt: 5, expiresAt: 6 },
        ],
      }),
    ];
    const json = exportStashesToJSON(stashes);
    expect(JSON.parse(json).version).toBe(2);
    expect(parseStashesImport(json)).toEqual(stashes);
  });

  it("imports a v1 payload via the shim (shares left absent)", () => {
    const v1 = {
      version: 1,
      stashes: [{ id: "r1", tags: [], items: [], createdAt: 1, updatedAt: 1 }],
    };
    const imported = parseStashesImport(JSON.stringify(v1));
    expect(imported).toEqual([{ id: "r1", tags: [], items: [], createdAt: 1, updatedAt: 1 }]);
    expect("shares" in imported[0]).toBe(false);
  });

  it("rejects a v1 file with bad records", () => {
    const bad = { version: 1, stashes: [{ id: "r1" }] };
    expect(() => parseStashesImport(JSON.stringify(bad))).toThrow("Not a valid stash export file");
  });

  it("enforces the version literal (v0, v3, missing version)", () => {
    for (const version of [0, 3, undefined]) {
      const payload = { version, stashes: [] };
      expect(() => parseStashesImport(JSON.stringify(payload))).toThrow();
    }
  });

  it("rejects malformed shares in a v2 file", () => {
    const bad = { version: 2, stashes: [record({ shares: [{ url: 1 }] as never })] };
    expect(() => parseStashesImport(JSON.stringify(bad))).toThrow("Not a valid stash export file");
  });

  it("rejects invalid JSON", () => {
    expect(() => parseStashesImport("{")).toThrow("Invalid JSON");
  });
});
