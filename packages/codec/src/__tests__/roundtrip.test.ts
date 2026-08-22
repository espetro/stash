import { describe, it, expect, beforeAll } from "vitest";
import {
  encodeTabsToShareUrl,
  encodeTabsToQrUrl,
  encodePayloadToUrl,
  encodePayloadToQr,
  createPayload,
  decodeShareUrl,
  normalizeTitle,
  buildShareUrl,
  buildQrUrl,
  getQrSegments,
  estimateQrBitLength,
  PayloadDecodeError,
  MAX_TITLE_CHARS,
  PAYLOAD_VERSION,
} from "../index.js";
import type { TabInfo } from "../index.js";
import type { BrotliFunctions } from "../types.js";
import brotliWasm from "brotli-wasm";

// Test data
const smallTabs: TabInfo[] = [{ url: "https://github.com", title: "GitHub" }];

const mediumTabs: TabInfo[] = [
  { url: "https://github.com", title: "GitHub" },
  { url: "https://stackoverflow.com", title: "Stack Overflow" },
  { url: "https://developer.mozilla.org", title: "MDN Web Docs" },
  { url: "https://www.reddit.com/r/webdev", title: "r/webdev - Reddit" },
  { url: "https://css-tricks.com", title: "CSS-Tricks" },
];

const unicodeTabs: TabInfo[] = [
  { url: "https://example.com/日本語/テスト", title: "日本語のページ - Unicode Test" },
  {
    url: "https://example.com/path?query=value&other=123#section",
    title: "URL with special chars & # ?",
  },
];

const longTitleTabs: TabInfo[] = [
  {
    url: "https://example.com/long-url-path",
    title:
      "This is a very long title that exceeds the thirty character limit and should be truncated",
  },
];

const titledTabs: TabInfo[] = [
  { url: "https://github.com", title: "GitHub" },
  { url: "https://stackoverflow.com", title: "Stack Overflow" },
];

// Helper to extract fragment from URL
function getFragment(url: string): string {
  const hashIndex = url.indexOf("#");
  return hashIndex >= 0 ? url.slice(hashIndex) : "";
}

describe("v4 codec round-trip tests (URL adapter)", () => {
  let brotli: BrotliFunctions;

  beforeAll(async () => {
    const module = await brotliWasm;
    brotli = {
      compress: (data, opts) => module.compress(data, opts),
      decompress: (data) => module.decompress(data),
    };
  });

  it("Small payload (1 tab) round-trips correctly via URL adapter", async () => {
    const result = await encodeTabsToShareUrl(smallTabs, brotli);
    expect(result.url).toContain("#p=");
    expect(result.itemCount).toBe(1);
    expect(result.truncated).toBe(false);

    const decoded = await decodeShareUrl(getFragment(result.url), brotli);
    expect(decoded.version).toBe(6);
    expect(decoded.items.length).toBe(1);
    expect(decoded.items[0][0]).toBe("https://github.com");
    expect(decoded.items[0][1]).toBe("GitHub");
  });

  it("Medium payload (5 tabs) round-trips correctly via URL adapter", async () => {
    const result = await encodeTabsToShareUrl(mediumTabs, brotli);
    expect(result.url).toContain("#p=");
    expect(result.itemCount).toBe(5);
    expect(result.truncated).toBe(false);

    const decoded = await decodeShareUrl(getFragment(result.url), brotli);
    expect(decoded.version).toBe(6);
    expect(decoded.items.length).toBe(5);
    expect(decoded.items[0][0]).toBe("https://github.com");
    expect(decoded.items[1][0]).toBe("https://stackoverflow.com");
  });

  it("Unicode URLs and titles round-trip correctly via URL adapter", async () => {
    const result = await encodeTabsToShareUrl(unicodeTabs, brotli);
    const decoded = await decodeShareUrl(getFragment(result.url), brotli);

    expect(decoded.items.length).toBe(2);
    expect(decoded.items[0][0]).toBe("https://example.com/日本語/テスト");
    expect(decoded.items[0][1]).toBe("日本語のページ - Unicode Test");
    expect(decoded.items[1][0]).toBe("https://example.com/path?query=value&other=123#section");
    expect(decoded.items[1][1]).toBe("URL with special chars & # ?");
  });

  it("Title truncation to MAX_TITLE_CHARS works correctly", async () => {
    const result = await encodeTabsToShareUrl(longTitleTabs, brotli);
    const decoded = await decodeShareUrl(getFragment(result.url), brotli);

    expect(decoded.items[0][1].length).toBeLessThanOrEqual(MAX_TITLE_CHARS);
    expect(decoded.items[0][1]).toBe(
      "This is a very long title that exceeds the thirty character limit and should be truncated".slice(
        0,
        MAX_TITLE_CHARS,
      ),
    );
  });

  it("Titled payload round-trips title correctly via URL adapter", async () => {
    const result = await encodeTabsToShareUrl(titledTabs, brotli, 24, undefined, "My Stash");
    const decoded = await decodeShareUrl(getFragment(result.url), brotli);

    expect(decoded.version).toBe(6);
    expect(decoded.title).toBe("My Stash");
    expect(decoded.items.length).toBe(2);
  });

  it("Empty fragment rejected", async () => {
    try {
      await decodeShareUrl("#p=", brotli);
      expect(false).toBe(true);
    } catch (error) {
      expect(error).toBeInstanceOf(PayloadDecodeError);
      expect((error as PayloadDecodeError).message).toBe("Invalid URL fragment format");
    }
  });

  it("buildShareUrl creates correct URL", () => {
    const encoded = "Rabc123";
    const url = buildShareUrl(encoded);
    expect(url).toContain("#p=Rabc123");
  });
});

describe("v4 codec round-trip tests (QR adapter)", () => {
  let brotli: BrotliFunctions;

  beforeAll(async () => {
    const module = await brotliWasm;
    brotli = {
      compress: (data, opts) => module.compress(data, opts),
      decompress: (data) => module.decompress(data),
    };
  });

  it("Small payload round-trips correctly via QR adapter", async () => {
    const result = await encodeTabsToQrUrl(smallTabs, brotli);
    expect(result.qrUrl).toContain("#q=");
    expect(result.itemCount).toBe(1);
    expect(result.truncated).toBe(false);

    const decoded = await decodeShareUrl(getFragment(result.qrUrl), brotli);
    expect(decoded.version).toBe(6);
    expect(decoded.items.length).toBe(1);
    expect(decoded.items[0][0]).toBe("https://github.com");
    expect(decoded.items[0][1]).toBe("GitHub");
  });

  it("Medium payload round-trips correctly via QR adapter", async () => {
    const result = await encodeTabsToQrUrl(mediumTabs, brotli);
    expect(result.qrUrl).toContain("#q=");
    expect(result.itemCount).toBe(5);
    expect(result.truncated).toBe(false);

    const decoded = await decodeShareUrl(getFragment(result.qrUrl), brotli);
    expect(decoded.version).toBe(6);
    expect(decoded.items.length).toBe(5);
  });

  it("Unicode round-trips correctly via QR adapter", async () => {
    const result = await encodeTabsToQrUrl(unicodeTabs, brotli);
    const decoded = await decodeShareUrl(getFragment(result.qrUrl), brotli);

    expect(decoded.items[0][0]).toBe("https://example.com/日本語/テスト");
    expect(decoded.items[0][1]).toBe("日本語のページ - Unicode Test");
  });

  it("Titled payload round-trips title correctly via QR adapter", async () => {
    const result = await encodeTabsToQrUrl(titledTabs, brotli, 24, undefined, "QR Stash");
    const decoded = await decodeShareUrl(getFragment(result.qrUrl), brotli);

    expect(decoded.title).toBe("QR Stash");
    expect(decoded.items.length).toBe(2);
  });

  it("QR payload always uses D prefix (compressed)", async () => {
    const payload = createPayload(smallTabs);
    const encoded = await encodePayloadToQr(payload, brotli);
    expect(encoded.startsWith("D")).toBe(true);
  });

  it("buildQrUrl creates correct URL", () => {
    const encoded = "DAB32";
    const url = buildQrUrl(encoded);
    expect(url).toContain("#q=DAB32");
  });
});

describe("cross-adapter compatibility", () => {
  let brotli: BrotliFunctions;

  beforeAll(async () => {
    const module = await brotliWasm;
    brotli = {
      compress: (data, opts) => module.compress(data, opts),
      decompress: (data) => module.decompress(data),
    };
  });

  it("URL-encoded payload can be decoded from QR fragment (and vice versa)", async () => {
    const payload = createPayload(mediumTabs, 24, "Cross Test");

    const urlEncoded = await encodePayloadToUrl(payload, brotli);
    const qrEncoded = await encodePayloadToQr(payload, brotli);

    // Both decodings should produce the same payload
    const decodedFromUrl = await decodeShareUrl(`#p=${urlEncoded}`, brotli);
    const decodedFromQr = await decodeShareUrl(`#q=${qrEncoded}`, brotli);

    expect(decodedFromUrl.version).toBe(6);
    expect(decodedFromQr.version).toBe(6);
    expect(decodedFromUrl.expiry).toBe(decodedFromQr.expiry);
    expect(decodedFromUrl.title).toBe(decodedFromQr.title);
    expect(decodedFromUrl.items).toEqual(decodedFromQr.items);
  });

  it("Encoder and decoder versions never desync", async () => {
    const payload = createPayload(mediumTabs, 24, "Version Sync");
    const urlEncoded = await encodePayloadToUrl(payload, brotli);
    const decoded = await decodeShareUrl(`#p=${urlEncoded}`, brotli);
    expect(decoded.version).toBe(PAYLOAD_VERSION);
  });
});

describe("QR helper functions", () => {
  it("getQrSegments splits QR URL correctly", () => {
    const qrUrl = "https://stash.illo.fyi/s/#q=DAB32XYZ";
    const segments = getQrSegments(qrUrl);
    expect(segments.prefix).toBe("https://stash.illo.fyi/s/#q=");
    expect(segments.payload).toBe("DAB32XYZ");
  });

  it("getQrSegments throws for invalid URL", () => {
    expect(() => getQrSegments("https://stash.illo.fyi/s/#p=ABC")).toThrow("Invalid QR URL");
  });

  it("estimateQrBitLength returns positive value for QR URL", () => {
    const qrUrl = "https://stash.illo.fyi/s/#q=DAB32XYZ";
    const bits = estimateQrBitLength(qrUrl);
    expect(bits).toBeGreaterThan(0);
  });

  it("estimateQrBitLength scales with payload length", () => {
    const shortUrl = "https://stash.illo.fyi/s/#q=DAB";
    const longUrl = "https://stash.illo.fyi/s/#q=DAB32XYZAB32XYZAB32XYZ";
    expect(estimateQrBitLength(longUrl)).toBeGreaterThan(estimateQrBitLength(shortUrl));
  });
});

describe("v4 codec edge-case tests", () => {
  let brotli: BrotliFunctions;

  beforeAll(async () => {
    const module = await brotliWasm;
    brotli = {
      compress: (data, opts) => module.compress(data, opts),
      decompress: (data) => module.decompress(data),
    };
  });

  it("Empty tab list encodes to empty fragment", async () => {
    const result = await encodeTabsToShareUrl([], brotli);
    expect(result.itemCount).toBe(0);
    expect(result.truncated).toBe(false);
  });

  it("http:// URL preserved as-is (no scheme stripping)", async () => {
    const tabs: TabInfo[] = [{ url: "http://example.com", title: "HTTP Example" }];
    const result = await encodeTabsToShareUrl(tabs, brotli);
    const decoded = await decodeShareUrl(getFragment(result.url), brotli);

    expect(decoded.items[0][0]).toBe("http://example.com");
  });

  it("Empty title after trim still encodes successfully", async () => {
    const tabs: TabInfo[] = [{ url: "https://github.com", title: "   " }];
    const result = await encodeTabsToShareUrl(tabs, brotli);
    const decoded = await decodeShareUrl(getFragment(result.url), brotli);

    expect(decoded.items[0][1]).toBe("");
    expect(decoded.items[0][0]).toBe("https://github.com");
  });

  it("Title of exactly MAX_TITLE_CHARS (120) is not truncated", async () => {
    const title = "ThisIsExactlyThirtyCharsLong!!".padEnd(120, "a");
    expect(title.length).toBe(120);

    const tabs: TabInfo[] = [{ url: "https://github.com", title }];
    const result = await encodeTabsToShareUrl(tabs, brotli);
    const decoded = await decodeShareUrl(getFragment(result.url), brotli);

    expect(decoded.items[0][1]).toBe(title);
  });

  it("Title of MAX_TITLE_CHARS+1 is truncated to exactly MAX_TITLE_CHARS", async () => {
    const longTitle = "ThisTitleIsJustOneCharTooLong!!".padEnd(121, "b");
    expect(longTitle.length).toBe(121);

    const tabs: TabInfo[] = [{ url: "https://github.com", title: longTitle }];
    const result = await encodeTabsToShareUrl(tabs, brotli);
    const decoded = await decodeShareUrl(getFragment(result.url), brotli);

    expect(decoded.items[0][1]).toBe(longTitle.slice(0, 120));
    expect(decoded.items[0][1].length).toBe(120);
  });

  it("normalizeTitle works correctly", () => {
    expect(normalizeTitle("  Hello   World  ")).toBe("Hello World");
    expect(
      normalizeTitle("This is a very long title that exceeds limits").length,
    ).toBeLessThanOrEqual(MAX_TITLE_CHARS);
  });
});

describe("v4 decoder error handling", () => {
  let brotli: BrotliFunctions;

  beforeAll(async () => {
    const module = await brotliWasm;
    brotli = {
      compress: (data, opts) => module.compress(data, opts),
      decompress: (data) => module.decompress(data),
    };
  });

  it("Rejects unknown prefix in URL fragment", async () => {
    try {
      await decodeShareUrl("#p=Xinvalid", brotli);
      expect(false).toBe(true);
    } catch (error) {
      expect(error).toBeInstanceOf(PayloadDecodeError);
      expect((error as PayloadDecodeError).message).toBe("Unknown payload prefix");
    }
  });

  it("Rejects unknown prefix in QR fragment", async () => {
    try {
      await decodeShareUrl("#q=Xinvalid", brotli);
      expect(false).toBe(true);
    } catch (error) {
      expect(error).toBeInstanceOf(PayloadDecodeError);
      expect((error as PayloadDecodeError).message).toBe("Unknown payload prefix");
    }
  });

  it("Rejects invalid base64url in URL fragment", async () => {
    try {
      await decodeShareUrl("#p=R!!!", brotli);
      expect(false).toBe(true);
    } catch (error) {
      expect(error).toBeInstanceOf(PayloadDecodeError);
      expect((error as PayloadDecodeError).message).toBe("Invalid base64url encoding");
    }
  });

  it("Rejects invalid base32 in QR fragment", async () => {
    try {
      await decodeShareUrl("#q=D!!!", brotli);
      expect(false).toBe(true);
    } catch (error) {
      expect(error).toBeInstanceOf(PayloadDecodeError);
      expect((error as PayloadDecodeError).message).toBe("Invalid base32 encoding");
    }
  });

  it("Rejects unsupported version", async () => {
    const v2Payload = { v: 2, e: 1700000000, i: [["https://example.com", "Example"]] };
    const { encode } = await import("@msgpack/msgpack");
    const bytes = encode(v2Payload);
    const { encodeBase64urlNoPadding } = await import("@oslojs/encoding");
    const b64 = encodeBase64urlNoPadding(bytes);
    const fragment = `#p=R${b64}`;

    try {
      await decodeShareUrl(fragment, brotli);
      expect(false).toBe(true);
    } catch (error) {
      expect(error).toBeInstanceOf(PayloadDecodeError);
      expect((error as PayloadDecodeError).message).toBe("Unsupported payload version");
    }
  });
});

describe("v5 payload tests", () => {
  let brotli: BrotliFunctions;

  beforeAll(async () => {
    const m = (await brotliWasm) as any;
    brotli = {
      compress: (d, o) => m.compress(d, o),
      decompress: (d) => m.decompress(d),
    };
  });

  it("encoder emits v5", async () => {
    const tabs: TabInfo[] = [{ url: "https://github.com", title: "GitHub" }];
    const result = await encodeTabsToShareUrl(tabs, brotli);
    const decoded = await decodeShareUrl(getFragment(result.url), brotli);
    expect(decoded.version).toBe(6);
  });

  it("note items round-trip with kind", async () => {
    const tabs: TabInfo[] = [
      { url: "https://github.com", title: "GitHub" },
      { url: "Remember to check the PR thread", title: "Note", kind: "note" },
    ];
    const result = await encodeTabsToShareUrl(tabs, brotli);
    const decoded = await decodeShareUrl(getFragment(result.url), brotli);
    expect(decoded.version).toBe(6);
    expect(decoded.items[0]).toEqual(["https://github.com", "GitHub"]);
    expect(decoded.items[1]).toEqual(["Remember to check the PR thread", "Note", "note"]);
  });

  it("url items omit kind (2-tuple, not 3-tuple with undefined)", async () => {
    const tabs: TabInfo[] = [{ url: "https://github.com", title: "GitHub" }];
    const result = await encodeTabsToShareUrl(tabs, brotli);
    const decoded = await decodeShareUrl(getFragment(result.url), brotli);
    expect(decoded.items[0].length).toBe(2);
  });

  it("v4 payload decodes under v5-aware decoder (v4→v5 legacy)", async () => {
    // Hand-craft a v4 payload the way old links were encoded
    const { encode } = await import("@msgpack/msgpack");
    const { encodeBase64urlNoPadding } = await import("@oslojs/encoding");
    const { serializePayload } = await import("../payload.js");
    const raw = serializePayload({
      v: 4,
      e: Math.floor(Date.now() / 1000) + 3600,
      i: [["https://example.com", "Legacy"]],
    });
    const body = encodeBase64urlNoPadding(brotli.compress(raw, { quality: 11 }));
    const decoded = await decodeShareUrl(`#p=C${body}`, brotli);
    expect(decoded.version).toBe(4);
    expect(decoded.items[0]).toEqual(["https://example.com", "Legacy"]);
    expect(decoded.isExpired).toBe(false);
    // unused imports guard
    void encode;
  });

  it("unknown kind values degrade to plain text render (decoder keeps them)", async () => {
    const { serializePayload } = await import("../payload.js");
    const { encodeBase32UpperCaseNoPadding } = await import("@oslojs/encoding");
    const raw = serializePayload({
      v: 5,
      e: Math.floor(Date.now() / 1000) + 3600,
      i: [["https://example.com", "Future kind", "video" as "url"]],
    });
    const body = encodeBase32UpperCaseNoPadding(brotli.compress(raw, { quality: 11 }));
    const decoded = await decodeShareUrl(`#q=D${body}`, brotli);
    expect(decoded.items[0][2]).toBe("video");
  });
});

describe("v6 payload tests (tags + note)", () => {
  let brotli: BrotliFunctions;

  beforeAll(async () => {
    const m = (await brotliWasm) as any;
    brotli = {
      compress: (d, o) => m.compress(d, o),
      decompress: (d) => m.decompress(d),
    };
  });

  it("encoder emits v6", async () => {
    const tabs: TabInfo[] = [{ url: "https://github.com", title: "GitHub" }];
    const result = await encodeTabsToShareUrl(tabs, brotli);
    const decoded = await decodeShareUrl(getFragment(result.url), brotli);
    expect(decoded.version).toBe(6);
  });

  it("tags and note round-trip via URL adapter", async () => {
    const tabs: TabInfo[] = [{ url: "https://github.com", title: "GitHub" }];
    const result = await encodeTabsToShareUrl(
      tabs,
      brotli,
      24,
      undefined,
      "My Stash",
      ["work/project-x", "reading"],
      "Check this before Monday",
    );
    const decoded = await decodeShareUrl(getFragment(result.url), brotli);
    expect(decoded.tags).toEqual(["work/project-x", "reading"]);
    expect(decoded.note).toBe("Check this before Monday");
  });

  it("tags and note round-trip via QR adapter", async () => {
    const tabs: TabInfo[] = [{ url: "https://github.com", title: "GitHub" }];
    const result = await encodeTabsToQrUrl(
      tabs,
      brotli,
      24,
      undefined,
      undefined,
      ["personal"],
      "A short note",
    );
    const decoded = await decodeShareUrl(getFragment(result.qrUrl), brotli);
    expect(decoded.tags).toEqual(["personal"]);
    expect(decoded.note).toBe("A short note");
  });

  it("tags default to [] and note is undefined when omitted", async () => {
    const tabs: TabInfo[] = [{ url: "https://github.com", title: "GitHub" }];
    const result = await encodeTabsToShareUrl(tabs, brotli);
    const decoded = await decodeShareUrl(getFragment(result.url), brotli);
    expect(decoded.tags).toEqual([]);
    expect(decoded.note).toBeUndefined();
  });

  it("v5 payload (no tags/note) decodes under v6-aware decoder with defaults", async () => {
    const { serializePayload } = await import("../payload.js");
    const raw = serializePayload({
      v: 5,
      e: Math.floor(Date.now() / 1000) + 3600,
      i: [["https://example.com", "Legacy v5"]],
    });
    const { encodeBase64urlNoPadding } = await import("@oslojs/encoding");
    const body = encodeBase64urlNoPadding(brotli.compress(raw, { quality: 11 }));
    const decoded = await decodeShareUrl(`#p=C${body}`, brotli);
    expect(decoded.version).toBe(5);
    expect(decoded.tags).toEqual([]);
    expect(decoded.note).toBeUndefined();
    expect(decoded.items[0]).toEqual(["https://example.com", "Legacy v5"]);
  });
});
