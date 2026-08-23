import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { loadPayloadFixtures, type PayloadFixture } from "../fixtures";

const GOOD: unknown = [
  {
    name: "single-tab",
    description: "One shareable tab URL",
    fragment: "#p=abc",
    itemCount: 1,
    items: [{ url: "https://github.com", title: "GitHub" }],
  },
  {
    name: "tagged-stash",
    description: "with metadata",
    fragment: "#p=def",
    itemCount: 1,
    items: [{ url: "https://github.com", title: "GitHub" }],
    title: "Title",
    tags: ["research"],
    note: "a note",
  },
];

describe("loadPayloadFixtures", () => {
  it("validates and returns well-formed data", () => {
    const fixtures = loadPayloadFixtures(GOOD);
    expect(fixtures).toHaveLength(2);
    expect(fixtures[0].name).toBe("single-tab");
    const tagged: PayloadFixture = fixtures[1];
    expect(tagged.title).toBe("Title");
    expect(tagged.tags).toEqual(["research"]);
    expect(tagged.note).toBe("a note");
  });

  it("rejects non-array input", () => {
    expect(() => loadPayloadFixtures({})).toThrow(/expected an array/);
  });

  it("rejects missing or mistyped fields", () => {
    expect(() => loadPayloadFixtures([{ name: "x" }])).toThrow(/description/);
    expect(() => loadPayloadFixtures([{ name: 1, description: "", fragment: "", itemCount: 0, items: [] }])).toThrow(
      /name/,
    );
    expect(() =>
      loadPayloadFixtures([{ name: "x", description: "", fragment: "", itemCount: "1", items: [] }]),
    ).toThrow(/itemCount/);
    expect(() =>
      loadPayloadFixtures([{ name: "x", description: "", fragment: "", itemCount: 1, items: "no" }]),
    ).toThrow(/items/);
    expect(() =>
      loadPayloadFixtures([
        { name: "x", description: "", fragment: "", itemCount: 1, items: [{ url: 1, title: "t" }] },
      ]),
    ).toThrow(/items\[0\].url/);
  });

  it("rejects itemCount/items.length mismatch", () => {
    expect(() =>
      loadPayloadFixtures([
        { name: "x", description: "", fragment: "", itemCount: 2, items: [{ url: "u", title: "t" }] },
      ]),
    ).toThrow(/does not match items.length/);
  });

  it("rejects malformed optional metadata", () => {
    expect(() =>
      loadPayloadFixtures([
        { name: "x", description: "", fragment: "", itemCount: 0, items: [], tags: "research" },
      ]),
    ).toThrow(/tags/);
    expect(() =>
      loadPayloadFixtures([{ name: "x", description: "", fragment: "", itemCount: 0, items: [], title: 5 }]),
    ).toThrow(/title/);
  });

  it("loads the committed payloads.json when present", () => {
    const payloadsPath = path.resolve(__dirname, "../../fixtures/payloads.json");
    if (!fs.existsSync(payloadsPath)) return; // generated later; skip
    const fixtures = loadPayloadFixtures(JSON.parse(fs.readFileSync(payloadsPath, "utf8")));
    const names = fixtures.map((f) => f.name);
    expect(names).toContain("qr-single-tab");
    expect(names).toContain("qr-three-tabs");
    expect(names).toContain("tagged-stash");
    const qr = fixtures.find((f) => f.name === "qr-single-tab");
    expect(qr?.fragment.startsWith("#q=")).toBe(true);
    const tagged = fixtures.find((f) => f.name === "tagged-stash");
    expect(tagged?.tags).toEqual(["research"]);
    expect(tagged?.note).toBe("a note");
  });
});
