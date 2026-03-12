import { chromium, Browser, BrowserContext, Page, chromium as ChromiumType } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Browser helper class for managing browser instances with extension loading
 */
export class BrowserHelper {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private extensionPath: string;

  constructor() {
    // Default extension path - can be overridden via environment variable
    this.extensionPath = process.env.EXTENSION_PATH || 
      path.join(process.cwd(), '..', 'extension', '.output', 'chrome-mv3');
  }

  /**
   * Launch browser with Stash extension loaded
   */
  async launchWithExtension(): Promise<BrowserContext> {
    // Check if extension exists
    if (!fs.existsSync(this.extensionPath)) {
      throw new Error(`Extension not found at ${this.extensionPath}. Please build the extension first.`);
    }

    // Resolve extension path to absolute path
    const absoluteExtensionPath = path.resolve(this.extensionPath);

    // Launch browser with extension
    this.browser = await chromium.launch({
      headless: process.env.HEADLESS === 'true',
      args: [
        `--disable-extensions-except=${absoluteExtensionPath}`,
        `--load-extension=${absoluteExtensionPath}`,
        '--no-sandbox'
      ]
    });

    // Create context
    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 }
    });

    return this.context;
  }

  /**
   * Launch browser without extension (for viewer testing)
   */
  async launch(): Promise<BrowserContext> {
    this.browser = await chromium.launch({
      headless: process.env.HEADLESS === 'true'
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 }
    });

    return this.context;
  }

  /**
   * Get the current browser context
   */
  getContext(): BrowserContext {
    if (!this.context) {
      throw new Error('Browser context not initialized. Call launch() or launchWithExtension() first.');
    }
    return this.context;
  }

  /**
   * Get the current browser instance
   */
  getBrowser(): Browser {
    if (!this.browser) {
      throw new Error('Browser not initialized. Call launch() or launchWithExtension() first.');
    }
    return this.browser;
  }

  /**
   * Create a new page
   */
  async newPage(): Promise<Page> {
    const context = this.getContext();
    return await context.newPage();
  }

  /**
   * Get all pages in the context
   */
  getPages(): Page[] {
    const context = this.getContext();
    return context.pages();
  }

  /**
   * Close the browser
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
    }
  }

  /**
   * Wait for extension to be loaded
   */
  async waitForExtensionLoad(page: Page, timeout: number = 10000): Promise<void> {
    await page.waitForTimeout(1000); // Give extension time to initialize
  }

  /**
   * Get extension background page
   */
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

  /**
   * Mock time for testing expiry
   */
  async mockTime(page: Page, hoursOffset: number): Promise<void> {
    await page.addInitScript((offset) => {
      const now = Date.now();
      const offsetMs = offset * 60 * 60 * 1000;
      Date.now = () => now + offsetMs;
    }, hoursOffset);
  }

  /**
   * Reset time mock
   */
  async resetTimeMock(page: Page): Promise<void> {
    await page.addInitScript(() => {
      // Restore original Date.now
      const originalDateNow = Date.prototype.getTime;
      Date.now = originalDateNow;
    });
  }

  /**
   * Set viewport size
   */
  async setViewport(width: number, height: number): Promise<void> {
    const context = this.getContext();
    await context.setViewportSize({ width, height });
  }

  /**
   * Take screenshot for debugging
   */
  async takeScreenshot(page: Page, filename: string): Promise<void> {
    const screenshotDir = path.join(process.cwd(), 'screenshots');
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
    await page.screenshot({ path: path.join(screenshotDir, filename) });
  }
}

// Global browser helper instance
let browserHelper: BrowserHelper | null = null;

/**
 * Get or create the global browser helper instance
 */
export function getBrowserHelper(): BrowserHelper {
  if (!browserHelper) {
    browserHelper = new BrowserHelper();
  }
  return browserHelper;
}

/**
 * Reset the global browser helper instance
 */
export function resetBrowserHelper(): void {
  browserHelper = null;
}
