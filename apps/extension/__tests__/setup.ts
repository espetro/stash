import "@testing-library/jest-dom/vitest";
import { beforeEach, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";

// Reset fake-browser state before each test
beforeEach(() => {
  fakeBrowser.reset();
});

// Mock @stash/shared to avoid brotli-wasm side effects
vi.mock("@stash/shared", () => ({
  getBrotliFunctions: vi.fn(async () => ({
    compress: (data: Uint8Array) => data,
    decompress: (data: Uint8Array) => data,
  })),
  formatDateTime: vi.fn(() => "today"),
  formatRemainingTime: vi.fn(() => "Expires in 1 day"),
  stashDisplayTitle: (
    record: { title?: string | null; items: { url: string; title: string }[] },
    untitled: string,
  ) => {
    const title = record.title?.trim();
    if (title) return title;
    if (record.items.length === 0) return untitled;
    const firstItem = record.items[0];
    let host = firstItem.url;
    try {
      host = new URL(firstItem.url).hostname.replace(/^www\./, "");
    } catch {}
    const firstTitle = firstItem.title || host;
    return record.items.length > 1
      ? `${firstTitle} + ${record.items.length - 1} more`
      : firstTitle;
  },
  getDomain: vi.fn((url: string) => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }),
  getFaviconUrl: vi.fn((url: string) => `https://www.google.com/s2/favicons?domain=${url}&sz=32`),
}));
