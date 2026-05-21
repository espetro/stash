export * from "./types.js";
export * from "./constants.js";
export * from "./encoder.js";
export * from "./decoder.js";
export * from "./base64.js";
export * from "./payload.js";
export * from "./adapters/url-adapter.js";
export * from "./adapters/qr-adapter.js";

// Explicit re-exports for bundler compatibility
export { findMaxTabsWithinBudget } from "./encoder.js";
