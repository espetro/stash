import { storage } from "#imports";
import { validateViewerOrigin } from "./validation.js";

export type ExpiryMode = "24h" | "7d" | "30d" | "never";
const BUILD_TIME_VIEWER_ORIGIN = import.meta.env.VITE_VIEWER_ORIGIN || "http://localhost:4321";

export const EXPIRY_HOURS_MAP: Record<ExpiryMode, number> = {
  "24h": 24,
  "7d": 168,
  "30d": 720,
  never: 876000,
};

export interface Settings {
  expiryMode: ExpiryMode;
  viewerOrigin: string;
}

export const DEFAULT_SETTINGS: Settings = {
  expiryMode: "never",
  viewerOrigin: BUILD_TIME_VIEWER_ORIGIN,
};

export const settingsItem = storage.defineItem<Settings>("sync:stash-settings", {
  fallback: DEFAULT_SETTINGS,
});

export const getSettings = async (): Promise<Settings> => {
  try {
    return await settingsItem.getValue();
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
  try {
    const current = await getSettings();
    const merged = { ...current, ...partial };
    await settingsItem.setValue(merged);
    return { success: true };
  } catch {
    return { success: false, error: "Failed to save settings" };
  }
};
