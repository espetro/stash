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
import * as path from "node:path";
import { chromium } from "playwright";
import type { Browser, BrowserContext, Page } from "playwright";

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

// Module-level singleton: one chromium browser for the whole worker.
// `fullyParallel: false` in playwright.config guarantees a single
// worker process, so this is effectively per-test-run.
let _sharedBrowser: Browser | null = null;

/** Lazily start the shared chromium browser. */
export async function getSharedBrowser(): Promise<Browser> {
  if (_sharedBrowser && _sharedBrowser.isConnected()) return _sharedBrowser;
  _sharedBrowser = await chromium.launch({
    channel: "chromium",
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
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
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
