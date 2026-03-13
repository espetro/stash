export type ExpiryMode = "24h" | "7d" | "30d" | "never";

const SETTINGS_STORAGE_KEY = "tabshare-settings" as const;
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

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  expiryMode: "never",
  viewerOrigin: BUILD_TIME_VIEWER_ORIGIN,
} as const;

export const getSettings = (): Settings => {
  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!stored) {
      return DEFAULT_SETTINGS;
    }
    const parsed = JSON.parse(stored) as unknown;
    if (parsed && typeof parsed === "object" && parsed !== null) {
      const mode = "expiryMode" in parsed ? parsed.expiryMode : undefined;
      const origin = "viewerOrigin" in parsed ? parsed.viewerOrigin : undefined;

      const validMode =
        typeof mode === "string" && EXPIRY_HOURS_MAP[mode as ExpiryMode] !== undefined
          ? (mode as ExpiryMode)
          : DEFAULT_SETTINGS.expiryMode;

      const validOrigin =
        typeof origin === "string" && origin.trim() !== "" ? origin : DEFAULT_SETTINGS.viewerOrigin;

      return {
        expiryMode: validMode,
        viewerOrigin: validOrigin,
      };
    }
    return DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
};

export const setSettings = (partial: Partial<Settings>): void => {
  try {
    const current = getSettings();
    const merged = { ...current, ...partial };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // Silent fail if localStorage is not available
  }
};
