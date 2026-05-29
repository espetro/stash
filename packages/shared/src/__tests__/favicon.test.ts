import { describe, it, expect } from "vitest";
import { getDomain, getFaviconUrl } from "../favicon";

describe("getDomain", () => {
  it("extracts hostname from valid URL", () => {
    expect(getDomain("https://example.com/path")).toBe("example.com");
  });

  it("extracts hostname with subdomain", () => {
    expect(getDomain("https://sub.example.com/path?q=1")).toBe("sub.example.com");
  });

  it("returns the input string for invalid URLs", () => {
    expect(getDomain("not-a-url")).toBe("not-a-url");
    expect(getDomain("")).toBe("");
  });
});

describe("getFaviconUrl", () => {
  it("returns Google favicon URL with extracted domain", () => {
    const result = getFaviconUrl("https://example.com");
    expect(result).toContain("www.google.com/s2/favicons?domain=example.com");
    expect(result).toContain("sz=32");
  });

  it("uses raw input as domain fallback for invalid URLs", () => {
    const result = getFaviconUrl("not-a-url");
    expect(result).toContain("domain=not-a-url");
  });
});
