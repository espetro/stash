import { describe, it, expect, vi } from "vitest";

vi.mock("brotli-wasm", () => ({
  default: {
    compress: vi.fn((data: Uint8Array) => new Uint8Array([0x01, ...data])),
    decompress: vi.fn(
      (data: Uint8Array) => new Uint8Array(data.slice(1))
    ),
  },
}));

import { getBrotliFunctions } from "../brotli";

describe("getBrotliFunctions", () => {
  it("returns an object with compress and decompress functions", async () => {
    const brotli = await getBrotliFunctions();
    expect(typeof brotli.compress).toBe("function");
    expect(typeof brotli.decompress).toBe("function");
  });

  it("compresses and decompresses data correctly", async () => {
    const brotli = await getBrotliFunctions();
    const input = new TextEncoder().encode("hello stash");

    const compressed = brotli.compress(input);
    expect(compressed.length).toBeGreaterThan(0);

    const decompressed = brotli.decompress(compressed);
    const output = new TextDecoder().decode(decompressed);
    expect(output).toBe("hello stash");
  });

  it("returns the same instance on subsequent calls", async () => {
    const first = await getBrotliFunctions();
    const second = await getBrotliFunctions();
    expect(first).toBe(second);
  });
});
