import { describe, it, expect } from "vitest";
import { normalizeUrl, TLD_WHITELIST } from "../normalizer.js";

describe("normalizeUrl", () => {
  it("strips www. prefix and .com TLD", () => {
    const result = normalizeUrl("https://www.github.com/user/repo");
    expect(result).toBe("https://github/user/repo");
  });

  it("strips .com TLD and preserves path", () => {
    const result = normalizeUrl("https://stackoverflow.com/questions/1234");
    expect(result).toBe("https://stackoverflow/questions/1234");
  });

  it("strips .org TLD and preserves path", () => {
    const result = normalizeUrl("https://developer.mozilla.org/en-US/docs/");
    expect(result).toBe("https://developer.mozilla/en-US/docs/");
  });

  it("does not strip ccTLD (.co.uk)", () => {
    const result = normalizeUrl("https://bbc.co.uk/news");
    expect(result).toBe("https://bbc.co.uk/news");
  });

  it("strips .io TLD", () => {
    const result = normalizeUrl("https://app.io");
    expect(result).toBe("https://app");
  });

  it("strips TLD and preserves path, query, and fragment", () => {
    const result = normalizeUrl("https://subdomain.example.com/path?q=1#section");
    expect(result).toBe("https://subdomain.example/path?q=1#section");
  });

  it("preserves non-http schemes unchanged", () => {
    const result = normalizeUrl("chrome-extension://abc");
    expect(result).toBe("chrome-extension://abc");
  });

  it("returns unparseable strings unchanged", () => {
    const result = normalizeUrl("not a url");
    expect(result).toBe("not a url");
  });

  it("does not strip if hostname would be empty", () => {
    const result = normalizeUrl("https://.com");
    expect(result).toBe("https://.com");
  });

  it("strips both www. and TLD when present", () => {
    const result = normalizeUrl("https://www.example.com/page");
    expect(result).toBe("https://example/page");
  });

  it("handles subdomains with www. prefix and strips TLD", () => {
    const result = normalizeUrl("https://www.subdomain.example.net/path");
    expect(result).toBe("https://subdomain.example/path");
  });
});

describe("TLD_WHITELIST", () => {
  it("contains expected TLDs", () => {
    expect(TLD_WHITELIST).toContain(".com");
    expect(TLD_WHITELIST).toContain(".org");
    expect(TLD_WHITELIST).toContain(".net");
    expect(TLD_WHITELIST).toContain(".io");
    expect(TLD_WHITELIST).toContain(".dev");
    expect(TLD_WHITELIST).toContain(".app");
  });

  it("is readonly", () => {
    expect(TLD_WHITELIST).toHaveLength(6);
  });
});
