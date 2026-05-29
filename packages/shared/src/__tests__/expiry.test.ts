import { describe, it, expect } from "vitest";
import { extractTitle, EXPIRY_OPTIONS, validateExpiryValue } from "../expiry";
import { EXPIRY_HOURS_MAP } from "@stash/codec";

describe("extractTitle", () => {
  it("extracts hostname from valid URL", () => {
    const result = extractTitle("https://example.com/path");
    expect(result).toBe("example.com");
  });

  it("handles URLs with subdomains", () => {
    const result = extractTitle("https://sub.example.com/path");
    expect(result).toBe("sub.example.com");
  });

  it("truncates to 30 chars on invalid URL", () => {
    const longUrl = "a".repeat(40);
    const result = extractTitle(longUrl);
    expect(result).toBe("a".repeat(30));
    expect(result.length).toBe(30);
  });

  it("handles URL without protocol", () => {
    const result = extractTitle("not a valid url");
    expect(result).toBe("not a valid url");
  });
});

describe("EXPIRY_OPTIONS", () => {
  it("contains all valid expiry values from EXPIRY_HOURS_MAP", () => {
    const optionValues = EXPIRY_OPTIONS.map((opt) => opt.value);

    Object.keys(EXPIRY_HOURS_MAP).forEach((key) => {
      expect(optionValues).toContain(key);
    });
  });

  it("has matching number of options as EXPIRY_HOURS_MAP keys", () => {
    expect(EXPIRY_OPTIONS.length).toBe(Object.keys(EXPIRY_HOURS_MAP).length);
  });

  it("provides labels for each option", () => {
    EXPIRY_OPTIONS.forEach((opt) => {
      expect(opt.label).toBeTruthy();
      expect(typeof opt.label).toBe("string");
    });
  });
});

describe("validateExpiryValue", () => {
  it("returns true for valid expiry keys", () => {
    expect(validateExpiryValue("never")).toBe(true);
    expect(validateExpiryValue("24h")).toBe(true);
    expect(validateExpiryValue("7d")).toBe(true);
    expect(validateExpiryValue("30d")).toBe(true);
  });

  it("returns false for invalid expiry keys", () => {
    expect(validateExpiryValue("invalid")).toBe(false);
    expect(validateExpiryValue("")).toBe(false);
    expect(validateExpiryValue("1h")).toBe(false);
  });
});
