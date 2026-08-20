export const MAX_PAYLOAD_CHARS = 8000;
export const ID_RE = /^[A-Z2-7]{6}$/;

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
} as const;
