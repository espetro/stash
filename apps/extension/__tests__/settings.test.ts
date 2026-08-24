import { describe, it, expect, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import {
  DEFAULT_SETTINGS,
  LOCAL_LIBRARY_VIEWER_ORIGINS,
  getSettings,
  setSettings,
} from "../lib/settings";

// The global setup mocks @stash/shared; replace it with a richer mock so
// `setSettings` can run without pulling in brotli-wasm side effects.
vi.mock("@stash/shared", () => ({
  getDomain: (url: string) => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  },
  getFaviconUrl: (url: string) => `https://www.google.com/s2/favicons?domain=${url}&sz=32`,
  EXPIRY_OPTIONS: [
    { value: "24h", label: "24 hours" },
    { value: "7d", label: "7 days" },
    { value: "30d", label: "30 days" },
    { value: "never", label: "Never" },
  ] as const,
}));

describe("local-library settings flag", () => {
  it("DEFAULT_SETTINGS has localLibraryViewerEnabled === false", () => {
    expect(DEFAULT_SETTINGS.localLibraryViewerEnabled).toBe(false);
  });

  it("getSettings returns the default value when storage is empty", async () => {
    const settings = await getSettings();
    expect(settings.localLibraryViewerEnabled).toBe(false);
  });

  it("setSettings persists localLibraryViewerEnabled = true", async () => {
    const result = await setSettings({ localLibraryViewerEnabled: true });
    expect(result.success).toBe(true);

    const settings = await getSettings();
    expect(settings.localLibraryViewerEnabled).toBe(true);
    // Other fields keep their defaults.
    expect(settings.telemetryEnabled).toBe(true);
    expect(settings.shortenerEnabled).toBe(false);
  });

  it("setSettings can flip back to false", async () => {
    await setSettings({ localLibraryViewerEnabled: true });
    expect((await getSettings()).localLibraryViewerEnabled).toBe(true);

    const off = await setSettings({ localLibraryViewerEnabled: false });
    expect(off.success).toBe(true);
    expect((await getSettings()).localLibraryViewerEnabled).toBe(false);
  });
});

describe("LOCAL_LIBRARY_VIEWER_ORIGINS", () => {
  it("is the expected allowlist (read-only shape)", () => {
    expect(LOCAL_LIBRARY_VIEWER_ORIGINS).toEqual([
      "https://stash.illo.fyi",
      "http://localhost:4321",
      "http://127.0.0.1:4321",
    ]);
  });

  it("does not write to any storage area on read", async () => {
    const spy = vi.spyOn(fakeBrowser.storage.local, "set");
    await getSettings();
    expect(spy).not.toHaveBeenCalled();
  });
});
