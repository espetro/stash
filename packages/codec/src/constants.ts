export const PAYLOAD_VERSION = 2;
export const EXPIRY_HOURS = 24;
export const BUDGET_CHARS = 8000;
export const MAX_TITLE_CHARS = 30;
export const VIEWER_ORIGIN = import.meta.env.VITE_VIEWER_ORIGIN || "http://localhost:4321";
export const VIEWER_PATH = "/s/";
export const EXPIRY_HOURS_MAP = {
  "24h": 24,
  "7d": 168,
  "30d": 720,
  never: 876000,
} as const;
