export type ExpiryMode = "24h" | "7d" | "30d" | "never";

const SETTINGS_STORAGE_KEY = "tabshare-settings" as const;

export const EXPIRY_HOURS_MAP: Record<ExpiryMode, number> = {
  "24h": 24,
  "7d": 168,
  "30d": 720,
  never: 876000,
};

export const DEFAULT_SETTINGS = {
  expiryMode: "24h" as const,
};

export interface Settings {
  expiryMode: ExpiryMode;
}

export const getSettings = (): Settings => {
  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!stored) {
      return DEFAULT_SETTINGS;
    }
    const parsed = JSON.parse(stored) as unknown;
    if (parsed && typeof parsed === "object" && parsed !== null && "expiryMode" in parsed) {
      const mode = parsed.expiryMode;
      if (typeof mode === "string" && EXPIRY_HOURS_MAP[mode as ExpiryMode] !== undefined) {
        return parsed as Settings;
      }
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
