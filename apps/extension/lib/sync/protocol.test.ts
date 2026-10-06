import { describe, expect, it } from "vitest";
import {
  satisfiesRange,
  versionCompatible,
  OUR_PROTOCOL_VERSION,
  OUR_SUPPORTED_RANGE,
} from "./protocol";
import { SYNC_TOOLS } from "./protocol";

describe("satisfiesRange", () => {
  it("handles >= < comparators like the F1 range contract", () => {
    expect(satisfiesRange("1.0.0", ">=1.0.0 <2.0.0")).toBe(true);
    expect(satisfiesRange("1.9.9", ">=1.0.0 <2.0.0")).toBe(true);
    expect(satisfiesRange("2.0.0", ">=1.0.0 <2.0.0")).toBe(false);
    expect(satisfiesRange("0.9.0", ">=1.0.0 <2.0.0")).toBe(false);
  });

  it("handles bare versions as exact matches", () => {
    expect(satisfiesRange("1.0.0", "1.0.0")).toBe(true);
    expect(satisfiesRange("1.0.1", "1.0.0")).toBe(false);
  });

  it("handles ^ and ~ ranges", () => {
    expect(satisfiesRange("1.5.0", "^1.0.0")).toBe(true);
    expect(satisfiesRange("2.0.0", "^1.0.0")).toBe(false);
    expect(satisfiesRange("1.2.9", "~1.2.0")).toBe(true);
    expect(satisfiesRange("1.3.0", "~1.2.0")).toBe(false);
  });
});

describe("versionCompatible (both directions, F1 range negotiation)", () => {
  it("accepts when both directions are in range", () => {
    expect(versionCompatible("1.0.0", OUR_SUPPORTED_RANGE, "1.0.0", ">=1.0.0 <2.0.0")).toBe(true);
  });

  it("refuses when the daemon's version is outside our range", () => {
    expect(versionCompatible("1.0.0", OUR_SUPPORTED_RANGE, "2.1.0", ">=1.0.0")).toBe(false);
  });

  it("refuses when OUR version is outside the daemon's range", () => {
    expect(versionCompatible("1.0.0", OUR_SUPPORTED_RANGE, "1.5.0", ">=2.0.0")).toBe(false);
  });
});

describe("protocol constants", () => {
  it("keeps F1's protocol version and range", () => {
    expect(OUR_PROTOCOL_VERSION).toBe("1.0.0");
    expect(OUR_SUPPORTED_RANGE).toBe(">=1.0.0 <2.0.0");
  });

  it("namespaces sync tools away from MCP tool names", () => {
    expect(SYNC_TOOLS.change).toMatch(/^stash_sync_/);
    expect(SYNC_TOOLS.seed).toMatch(/^stash_sync_/);
    expect(SYNC_TOOLS.ping).toMatch(/^stash_sync_/);
  });
});
