/**
 * Shared constants for the portable /s handler (F13 W1).
 * Consumed by both the portable package and the Pages Functions adapters.
 */
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

// /s responses carry payload data reconstructed from the URL; never index them.
export const NOINDEX_HEADER = { "X-Robots-Tag": "noindex" } as const;
