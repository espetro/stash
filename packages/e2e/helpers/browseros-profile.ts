/**
 * Reproducible BrowserOS AI-provider seeding for tests.
 *
 * BrowserOS (the Chromium fork under test) stores its built-in agent's LLM
 * provider config as a JSON string under the `browseros.providers` key of
 * the profile's Chromium `Preferences` file
 * (`~/Library/Application Support/BrowserOS/<Profile N>/Preferences` for a
 * normal install). Chromium keeps an existing `Preferences` file as-is on
 * first launch rather than overwriting it, so pre-seeding a *fresh, empty*
 * `userDataDir`'s `Default/Preferences` before launch is enough to pin the
 * agent to a specific provider without touching the developer's real
 * profile (which may hold live personal API keys).
 *
 * This never reads or modifies the user's real BrowserOS profile — it
 * always creates a brand-new temp `userDataDir` under the OS temp dir.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL_ID = "minimax/minimax-m2";
const PROVIDER_ID = "stash-e2e-openrouter";

export interface BrowserOSOpenRouterProfileOptions {
  apiKey: string;
  modelId?: string;
  baseUrl?: string;
}

/**
 * Create a fresh, isolated BrowserOS `userDataDir` whose default provider
 * is an `openai-compatible` entry pointed at OpenRouter. Caller owns the
 * returned directory and must remove it (see `cleanupBrowserOSProfile`).
 */
export function seedBrowserOSOpenRouterProfile(options: BrowserOSOpenRouterProfileOptions): string {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "stash-e2e-browseros-"));
  const defaultProfileDir = path.join(userDataDir, "Default");
  fs.mkdirSync(defaultProfileDir, { recursive: true });

  const now = Date.now();
  const providersConfig = {
    defaultProviderId: PROVIDER_ID,
    providers: [
      {
        id: PROVIDER_ID,
        name: "OpenRouter (stash e2e)",
        type: "openai-compatible",
        baseUrl: options.baseUrl ?? OPENROUTER_BASE_URL,
        apiKey: options.apiKey,
        modelId: options.modelId ?? DEFAULT_MODEL_ID,
        contextWindow: 128000,
        supportsImages: false,
        temperature: 0.2,
        createdAt: now,
        updatedAt: now,
      },
    ],
  };

  const preferences = {
    browseros: {
      providers: JSON.stringify(providersConfig),
    },
  };

  fs.writeFileSync(path.join(defaultProfileDir, "Preferences"), JSON.stringify(preferences));
  return userDataDir;
}

export function cleanupBrowserOSProfile(userDataDir: string): void {
  fs.rmSync(userDataDir, { recursive: true, force: true });
}
