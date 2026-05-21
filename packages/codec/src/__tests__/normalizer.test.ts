import { describe, it, expect } from "bun:test";
import { normalizeUrl, restoreTldFromIndex, TLD_WHITELIST } from "../normalizer.js";

describe("normalizeUrl", () => {
  it("encodes .com TLD as $0", () => {
    const result = normalizeUrl("https://www.github.com/user/repo");
    expect(result).toBe("https://github$0/user/repo");
  });

  it("encodes .com TLD and preserves path", () => {
    const result = normalizeUrl("https://stackoverflow.com/questions/1234");
    expect(result).toBe("https://stackoverflow$0/questions/1234");
  });

  it("encodes .org TLD and preserves path", () => {
    const result = normalizeUrl("https://developer.mozilla.org/en-US/docs/");
    expect(result).toBe("https://developer.mozilla$1/en-US/docs/");
  });

  it("does not modify ccTLD (.co.uk)", () => {
    const result = normalizeUrl("https://bbc.co.uk/news");
    expect(result).toBe("https://bbc.co.uk/news");
  });

  it("encodes .io TLD", () => {
    const result = normalizeUrl("https://app.io");
    expect(result).toBe("https://app$3");
  });

  it("encodes TLD and preserves path, query, and fragment", () => {
    const result = normalizeUrl("https://subdomain.example.com/path?q=1#section");
    expect(result).toBe("https://subdomain.example$0/path?q=1#section");
  });

  it("preserves non-http schemes unchanged", () => {
    const result = normalizeUrl("chrome-extension://abc");
    expect(result).toBe("chrome-extension://abc");
  });

  it("returns unparseable strings unchanged", () => {
    const result = normalizeUrl("not a url");
    expect(result).toBe("not a url");
  });

  it("does not encode if hostname would be empty", () => {
    const result = normalizeUrl("https://.com");
    expect(result).toBe("https://.com");
  });

  it("encodes both www. and TLD when present", () => {
    const result = normalizeUrl("https://www.example.com/page");
    expect(result).toBe("https://example$0/page");
  });

  it("handles subdomains with www. prefix and encodes TLD", () => {
    const result = normalizeUrl("https://www.subdomain.example.net/path");
    expect(result).toBe("https://subdomain.example$2/path");
  });
});

describe("restoreTldFromIndex", () => {
  it("restores .com from $0", () => {
    const result = restoreTldFromIndex("github$0/user/repo");
    expect(result).toBe("github.com/user/repo");
  });

  it("restores .net from $2", () => {
    const result = restoreTldFromIndex("example$2/path");
    expect(result).toBe("example.net/path");
  });

  it("returns unchanged if no $INDEX", () => {
    const result = restoreTldFromIndex("bbc.co.uk/news");
    expect(result).toBe("bbc.co.uk/news");
  });

  it("restores .com with path, query, and fragment", () => {
    const result = restoreTldFromIndex("subdomain.example$0/path?q=1#section");
    expect(result).toBe("subdomain.example.com/path?q=1#section");
  });

  it("restores .io from $3", () => {
    const result = restoreTldFromIndex("app$3");
    expect(result).toBe("app.io");
  });

  it("returns unchanged for localhost", () => {
    const result = restoreTldFromIndex("localhost/path");
    expect(result).toBe("localhost/path");
  });

  it("returns unchanged for invalid index", () => {
    const result = restoreTldFromIndex("example$99/path");
    expect(result).toBe("example$99/path");
  });

  it("returns unchanged for negative index", () => {
    const result = restoreTldFromIndex("example$-1/path");
    expect(result).toBe("example$-1/path");
  });

  it("handles port preservation", () => {
    const result = restoreTldFromIndex("github$0:8080/user");
    expect(result).toBe("github.com:8080/user");
  });

  it("restores .dev from $4", () => {
    const result = restoreTldFromIndex("react$4");
    expect(result).toBe("react.dev");
  });

  it("restores .app from $5", () => {
    const result = restoreTldFromIndex("myapp$5");
    expect(result).toBe("myapp.app");
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
