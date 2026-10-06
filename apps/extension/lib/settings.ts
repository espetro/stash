import { StorageItem } from "webext-storage";
import { validateViewerOrigin } from "./validation.js";

export type ExpiryMode = "24h" | "7d" | "30d" | "never";
export const BUILD_TIME_VIEWER_ORIGIN =
  import.meta.env.VITE_VIEWER_ORIGIN || "https://stash.illo.fyi";
export const BUILD_TIME_SHORTENER_ORIGIN =
  import.meta.env.VITE_SHORTENER_ORIGIN || "https://s.illo.fyi";

/**
 * Origins allowed to read the local stash library via the content-script
 * bridge. Exact match (no prefix); anything not in this list is rejected.
 * `stash.illo.fyi` is the production viewer; the two loopback origins let
 * `pnpm dev` (Astro at http://localhost:4321) talk to the bridge while
 * developing.
 */
export const LOCAL_LIBRARY_VIEWER_ORIGINS: readonly string[] = [
  "https://stash.illo.fyi",
  "http://localhost:4321",
  "http://127.0.0.1:4321",
];

export const EXPIRY_HOURS_MAP: Record<ExpiryMode, number> = {
  "24h": 24,
  "7d": 168,
  "30d": 720,
  never: 876000,
};

export interface Settings {
  expiryMode: ExpiryMode;
  viewerOrigin: string;
  shortenerOrigin: string;
  shortenerEnabled: boolean;
  telemetryEnabled: boolean;
  /**
   * Expose this profile's local stash library to `/stashes` on the
   * configured viewer origin via a content-script postMessage bridge.
   *
   * Lives in `browser.storage.sync`, so it roams with the browser
   * account; the options page surfaces this explicitly.
   */
  localLibraryViewerEnabled: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  expiryMode: "never",
  viewerOrigin: BUILD_TIME_VIEWER_ORIGIN,
  shortenerOrigin: BUILD_TIME_SHORTENER_ORIGIN,
  shortenerEnabled: false,
  telemetryEnabled: true,
  localLibraryViewerEnabled: false,
};

export const settingsItem = new StorageItem<Settings>("stash-settings", {
  area: "sync",
  defaultValue: DEFAULT_SETTINGS,
});

export const getSettings = async (): Promise<Settings> => {
  try {
    return (await settingsItem.get()) ?? DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
};

export const setSettings = async (
  partial: Partial<Settings>,
): Promise<{ success: boolean; error?: string }> => {
  if (partial.viewerOrigin !== undefined) {
    const validation = validateViewerOrigin(partial.viewerOrigin);
    if (!validation.success) {
      return { success: false, error: validation.error };
    }
  }
  if (partial.shortenerOrigin !== undefined) {
    const validation = validateViewerOrigin(partial.shortenerOrigin);
    if (!validation.success) {
      return { success: false, error: validation.error };
    }
  }
  try {
    const current = await getSettings();
    const merged = { ...current, ...partial };
    await settingsItem.set(merged);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to save settings" };
  }
};
