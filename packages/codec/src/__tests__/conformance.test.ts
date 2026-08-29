import { describe, it, expect, beforeAll } from "vitest";
import { decodeShareUrl, type BrotliFunctions } from "../index.js";
import brotliWasm from "brotli-wasm";
import fixturesJson from "../../../shared/fixtures/payloads.json";

/**
 * Conformance test against the canonical shared fixture set
 * (packages/shared/fixtures/payloads.json, schema in payloads.md).
 *
 * Additive to roundtrip.test.ts: asserts TS decode of every canonical
 * vector. Cross-encoding (TS decode of a Go-encoded payload) is covered by
 * the Go test target (daemon/internal/codec), which cannot check in a
 * Go-encoded artifact without pinning brotli bytes; the invariant there and
 * here is semantic round-trip, never byte-identical output.
 */

interface PayloadFixture {
  name: string;
  description: string;
  fragment: string;
  itemCount: number;
  items: { url: string; title: string }[];
  title?: string;
  tags?: string[];
  note?: string;
}

const fixtures = fixturesJson as PayloadFixture[];

let brotli: BrotliFunctions;

beforeAll(async () => {
  brotli = (await brotliWasm) as unknown as BrotliFunctions;
});

describe("canonical payload fixture conformance (packages/shared/fixtures)", () => {
  it("exposes exactly 13 v6 vectors", () => {
    expect(fixtures).toHaveLength(13);
  });

  for (const f of fixtures) {
    it(`decodes ${f.name}`, async () => {
      if (f.name === "empty-items") {
        // Parity by refusal: empty fragment is rejected on both runtimes.
        await expect(decodeShareUrl(f.fragment, brotli)).rejects.toThrow(
          "Invalid URL fragment format",
        );
        return;
      }
      const decoded = await decodeShareUrl(f.fragment, brotli);
      expect(decoded.version).toBe(6);
      expect(decoded.items).toHaveLength(f.itemCount);
      expect(decoded.items.map((i) => [i[0], i[1]])).toEqual(
        f.items.map((i) => [i.url, i.title]),
      );
      if (f.title !== undefined) expect(decoded.title).toBe(f.title);
      if (f.tags !== undefined) expect(decoded.tags).toEqual(f.tags);
      if (f.note !== undefined) expect(decoded.note).toBe(f.note);
      expect(decoded.tags).toEqual(f.tags ?? []);
    });
  }
});
