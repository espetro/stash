/**
 * Playwright-based browser helpers.
 *
 * Two launch paths:
 *  - sharedLaunch()          -> plain chromium browser reused across
 *                               scenarios; returns a fresh context
 *  - launchWithExtension()   -> launchPersistentContext with the Stash
 *                               MV3 extension loaded (each call returns
 *                               its own browser; expensive)
 *
 * Memory note: launching a fresh Chromium browser per scenario runs the
 * 8GB-RAM laptop out of memory quickly. `sharedLaunch()` keeps a single
 * Chromium process alive for the lifetime of the worker and only spins
 * up a new context per scenario. The trade-off is that contexts are
 * closed individually so each test still gets a clean slate, but the
 * browser process itself (the bulk of the RSS) is reused.
 *
 * Both return a context; callers are responsible for closing it (typically
 * the worker fixture). The extension launch uses `chromium` channel so
 * MV3 service workers are supported; `headless: "new"` keeps the test
 * fast.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { chromium } from "playwright";
import type { Browser, BrowserContext, Page } from "playwright";
import { cleanupBrowserOSProfile, seedBrowserOSOpenRouterProfile } from "./browseros-profile.js";

// Load the ROOT .env (pnpm-workspace root) so BROWSEROS_OPENROUTER=1 runs
// can pick up OPENROUTER_API_KEY / OPENROUTER_MODEL_ID without callers
// having to export them by hand.
loadEnv({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

const DEFAULT_EXTENSION_PATH = path.join(
  process.cwd(),
  "..",
  "..",
  "apps",
  "extension",
  ".output",
  "chrome-mv3",
);

export function extensionPath(): string {
  return process.env.EXTENSION_PATH || DEFAULT_EXTENSION_PATH;
}

export function headless(): boolean {
  return process.env.HEADLESS !== "false";
}

/**
 * Known macOS .app bundles, keyed by the `BROWSER_LABEL` value used to
 * select them. `executableName` defaults to `bundleName` (true for every
 * Chromium-based app observed so far).
 */
const KNOWN_MAC_APPS: Record<string, { bundleName: string; executableName?: string }> = {
  chrome: { bundleName: "Google Chrome", executableName: "Google Chrome" },
  browseros: { bundleName: "BrowserOS" },
};

/**
 * Locate a macOS .app's executable by checking the per-user Applications
 * folder before the system-wide one — matches how a user would install an
 * app without admin rights (BrowserOS lands in `~/Applications` on some
 * machines, `/Applications` on others). Returns undefined if not found so
 * callers can fall back to Playwright's managed chromium; never hardcodes
 * a path, so this works unmodified on any macOS device.
 */
function locateMacApp(bundleName: string, executableName = bundleName): string | undefined {
  if (process.platform !== "darwin") return undefined;
  const searchRoots = [path.join(os.homedir(), "Applications"), "/Applications"];
  for (const root of searchRoots) {
    const candidate = path.join(root, `${bundleName}.app`, "Contents", "MacOS", executableName);
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

/**
 * Resolve the browser binary to launch: an explicit `BROWSER_EXECUTABLE_PATH`
 * wins outright; otherwise, if `BROWSER_LABEL` names a known app (e.g.
 * `browseros`), auto-discover it via `locateMacApp`. Returns undefined
 * (falling back to Playwright's managed chromium) when neither resolves.
 */
export function browserExecutablePath(): string | undefined {
  if (process.env.BROWSER_EXECUTABLE_PATH) return process.env.BROWSER_EXECUTABLE_PATH;
  const label = process.env.BROWSER_LABEL;
  if (!label) return undefined;
  const known = KNOWN_MAC_APPS[label];
  if (!known) return undefined;
  return locateMacApp(known.bundleName, known.executableName);
}

export function browserLabel(): string {
  return process.env.BROWSER_LABEL || (browserExecutablePath() ? "custom" : "chromium");
}

// Module-level singleton: one chromium browser for the whole worker.
// `fullyParallel: false` in playwright.config guarantees a single
// worker process, so this is effectively per-test-run.
let _sharedBrowser: Browser | null = null;

/** Lazily start the shared chromium browser. */
export async function getSharedBrowser(): Promise<Browser> {
  if (_sharedBrowser && _sharedBrowser.isConnected()) return _sharedBrowser;
  const execPath = browserExecutablePath();
  const channelOrExecutable = execPath
    ? { executablePath: execPath }
    : { channel: "chromium" as const };
  _sharedBrowser = await chromium.launch({
    ...channelOrExecutable,
    headless: headless(),
    // Memory caps on Chromium itself. Default values are tuned for
    // desktops with much more RAM than 8GB laptops; tighten here.
    args: [
      "--disable-dev-shm-usage",
      "--disable-features=Translate,BackForwardCache,AcceptCHFrame",
      "--no-zygote",
    ],
  });
  return _sharedBrowser;
}

/** Open a fresh context on the shared browser. Callers must close it. */
export async function sharedLaunch(): Promise<BrowserContext> {
  const browser = await getSharedBrowser();
  return browser.newContext({ viewport: { width: 1280, height: 720 } });
}

/** Tear down the shared browser (call from a worker fixture's teardown). */
export async function closeSharedBrowser(): Promise<void> {
  if (_sharedBrowser) {
    await _sharedBrowser.close().catch(() => undefined);
    _sharedBrowser = null;
  }
}

/**
 * Backwards-compat alias — older code calls `launch()` to mean "give me
 * a context I can use". Same semantics as `sharedLaunch()` under the
 * new memory-friendly model.
 */
export async function launch(): Promise<BrowserContext> {
  return sharedLaunch();
}

/**
 * When BROWSEROS_OPENROUTER=1 and we're targeting BrowserOS, seed a fresh
 * isolated userDataDir whose built-in-agent provider is pinned to
 * OpenRouter (via OPENROUTER_API_KEY / OPENROUTER_MODEL_ID from the root
 * .env) so runs are reproducible across machines instead of depending on
 * whatever provider the developer has configured in their personal
 * BrowserOS profile. Returns `""` (Playwright's ephemeral temp-profile
 * convention) for every other case, preserving prior behavior.
 */
// Tracks seeded BrowserOS profile dirs so closeContext() can remove them
// (they hold a live OpenRouter key on disk, unlike Playwright's ephemeral
// "" profiles which it cleans up itself). Also swept on process exit as a
// safety net if a run crashes before closeContext runs.
const seededProfileDirs = new Set<string>();
process.once("exit", () => {
  for (const dir of seededProfileDirs) cleanupBrowserOSProfile(dir);
});

function resolveUserDataDir(): string {
  if (browserLabel() !== "browseros" || process.env.BROWSEROS_OPENROUTER !== "1") return "";
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "BROWSEROS_OPENROUTER=1 requires OPENROUTER_API_KEY (root .env or environment).",
    );
  }
  const dir = seedBrowserOSOpenRouterProfile({ apiKey, modelId: process.env.OPENROUTER_MODEL_ID });
  seededProfileDirs.add(dir);
  return dir;
}

/**
 * Launch a persistent chromium context with the Stash extension loaded.
 * Persistent contexts are required for MV3 service workers.
 */
export async function launchWithExtension(): Promise<BrowserContext> {
  const ext = extensionPath();
  if (!fs.existsSync(ext)) {
    throw new Error(
      `Extension not found at ${ext}. Build first: pnpm --filter stash-extension run build`,
    );
  }
  const absExt = path.resolve(ext);
  const execPath = browserExecutablePath();
  const channelOrExecutable = execPath
    ? { executablePath: execPath }
    : { channel: "chromium" as const };
  const userDataDir = resolveUserDataDir();
  const context = await chromium.launchPersistentContext(userDataDir, {
    ...channelOrExecutable,
    headless: headless(),
    args: [`--disable-extensions-except=${absExt}`, `--load-extension=${absExt}`],
    viewport: { width: 1280, height: 720 },
  });
  // launchPersistentContext returns a context that owns the browser
  // process internally — close() handles both.
  return context;
}

export async function closeContext(context: BrowserContext): Promise<void> {
  await context.close();
  const browser = (context as BrowserContext & { _browser?: Browser })._browser;
  if (browser) await browser.close();
  for (const dir of seededProfileDirs) {
    cleanupBrowserOSProfile(dir);
    seededProfileDirs.delete(dir);
  }
}

/** Pick the extension id from the loaded extension's background pages. */
export async function getExtensionId(context: BrowserContext): Promise<string> {
  // MV3: the background is a service worker, not a background page.
  const sws = context.serviceWorkers();
  if (sws.length > 0) {
    const match = sws[0].url().match(/chrome-extension:\/\/([a-z]{32})\//);
    if (match) return match[1];
  }
  try {
    const sw =
      sws[0] ?? (await context.waitForEvent("serviceworker", { timeout: 10000 }).catch(() => null));
    if (sw) {
      const match = sw.url().match(/chrome-extension:\/\/([a-z]{32})\//);
      if (match) return match[1];
    }
  } catch {
    /* fall through to page probing */
  }
  const bgPages = context.backgroundPages();
  if (bgPages.length > 0) {
    const url = bgPages[0].url();
    const match = url.match(/chrome-extension:\/\/([a-z]{32})\//);
    if (match) return match[1];
  }
  const pages = context.pages();
  for (const page of pages) {
    try {
      const id = await page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c = (globalThis as any).chrome;
        if (c && c.runtime && c.runtime.id) return c.runtime.id as string;
        return null;
      });
      if (id) return id;
    } catch {
      /* ignore — page may not be ready */
    }
  }
  // The fallback id is the well-known placeholder used elsewhere in
  // the codebase; preserves existing test behavior.
  return "abcdefghijklmnopabcdefghijklmnop";
}

/**
 * Mock Date.now() in the page so expiry-style assertions can fast-forward
 * without waiting real time. The override is installed via an init script
 * so it survives navigation.
 */
export async function mockTime(page: Page, hoursOffset: number): Promise<void> {
  await page.addInitScript((offsetHours) => {
    const now = Date.now();
    const offsetMs = offsetHours * 60 * 60 * 1000;
    Date.now = () => now + offsetMs;
  }, hoursOffset);
}
