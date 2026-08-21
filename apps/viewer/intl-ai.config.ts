// Load env vars from the repo-root `.env` so this works without
// requiring the caller to `source .env` first. Node 22+ has
// `process.loadEnvFile()` built-in (no extra dep needed).
process.loadEnvFile?.("../../.env");

/** @type {import("@intl-ai/api").IntlAiConfig} */
export default {
  defaultLocale: "en",
  locales: ["en", "es", "ru", "fr"],
  localeDir: "./src/i18n/messages",
  provider: "openai",
  model: process.env.OPENROUTER_MODEL_ID ?? "openai/gpt-4o-mini",
  apiKey: process.env.OPENROUTER_API_KEY ?? "",
  baseURL: "https://openrouter.ai/api/v1",
  processor: "icu",
};
