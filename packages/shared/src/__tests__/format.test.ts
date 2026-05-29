import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  formatRemainingTime,
  formatRemainingTimeSeconds,
  formatDateTime,
  estimateCreatedAt,
  buildCaption,
} from "../format";

describe("formatRemainingTime", () => {
  it("returns 'Expired' when remaining is 0 or negative", () => {
    expect(formatRemainingTime(0)).toBe("Expired");
    expect(formatRemainingTime(-1000)).toBe("Expired");
  });

  it("returns 'Expires in < 1m' when less than 1 minute remains", () => {
    expect(formatRemainingTime(30 * 1000)).toBe("Expires in < 1m");
    expect(formatRemainingTime(59 * 1000)).toBe("Expires in < 1m");
  });

  it("returns 'Expires in Xm' format when less than 1 hour remains", () => {
    expect(formatRemainingTime(5 * 60 * 1000)).toBe("Expires in 5m");
  });

  it("returns 'Expires in Xh Ym' format when hours remain", () => {
    expect(formatRemainingTime(2 * 3600 * 1000 + 30 * 60 * 1000)).toBe(
      "Expires in 2h 30m"
    );
  });

  it("returns 'Never expires' when more than 10 years away", () => {
    const TEN_YEARS_MS = 10 * 365 * 24 * 3600 * 1000;
    expect(formatRemainingTime(TEN_YEARS_MS + 1000)).toBe("Never expires");
  });

  it("returns 'Expires in Xd Yh' when days remain", () => {
    expect(formatRemainingTime(2 * 24 * 3600 * 1000 + 3 * 3600 * 1000)).toBe(
      "Expires in 2d 3h"
    );
  });
});

describe("formatRemainingTimeSeconds", () => {
  it("returns 'Expired' when remaining seconds is 0 or negative", () => {
    expect(formatRemainingTimeSeconds(-100)).toBe("Expired");
    expect(formatRemainingTimeSeconds(0)).toBe("Expired");
  });

  it("returns 'Expires in < 1m' when less than 1 minute remains", () => {
    expect(formatRemainingTimeSeconds(30)).toBe("Expires in < 1m");
  });

  it("returns 'Expires in Xm' format when less than 1 hour remains", () => {
    expect(formatRemainingTimeSeconds(5 * 60)).toBe("Expires in 5m");
  });

  it("returns 'Expires in Xh Ym' format when hours remain", () => {
    expect(formatRemainingTimeSeconds(2 * 3600 + 30 * 60)).toBe(
      "Expires in 2h 30m"
    );
  });

  it("returns 'Never expires' when remaining is more than 10 years", () => {
    const TEN_YEARS = 10 * 365 * 24 * 3600;
    expect(formatRemainingTimeSeconds(TEN_YEARS + 1000)).toBe("Never expires");
  });
});

describe("formatDateTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T14:30:00"));
  });

  it("returns 'Today' for today's date", () => {
    const result = formatDateTime(new Date("2025-06-15T10:00:00").getTime());
    expect(result).toContain("Today");
  });

  it("returns 'Yesterday' for yesterday's date", () => {
    const result = formatDateTime(new Date("2025-06-14T09:00:00").getTime());
    expect(result).toContain("Yesterday");
  });

  it("returns formatted date for older dates", () => {
    const result = formatDateTime(new Date("2025-06-10T15:00:00").getTime());
    expect(result).toContain("Jun 10");
  });
});

describe("estimateCreatedAt", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00"));
  });

  it("estimates created time as expiry minus 24 hours", () => {
    const now = Math.floor(Date.now() / 1000);
    const expiry = now + 24 * 3600;
    const created = estimateCreatedAt(expiry);
    expect(created).toBe(now);
  });

  it("caps estimated created time at current time when expiry is less than 24h away", () => {
    const now = Math.floor(Date.now() / 1000);
    // expiry is only 12h from now, so estimated = now + 12h - 24h = now - 12h
    // but Math.min(estimated, now) caps at now
    const created = estimateCreatedAt(now + 12 * 3600);
    expect(created).toBeLessThanOrEqual(now);
  });
});

describe("buildCaption", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

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
