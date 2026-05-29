import "@testing-library/jest-dom/vitest";
import { beforeEach, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";

// Reset fake-browser state before each test
beforeEach(() => {
  fakeBrowser.reset();
});

// Mock @stash/shared to avoid brotli-wasm side effects
vi.mock("@stash/shared", () => ({
  getDomain: vi.fn((url: string) => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }),
  getFaviconUrl: vi.fn((url: string) => `https://www.google.com/s2/favicons?domain=${url}&sz=32`),
}));
