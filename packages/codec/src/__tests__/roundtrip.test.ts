import { describe, it, expect, beforeAll } from "bun:test";
import {
  encodeTabsToShareUrl,
  encodePayload,
  createPayload,
  decodeShareUrl,
  normalizeTitle,
  PayloadDecodeError,
  buildShareUrl,
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

// Helper to extract fragment from URL
function getFragment(url: string): string {
  const hashIndex = url.indexOf("#");
  return hashIndex >= 0 ? url.slice(hashIndex) : "";
}

describe("v2 codec round-trip tests", () => {
  let brotli: BrotliFunctions;

  beforeAll(async () => {
    const module = await brotliWasm;
    brotli = {
      compress: (data, opts) => module.compress(data, opts),
      decompress: (data) => module.decompress(data),
    };
  });

  it("Test 1: Small payload (1 tab, below 50-byte threshold) → 'R' prefix", async () => {
    const result = await encodeTabsToShareUrl(smallTabs, brotli);
    expect(result.url).toContain("#p=R");
    expect(result.itemCount).toBe(1);
    expect(result.truncated).toBe(false);

    const decoded = await decodeShareUrl(getFragment(result.url), brotli);
    expect(decoded.version).toBe(2);
    expect(decoded.items.length).toBe(1);
    expect(decoded.items[0][0]).toBe("https://github.com");
    expect(decoded.items[0][1]).toBe("GitHub");
  });

  it("Test 2: Medium payload (5 tabs) → 'R' prefix (optimized, no compression needed)", async () => {
    const result = await encodeTabsToShareUrl(mediumTabs, brotli);
    expect(result.url).toContain("#p=R");
    expect(result.itemCount).toBe(5);
    expect(result.truncated).toBe(false);

    const decoded = await decodeShareUrl(getFragment(result.url), brotli);
    expect(decoded.version).toBe(2);
    expect(decoded.items.length).toBe(5);
    expect(decoded.items[0][0]).toBe("https://github.com");
    expect(decoded.items[1][0]).toBe("https://stackoverflow.com");
  });

  it("Test 3: Unicode URLs and titles round-trip correctly", async () => {
    const result = await encodeTabsToShareUrl(unicodeTabs, brotli);
    const decoded = await decodeShareUrl(getFragment(result.url), brotli);

    expect(decoded.items.length).toBe(2);
    expect(decoded.items[0][0]).toBe("https://example.com/日本語/テスト");
    expect(decoded.items[0][1]).toBe("日本語のページ - Unicode Test");
    expect(decoded.items[1][0]).toBe("https://example.com/path?query=value&other=123#section");
    expect(decoded.items[1][1]).toBe("URL with special chars & # ?");
  });

  it("Test 4: Title truncation to 30 chars", async () => {
    const result = await encodeTabsToShareUrl(longTitleTabs, brotli);
    const decoded = await decodeShareUrl(getFragment(result.url), brotli);

    expect(decoded.items[0][1].length).toBeLessThanOrEqual(30);
    expect(decoded.items[0][1]).toBe("This is a very long title that");
  });

  it("Test 5: v1-style payload rejected with 'Unsupported payload version' error", async () => {
    // Create a raw (uncompressed) v1-style JSON payload
    // v1 format was: {v: 1, e: expiry, i: [[url, title], ...]}
    const v1Payload = { v: 1, e: 1700000000, i: [["https://example.com", "Example"]] };
    const json = JSON.stringify(v1Payload);
    const utf8 = new TextEncoder().encode(json);
    // Base64 encode
    const base64 = btoa(String.fromCharCode(...utf8));
    const base64url = base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
    // Mark as raw (R prefix) - this will fail version check
    const fragment = `#p=R${base64url}`;

    try {
      await decodeShareUrl(fragment, brotli);
      expect(false).toBe(true);
    } catch (error) {
      expect(error).toBeInstanceOf(PayloadDecodeError);
      expect((error as PayloadDecodeError).message).toBe("Unsupported payload version");
    }
  });

  it("Test 6: Empty fragment rejected", async () => {
    try {
      await decodeShareUrl("#p=", brotli);
      expect(false).toBe(true);
    } catch (error) {
      expect(error).toBeInstanceOf(PayloadDecodeError);
      expect((error as PayloadDecodeError).message).toBe("Invalid URL fragment format");
    }
  });

  it("Test 7: 'R' prefix (raw) decodes correctly", async () => {
    const payload = createPayload(smallTabs);
    const encoded = await encodePayload(payload, brotli);
    expect(encoded.startsWith("R")).toBe(true);

    const decoded = await decodeShareUrl(`#p=${encoded}`, brotli);
    expect(decoded.version).toBe(2);
    expect(decoded.items.length).toBe(1);
    expect(decoded.items[0][0]).toBe("https://github.com");
  });

  it("Test 8: Both http:// and https:// URLs stripped on encode, https:// restored on decode", async () => {
    const mixedTabs: TabInfo[] = [
      { url: "http://example.com", title: "HTTP Example" },
      { url: "https://example.org", title: "HTTPS Example" },
    ];

    const result = await encodeTabsToShareUrl(mixedTabs, brotli);
    const decoded = await decodeShareUrl(getFragment(result.url), brotli);

    expect(decoded.items[0][0]).toBe("https://example.com");
    expect(decoded.items[1][0]).toBe("https://example.org");
  });

  it("Test 9: normalizeTitle works correctly", () => {
    expect(normalizeTitle("  Hello   World  ")).toBe("Hello World");
    expect(
      normalizeTitle("This is a very long title that exceeds limits").length,
    ).toBeLessThanOrEqual(30);
  });

  it("Test 10: buildShareUrl creates correct URL", () => {
    const encoded = "Rabc123";
    const url = buildShareUrl(encoded);
    expect(url).toContain("#p=Rabc123");
  });
});

describe("v2 codec edge-case tests", () => {
  let brotli: BrotliFunctions;

  beforeAll(async () => {
    const module = await brotliWasm;
    brotli = {
      compress: (data, opts) => module.compress(data, opts),
      decompress: (data) => module.decompress(data),
    };
  });

  it("Test 11: http:// URL is included and restored to https on decode", async () => {
    const tabs: TabInfo[] = [{ url: "http://github.com/user/repo", title: "HTTP Test" }];
    const result = await encodeTabsToShareUrl(tabs, brotli);
    const decoded = await decodeShareUrl(getFragment(result.url), brotli);

    expect(decoded.items[0][0]).toBe("https://github.com/user/repo");
  });

  it("Test 12: URL with .com TLD stripped during encode, restored on decode", async () => {
    const tabs: TabInfo[] = [{ url: "https://github.com/user/repo", title: "GitHub Repo" }];
    const result = await encodeTabsToShareUrl(tabs, brotli);
    const decoded = await decodeShareUrl(getFragment(result.url), brotli);

    expect(decoded.items[0][0]).toBe("https://github.com/user/repo");
  });

  it("Test 13: Payload at exactly COMPRESSION_THRESHOLD bytes uses raw prefix", async () => {
    const tabs: TabInfo[] = [
      {
        url: "https://verylongdomainnametoreachthreshold.com/path",
        title: "A".repeat(30),
      },
    ];

    const result = await encodeTabsToShareUrl(tabs, brotli);
    expect(result.url).toMatch(/#p=[RC]/);
  });

  it("Test 14: Empty title after trim still encodes successfully", async () => {
    const tabs: TabInfo[] = [{ url: "https://github.com", title: "   " }];
    const result = await encodeTabsToShareUrl(tabs, brotli);
    const decoded = await decodeShareUrl(getFragment(result.url), brotli);

    expect(decoded.items[0][1]).toBe("");
    expect(decoded.items[0][0]).toBe("https://github.com");
  });

  it("Test 15: Title of exactly MAX_TITLE_CHARS (30) is not truncated", async () => {
    const title = "ThisIsExactlyThirtyCharsLong!!";
    expect(title.length).toBe(30);

    const tabs: TabInfo[] = [{ url: "https://github.com", title }];
    const result = await encodeTabsToShareUrl(tabs, brotli);
    const decoded = await decodeShareUrl(getFragment(result.url), brotli);

    expect(decoded.items[0][1]).toBe(title);
  });

  it("Test 16: Title of MAX_TITLE_CHARS+1 is truncated to exactly 30 chars", async () => {
    const longTitle = "ThisTitleIsJustOneCharTooLong!!";
    expect(longTitle.length).toBe(31);

    const tabs: TabInfo[] = [{ url: "https://github.com", title: longTitle }];
    const result = await encodeTabsToShareUrl(tabs, brotli);
    const decoded = await decodeShareUrl(getFragment(result.url), brotli);

    expect(decoded.items[0][1]).toBe("ThisTitleIsJustOneCharTooLong!");
    expect(decoded.items[0][1].length).toBe(30);
  });
});

describe("TLD index encoding roundtrip tests", () => {
  let brotli: BrotliFunctions;

  beforeAll(async () => {
    const module = await brotliWasm;
    brotli = {
      compress: (data, opts) => module.compress(data, opts),
      decompress: (data) => module.decompress(data),
    };
  });

  it("Restores .com TLD ($0) correctly", async () => {
    const tabs: TabInfo[] = [{ url: "https://github.com/user/repo", title: "GitHub" }];
    const result = await encodeTabsToShareUrl(tabs, brotli);
    const decoded = await decodeShareUrl(getFragment(result.url), brotli);
    expect(decoded.items[0][0]).toBe("https://github.com/user/repo");
  });

  it("Restores .org TLD ($1) correctly", async () => {
    const tabs: TabInfo[] = [{ url: "https://developer.mozilla.org/docs", title: "MDN" }];
    const result = await encodeTabsToShareUrl(tabs, brotli);
    const decoded = await decodeShareUrl(getFragment(result.url), brotli);
    expect(decoded.items[0][0]).toBe("https://developer.mozilla.org/docs");
  });

  it("Restores .net TLD ($2) correctly", async () => {
    const tabs: TabInfo[] = [{ url: "https://subdomain.example.net/path", title: "Example" }];
    const result = await encodeTabsToShareUrl(tabs, brotli);
    const decoded = await decodeShareUrl(getFragment(result.url), brotli);
    expect(decoded.items[0][0]).toBe("https://subdomain.example.net/path");
  });

  it("Restores .io TLD ($3) correctly", async () => {
    const tabs: TabInfo[] = [{ url: "https://pagoda.io", title: "Pagoda" }];
    const result = await encodeTabsToShareUrl(tabs, brotli);
    const decoded = await decodeShareUrl(getFragment(result.url), brotli);
    expect(decoded.items[0][0]).toBe("https://pagoda.io");
  });

  it("Restores .dev TLD ($4) correctly", async () => {
    const tabs: TabInfo[] = [{ url: "https://react.dev", title: "React" }];
    const result = await encodeTabsToShareUrl(tabs, brotli);
    const decoded = await decodeShareUrl(getFragment(result.url), brotli);
    expect(decoded.items[0][0]).toBe("https://react.dev");
  });

  it("Restores .app TLD ($5) correctly", async () => {
    const tabs: TabInfo[] = [{ url: "https://myapp.app", title: "MyApp" }];
    const result = await encodeTabsToShareUrl(tabs, brotli);
    const decoded = await decodeShareUrl(getFragment(result.url), brotli);
    expect(decoded.items[0][0]).toBe("https://myapp.app");
  });

  it("Restores TLD for non-whitelisted domain unchanged (no stripping)", async () => {
    const tabs: TabInfo[] = [{ url: "https://example.co.uk/path", title: "Co.uk" }];
    const result = await encodeTabsToShareUrl(tabs, brotli);
    const decoded = await decodeShareUrl(getFragment(result.url), brotli);
    expect(decoded.items[0][0]).toBe("https://example.co.uk/path");
  });

  it("Restores TLD for unlisted whitelisted domain (e.g. example.info)", async () => {
    const tabs: TabInfo[] = [{ url: "https://example.info/path", title: "Info" }];
    const result = await encodeTabsToShareUrl(tabs, brotli);
    const decoded = await decodeShareUrl(getFragment(result.url), brotli);
    expect(decoded.items[0][0]).toBe("https://example.info/path");
  });

  it("Handles subdomain with www prefix and TLD encoding", async () => {
    const tabs: TabInfo[] = [{ url: "https://www.docs.github.com/en", title: "GitHub Docs" }];
    const result = await encodeTabsToShareUrl(tabs, brotli);
    const decoded = await decodeShareUrl(getFragment(result.url), brotli);
    expect(decoded.items[0][0]).toBe("https://docs.github.com/en");
  });

  it("Restores URL with port number correctly", async () => {
    const tabs: TabInfo[] = [{ url: "https://localhost:8080/path", title: "Local" }];
    const result = await encodeTabsToShareUrl(tabs, brotli);
    const decoded = await decodeShareUrl(getFragment(result.url), brotli);
    expect(decoded.items[0][0]).toBe("https://localhost:8080/path");
  });

  it("Restores URL with query string correctly", async () => {
    const tabs: TabInfo[] = [{ url: "https://github.com/search?q=test", title: "Search" }];
    const result = await encodeTabsToShareUrl(tabs, brotli);
    const decoded = await decodeShareUrl(getFragment(result.url), brotli);
    expect(decoded.items[0][0]).toBe("https://github.com/search?q=test");
  });

  it("Restores URL with hash fragment correctly", async () => {
    const tabs: TabInfo[] = [{ url: "https://github.com/user#section", title: "Section" }];
    const result = await encodeTabsToShareUrl(tabs, brotli);
    const decoded = await decodeShareUrl(getFragment(result.url), brotli);
    expect(decoded.items[0][0]).toBe("https://github.com/user#section");
  });

  it("Multiple tabs with different TLDs all restore correctly", async () => {
    const tabs: TabInfo[] = [
      { url: "https://github.com", title: "GitHub .com" },
      { url: "https://react.dev", title: "React .dev" },
      { url: "https://pagoda.io", title: "Pagoda .io" },
      { url: "https://docs.github.com/en", title: "GitHub Docs" },
    ];
    const result = await encodeTabsToShareUrl(tabs, brotli);
    const decoded = await decodeShareUrl(getFragment(result.url), brotli);
    expect(decoded.items.length).toBe(4);
    expect(decoded.items[0][0]).toBe("https://github.com");
    expect(decoded.items[1][0]).toBe("https://react.dev");
    expect(decoded.items[2][0]).toBe("https://pagoda.io");
    expect(decoded.items[3][0]).toBe("https://docs.github.com/en");
  });

  it("Backward compatible with old format (no $N encoding)", async () => {
    const expiry = Math.floor(Date.now() / 1000) + 86400;
    const packed = `2${expiry}\x1dstackoverflow.com\x1fStack Overflow`;
    const utf8 = new TextEncoder().encode(packed);
    const base64 = btoa(String.fromCharCode(...utf8))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
    const fragment = `#p=R${base64}`;

    const decoded = await decodeShareUrl(fragment, brotli);
    expect(decoded.items.length).toBe(1);
    expect(decoded.items[0][0]).toBe("https://stackoverflow.com");
    expect(decoded.items[0][1]).toBe("Stack Overflow");
  });
});
