import { describe, it, expect } from "bun:test";
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
  { url: "https://example.com/path?query=value&other=123#section", title: "URL with special chars & # ?" },
];

const longTitleTabs: TabInfo[] = [
  { url: "https://example.com/long-url-path", title: "This is a very long title that exceeds the thirty character limit and should be truncated" },
];

// Helper to extract fragment from URL
function getFragment(url: string): string {
  const hashIndex = url.indexOf("#");
  return hashIndex >= 0 ? url.slice(hashIndex) : "";
}

describe("v2 codec round-trip tests", () => {
  it("Test 1: Small payload (1 tab, below 50-byte threshold) → 'R' prefix", async () => {
    const result = await encodeTabsToShareUrl(smallTabs);
    expect(result.url).toContain("#p=R");
    expect(result.itemCount).toBe(1);
    expect(result.truncated).toBe(false);

    const decoded = await decodeShareUrl(getFragment(result.url));
    expect(decoded.version).toBe(2);
    expect(decoded.items.length).toBe(1);
    expect(decoded.items[0][0]).toBe("https://github.com");
    expect(decoded.items[0][1]).toBe("GitHub");
  });

  it("Test 2: Medium payload (5 tabs) → 'C' prefix", async () => {
    const result = await encodeTabsToShareUrl(mediumTabs);
    expect(result.url).toContain("#p=C");
    expect(result.itemCount).toBe(5);
    expect(result.truncated).toBe(false);

    const decoded = await decodeShareUrl(getFragment(result.url));
    expect(decoded.version).toBe(2);
    expect(decoded.items.length).toBe(5);
    expect(decoded.items[0][0]).toBe("https://github.com");
    expect(decoded.items[1][0]).toBe("https://stackoverflow.com");
  });

  it("Test 3: Unicode URLs and titles round-trip correctly", async () => {
    const result = await encodeTabsToShareUrl(unicodeTabs);
    const decoded = await decodeShareUrl(getFragment(result.url));

    expect(decoded.items.length).toBe(2);
    expect(decoded.items[0][0]).toBe("https://example.com/日本語/テスト");
    expect(decoded.items[0][1]).toBe("日本語のページ - Unicode Test");
    expect(decoded.items[1][0]).toBe("https://example.com/path?query=value&other=123#section");
    expect(decoded.items[1][1]).toBe("URL with special chars & # ?");
  });

  it("Test 4: Title truncation to 30 chars", async () => {
    const result = await encodeTabsToShareUrl(longTitleTabs);
    const decoded = await decodeShareUrl(getFragment(result.url));

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
      await decodeShareUrl(fragment);
      expect(false).toBe(true);
    } catch (error) {
      expect(error).toBeInstanceOf(PayloadDecodeError);
      expect((error as PayloadDecodeError).message).toBe("Unsupported payload version");
    }
  });

  it("Test 6: Empty fragment rejected", async () => {
    try {
      await decodeShareUrl("#p=");
      expect(false).toBe(true);
    } catch (error) {
      expect(error).toBeInstanceOf(PayloadDecodeError);
      expect((error as PayloadDecodeError).message).toBe("Invalid URL fragment format");
    }
  });

  it("Test 7: 'R' prefix (raw) decodes correctly", async () => {
    const payload = createPayload(smallTabs);
    const encoded = await encodePayload(payload);
    expect(encoded.startsWith("R")).toBe(true);

    const decoded = await decodeShareUrl(`#p=${encoded}`);
    expect(decoded.version).toBe(2);
    expect(decoded.items.length).toBe(1);
    expect(decoded.items[0][0]).toBe("https://github.com");
  });

  it("Test 8: Both http:// and https:// URLs stripped on encode, https:// restored on decode", async () => {
    const mixedTabs: TabInfo[] = [
      { url: "http://example.com", title: "HTTP Example" },
      { url: "https://example.org", title: "HTTPS Example" },
    ];

    const result = await encodeTabsToShareUrl(mixedTabs);
    const decoded = await decodeShareUrl(getFragment(result.url));

    expect(decoded.items[0][0]).toBe("https://example.com");
    expect(decoded.items[1][0]).toBe("https://example.org");
  });

  it("Test 9: normalizeTitle works correctly", () => {
    expect(normalizeTitle("  Hello   World  ")).toBe("Hello World");
    expect(normalizeTitle("This is a very long title that exceeds limits").length).toBeLessThanOrEqual(30);
  });

  it("Test 10: buildShareUrl creates correct URL", () => {
    const encoded = "Rabc123";
    const url = buildShareUrl(encoded);
    expect(url).toContain("#p=Rabc123");
  });
});
