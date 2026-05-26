import { describe, it, expect, beforeEach, vi } from "vitest";
import { formatRemainingTime, buildCaption, estimateCreatedAt } from "@/lib/format";

describe("formatRemainingTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("returns 'Expired' when timestamp is in the past", () => {
    const now = Math.floor(Date.now() / 1000);
    const result = formatRemainingTime(now - 100);
    expect(result).toBe("Expired");
  });

  it("returns 'Expires in < 1m' when less than 1 minute remains", () => {
    const now = Math.floor(Date.now() / 1000);
    const expiry = now + 30;
    const result = formatRemainingTime(expiry);
    expect(result).toBe("Expires in < 1m");
  });

  it("returns 'Expires in Xm' format when less than 1 hour remains", () => {
    const now = Math.floor(Date.now() / 1000);
    const expiry = now + 5 * 60;
    const result = formatRemainingTime(expiry);
    expect(result).toBe("Expires in 5m");
  });

  it("returns 'Expires in Xh Ym' format when hours remain", () => {
    const now = Math.floor(Date.now() / 1000);
    const expiry = now + 2 * 3600 + 30 * 60;
    const result = formatRemainingTime(expiry);
    expect(result).toBe("Expires in 2h 30m");
  });

  it("returns 'Never expires' when timestamp is more than 10 years away", () => {
    const now = Math.floor(Date.now() / 1000);
    const TEN_YEARS = 10 * 365 * 24 * 3600;
    const expiry = now + TEN_YEARS + 1000;
    const result = formatRemainingTime(expiry);
    expect(result).toBe("Never expires");
  });
});

describe("buildCaption", () => {
  it("builds a caption with singular tab", () => {
    const now = Math.floor(Date.now() / 1000);
    const expiry = now + 24 * 3600;
    const result = buildCaption(1, expiry);
    expect(result).toContain("1 tab");
  });

  it("builds a caption with plural tabs", () => {
    const now = Math.floor(Date.now() / 1000);
    const expiry = now + 24 * 3600;
    const result = buildCaption(5, expiry);
    expect(result).toContain("5 tabs");
  });

  it("includes created date and expiry time", () => {
    const now = Math.floor(Date.now() / 1000);
    const expiry = now + 24 * 3600;
    const result = buildCaption(3, expiry);
    expect(result).toContain("Created");
    expect(result).toContain("Expires");
  });

  it("separates parts with dots", () => {
    const now = Math.floor(Date.now() / 1000);
    const expiry = now + 24 * 3600;
    const result = buildCaption(2, expiry);
    expect(result).toContain("·");
  });
});
