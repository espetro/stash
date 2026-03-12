import type { Settings } from "./settings";
import { getSettings } from "./settings";

// Module-level cached settings
let cachedSettings: Settings | null = null;

/**
 * Initialize the settings cache by reading settings from localStorage.
 * This is called automatically when the module is imported.
 */
export const initSettingsCache = (): void => {
  cachedSettings = getSettings();
};

/**
 * Get cached settings from memory.
 * @returns Settings object (defaults to DEFAULT_SETTINGS if not cached)
 */
export const getCachedSettings = (): Settings => {
  return cachedSettings ?? (cachedSettings = getSettings());
};

/**
 * Invalidate the cache and reload settings from localStorage.
 * Call this after settings have been modified via setSettings().
 */
export const invalidateSettingsCache = (): void => {
  cachedSettings = null;
  initSettingsCache();
};

// Auto-initialize cache on module load
initSettingsCache();
