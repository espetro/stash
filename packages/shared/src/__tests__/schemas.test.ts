import { describe, it, expect } from "vitest";
import {
  validateViewerOrigin,
  validateExpiryMode,
  validateStashLines,
  parseStashLine,
} from "../schemas";

describe("viewerOriginSchema", () => {
  it("accepts http and https URLs", () => {
    expect(validateViewerOrigin("https://stash.illo.fyi").success).toBe(true);
    expect(validateViewerOrigin("http://localhost:4321").success).toBe(true);
  });

  it("rejects non-URLs and other schemes", () => {
    expect(validateViewerOrigin("not a url").success).toBe(false);
    expect(validateViewerOrigin("ftp://example.com").success).toBe(false);
    expect(validateViewerOrigin("javascript:alert(1)").success).toBe(false);
  });
});

describe("expiryModeSchema", () => {
  it("accepts known modes", () => {
    for (const m of ["24h", "7d", "30d", "never"]) {
      expect(validateExpiryMode(m).success).toBe(true);
    }
  });

  it("rejects unknown modes", () => {
    expect(validateExpiryMode("1y").success).toBe(false);
  });
});

describe("validateStashLines", () => {
  it("marks valid lines ok and invalid lines with errors", () => {
    const results = validateStashLines(
      "https://github.com\nnot a url\nhttps://example.com | Title\n\n",
    );
    expect(results[0]).toEqual({ line: 0, ok: true });
    expect(results[1].ok).toBe(false);
    expect(results[1].error).toMatch(/not a valid URL/);
    expect(results[2]).toEqual({ line: 2, ok: true });
    expect(results[3]).toEqual({ line: 3, ok: true }); // blank
  });
});

describe("parseStashLine", () => {
  it("parses URL | Title", () => {
    expect(parseStashLine("https://github.com | My GitHub")).toEqual({
      url: "https://github.com",
      title: "My GitHub",
    });
  });

  it("falls back to hostname title", () => {
    expect(parseStashLine("https://github.com/briosoco/brioso")).toEqual({
      url: "https://github.com/briosoco/brioso",
      title: "github.com",
    });
  });

  it("ignores pipe at position 0", () => {
    expect(parseStashLine("| leading pipe").url).toBe("| leading pipe");
  });
});
