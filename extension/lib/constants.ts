export const PAYLOAD_VERSION = 1;
export const EXPIRY_HOURS = 24;
export const BUDGET_CHARS = 8000;
export const MAX_TITLE_CHARS = 30;
export const VIEWER_ORIGIN = ((import.meta.env.VITE_VIEWER_ORIGIN as string) || 'http://localhost:4321').replace(/\/$/, '');
export const VIEWER_PATH = '/s/';
