import { describe, it, expect } from "vitest";
// Regression test for the deployed /s?p=...&format=json decompression bug: importing
// "brotli-wasm" directly resolves to index.web.js in the Pages Functions
// ESM build, whose init() fetch()es the wasm relative to import.meta.url.
// workerd has no such asset, so decompress failed with
// "Failed to decompress payload". The fix imports the vendored pkg.web JS
// and wasm bytes directly, so this test exercises exactly that code path
// (no "brotli-wasm" alias, bytes not a compiled module, like the workerd
// fallback branch).
import { getBrotliFunctions } from "../../functions/_shared/decode";
import { encodePayloadToUrl, decodeEncodedPayload } from "@stash/codec";

describe("functions/_shared/decode brotli loader", () => {
  it("decompresses a payload produced by the codec encoder (C prefix)", async () => {
    const brotli = await getBrotliFunctions();
    expect(typeof brotli.decompress).toBe("function");
    expect(typeof brotli.compress).toBe("function");

    const tabs = [
      { url: "https://github.com", title: "GitHub" },
      { url: "https://developer.mozilla.org", title: "MDN Web Docs" },
    ];
    // Long enough to exceed the compression threshold → "C" (brotli) prefix.
    const many = Array.from({ length: 12 }, (_, i) => ({
      url: `${tabs[i % 2].url}/path/${i}`,
      title: `${tabs[i % 2].title} page ${i}`,
    }));
    const payload = {
      v: 6,
      e: Math.floor(Date.now() / 1000) + 3600,
      i: many.map((t) => [t.url, t.title] as [string, string]),
    };

    const encoded = await encodePayloadToUrl(payload, brotli);
    expect(encoded[0]).toBe("C");

    const decoded = await decodeEncodedPayload(encoded, brotli);
    expect(decoded.version).toBe(6);
    expect(decoded.items).toHaveLength(many.length);
    expect(decoded.items[0][0]).toBe(many[0].url);
  });
});
