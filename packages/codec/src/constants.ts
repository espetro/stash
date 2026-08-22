/**
 * Current payload schema version. v6 is a superset of v5: adds optional
 * top-level `g` (tags) and `n` (note) fields. v5 is a superset of v4: items
 * gain an optional third tuple element `kind` ("url" | "note"). v4/v5 remain
 * decode-only legacy for links already in the wild.
 */
export const PAYLOAD_VERSION = 6;
export const EXPIRY_HOURS = 24;
export const BUDGET_CHARS = 8000;
export const MAX_TITLE_CHARS = 120;
export const COMPRESSION_THRESHOLD = 200;
export const VIEWER_ORIGIN =
  (import.meta as ImportMeta & { env?: { VITE_VIEWER_ORIGIN?: string } }).env?.VITE_VIEWER_ORIGIN ||
  "https://stash.illo.fyi";
export const VIEWER_PATH = "/s/";
export const EXPIRY_HOURS_MAP = {
  "24h": 24,
  "7d": 168,
  "30d": 720,
  never: 876000,
} as const;
