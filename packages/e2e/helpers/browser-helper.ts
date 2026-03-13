import { chromium, Browser, BrowserContext, Page } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

export class BrowserHelper {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private extensionPath: string;
  private usePersistentContext: boolean;

  constructor() {
    this.extensionPath = process.env.EXTENSION_PATH || 
      path.join(process.cwd(), '..', '..', 'apps', 'extension', '.output', 'chrome-mv3');
    this.usePersistentContext = true;
  }

  async launchWithExtension(): Promise<BrowserContext> {
    if (!fs.existsSync(this.extensionPath)) {
      throw new Error(`Extension not found at ${this.extensionPath}. Build first: pnpm --filter stash-extension run build`);
    }

    const absoluteExtensionPath = path.resolve(this.extensionPath);

    if (this.usePersistentContext) {
      this.context = await chromium.launchPersistentContext('', {
        channel: 'chromium',
        args: [
          `--disable-extensions-except=${absoluteExtensionPath}`,
          `--load-extension=${absoluteExtensionPath}`,
        ],
        viewport: { width: 1280, height: 720 }
      });
      return this.context;
    }

    this.browser = await chromium.launch({
      headless: process.env.HEADLESS === 'true',
      args: [
        `--disable-extensions-except=${absoluteExtensionPath}`,
        `--load-extension=${absoluteExtensionPath}`,
        '--no-sandbox'
      ]
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 }
    });

    return this.context;
  }

  async launch(): Promise<BrowserContext> {
    this.browser = await chromium.launch({
      headless: true,
      channel: 'chromium',
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 }
    });

    return this.context;
  }

  getContext(): BrowserContext {
    if (!this.context) {
      throw new Error('Browser context not initialized. Call launch() or launchWithExtension() first.');
    }
    return this.context;
  }

  getBrowser(): Browser {
    if (!this.browser) {
      throw new Error('Browser not initialized. Call launch() or launchWithExtension() first.');
    }
    return this.browser;
  }

  async newPage(): Promise<Page> {
    const context = this.getContext();
    return await context.newPage();
  }

  getPages(): Page[] {
    const context = this.getContext();
    return context.pages();
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async waitForExtensionLoad(page: Page, timeout: number = 10000): Promise<void> {
    await page.waitForTimeout(1000); // Give extension time to initialize
  }

  async getExtensionBackgroundPage(): Promise<Page | null> {
    const context = this.getContext();
    const backgroundPages = context.backgroundPages();
    
    if (backgroundPages.length > 0) {
      return backgroundPages[0];
    }

    // Try to get service worker
    const serviceWorkers = context.serviceWorkers();
    if (serviceWorkers.length > 0) {
      return serviceWorkers[0];
    }

    return null;
  }

  async mockTime(page: Page, hoursOffset: number): Promise<void> {
    await page.addInitScript((offset) => {
      const now = Date.now();
      const offsetMs = offset * 60 * 60 * 1000;
      Date.now = () => now + offsetMs;
    }, hoursOffset);
  }

  async resetTimeMock(page: Page): Promise<void> {
    await page.addInitScript(() => {
      // Restore original Date.now
      const originalDateNow = Date.prototype.getTime;
      Date.now = originalDateNow;
    });
  }

  async setViewport(width: number, height: number): Promise<void> {
    const context = this.getContext();
    await context.setViewportSize({ width, height });
  }

  async takeScreenshot(page: Page, filename: string): Promise<void> {
    const screenshotDir = path.join(process.cwd(), 'screenshots');
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
    await page.screenshot({ path: path.join(screenshotDir, filename) });
  }
}

let browserHelper: BrowserHelper | null = null;

export function getBrowserHelper(): BrowserHelper {
  if (!browserHelper) {
    browserHelper = new BrowserHelper();
  }
  return browserHelper;
}

export function resetBrowserHelper(): void {
  browserHelper = null;
}
