import { beforeSuite, afterSuite, step } from '@getgauge/cli';
import { Page } from 'playwright';
import { getBrowserHelper, resetBrowserHelper } from '../helpers/browser-helper';

/**
 * Global page reference
 */
let currentPage: Page | null = null;

/**
 * Set the current page
 */
export function setCurrentPage(page: Page): void {
  currentPage = page;
}

/**
 * Get the current page
 */
export function getCurrentPage(): Page {
  if (!currentPage) {
    throw new Error('No current page. Initialize a page first.');
  }
  return currentPage;
}

/**
 * Before suite: Initialize browser
 */
beforeSuite(async () => {
  const browserHelper = getBrowserHelper();
  // Browser will be launched in specific step implementations
});

/**
 * After suite: Cleanup browser
 */
afterSuite(async () => {
  const browserHelper = getBrowserHelper();
  await browserHelper.close();
  resetBrowserHelper();
});

/**
 * Wait for element to be visible
 */
step('Wait for element <selector> to be visible', async (selector: string) => {
  const page = getCurrentPage();
  await page.waitForSelector(selector, { state: 'visible', timeout: 10000 });
});

/**
 * Wait for element to be attached
 */
step('Wait for element <selector> to be attached', async (selector: string) => {
  const page = getCurrentPage();
  await page.waitForSelector(selector, { state: 'attached', timeout: 10000 });
});

/**
 * Assert text content
 */
step('Element <selector> should contain text <text>', async (selector: string, text: string) => {
  const page = getCurrentPage();
  const element = await page.waitForSelector(selector, { state: 'visible' });
  const elementText = await element.textContent();
  if (!elementText || !elementText.includes(text)) {
    throw new Error(`Expected element "${selector}" to contain "${text}", but got "${elementText}"`);
  }
});

/**
 * Assert exact text content
 */
step('Element <selector> should have text <text>', async (selector: string, text: string) => {
  const page = getCurrentPage();
  const element = await page.waitForSelector(selector, { state: 'visible' });
  const elementText = await element.textContent();
  if (elementText !== text) {
    throw new Error(`Expected element "${selector}" to have text "${text}", but got "${elementText}"`);
  }
});

/**
 * Count elements
 */
step('Count of elements <selector> should be <count>', async (selector: string, countStr: string) => {
  const page = getCurrentPage();
  const count = parseInt(countStr, 10);
  const elements = await page.locator(selector).count();
  if (elements !== count) {
    throw new Error(`Expected ${count} elements matching "${selector}", but found ${elements}`);
  }
});

/**
 * Assert element is visible
 */
step('Element <selector> should be visible', async (selector: string) => {
  const page = getCurrentPage();
  const element = await page.waitForSelector(selector, { state: 'visible' });
  if (!element) {
    throw new Error(`Element "${selector}" is not visible`);
  }
});

/**
 * Assert element is not visible
 */
step('Element <selector> should not be visible', async (selector: string) => {
  const page = getCurrentPage();
  const elements = await page.locator(selector).count();
  if (elements > 0) {
    const isVisible = await page.locator(selector).isVisible();
    if (isVisible) {
      throw new Error(`Element "${selector}" should not be visible`);
    }
  }
});

/**
 * Wait for specified time
 */
step('Wait for <duration> milliseconds', async (durationStr: string) => {
  const duration = parseInt(durationStr, 10);
  await new Promise(resolve => setTimeout(resolve, duration));
});

/**
 * Wait for specified seconds
 */
step('Wait for <duration> seconds', async (durationStr: string) => {
  const duration = parseFloat(durationStr);
  await new Promise(resolve => setTimeout(resolve, duration * 1000));
});

/**
 * Navigate to URL
 */
step('Navigate to <url>', async (url: string) => {
  const page = getCurrentPage();
  await page.goto(url, { waitUntil: 'networkidle' });
});

/**
 * Click on element
 */
step('Click on element <selector>', async (selector: string) => {
  const page = getCurrentPage();
  await page.click(selector);
});

/**
 * Type text into element
 */
step('Type <text> into element <selector>', async (text: string, selector: string) => {
  const page = getCurrentPage();
  await page.fill(selector, text);
});

/**
 * Get text content from element
 */
step('Get text from element <selector> and store as <variableName>', async (selector: string, variableName: string) => {
  const page = getCurrentPage();
  const element = await page.waitForSelector(selector, { state: 'visible' });
  const text = await element.textContent();
  (global as any)[variableName] = text;
});

/**
 * Store value in global variable
 */
step('Store <value> as <variableName>', async (value: string, variableName: string) => {
  (global as any)[variableName] = value;
});

/**
 * Assert global variable equals value
 */
step('Variable <variableName> should equal <expectedValue>', async (variableName: string, expectedValue: string) => {
  const actualValue = (global as any)[variableName];
  if (actualValue !== expectedValue) {
    throw new Error(`Expected variable "${variableName}" to be "${expectedValue}", but got "${actualValue}"`);
  }
});

/**
 * Assert global variable contains value
 */
step('Variable <variableName> should contain <expectedValue>', async (variableName: string, expectedValue: string) => {
  const actualValue = (global as any)[variableName];
  if (!actualValue || !actualValue.includes(expectedValue)) {
    throw new Error(`Expected variable "${variableName}" to contain "${expectedValue}", but got "${actualValue}"`);
  }
});

/**
 * Take screenshot
 */
step('Take screenshot with name <filename>', async (filename: string) => {
  const page = getCurrentPage();
  const browserHelper = getBrowserHelper();
  await browserHelper.takeScreenshot(page, filename);
});

/**
 * Refresh page
 */
step('Refresh the page', async () => {
  const page = getCurrentPage();
  await page.reload({ waitUntil: 'networkidle' });
});

/**
 * Go back in history
 */
step('Go back', async () => {
  const page = getCurrentPage();
  await page.goBack({ waitUntil: 'networkidle' });
});

/**
 * Go forward in history
 */
step('Go forward', async () => {
  const page = getCurrentPage();
  await page.goForward({ waitUntil: 'networkidle' });
});

/**
 * Get page title
 */
step('Page title should be <expectedTitle>', async (expectedTitle: string) => {
  const page = getCurrentPage();
  const title = await page.title();
  if (title !== expectedTitle) {
    throw new Error(`Expected page title to be "${expectedTitle}", but got "${title}"`);
  }
});

/**
 * Get page URL
 */
step('Page URL should contain <expectedUrl>', async (expectedUrl: string) => {
  const page = getCurrentPage();
  const url = page.url();
  if (!url.includes(expectedUrl)) {
    throw new Error(`Expected page URL to contain "${expectedUrl}", but got "${url}"`);
  }
});

/**
 * Execute JavaScript in page
 */
step('Execute JavaScript <script>', async (script: string) => {
  const page = getCurrentPage();
  await page.evaluate(script);
});

/**
 * Get attribute value
 */
step('Get attribute <attribute> from element <selector> and store as <variableName>', async (attribute: string, selector: string, variableName: string) => {
  const page = getCurrentPage();
  const element = await page.waitForSelector(selector, { state: 'visible' });
  const value = await element.getAttribute(attribute);
  (global as any)[variableName] = value;
});

/**
 * Assert attribute value
 */
step('Element <selector> should have attribute <attribute> with value <value>', async (selector: string, attribute: string, value: string) => {
  const page = getCurrentPage();
  const element = await page.waitForSelector(selector, { state: 'visible' });
  const actualValue = await element.getAttribute(attribute);
  if (actualValue !== value) {
    throw new Error(`Expected element "${selector}" to have attribute "${attribute}" with value "${value}", but got "${actualValue}"`);
  }
});

/**
 * Assert element is enabled
 */
step('Element <selector> should be enabled', async (selector: string) => {
  const page = getCurrentPage();
  const element = await page.waitForSelector(selector, { state: 'visible' });
  const isEnabled = await element.isEnabled();
  if (!isEnabled) {
    throw new Error(`Element "${selector}" should be enabled`);
  }
});

/**
 * Assert element is disabled
 */
step('Element <selector> should be disabled', async (selector: string) => {
  const page = getCurrentPage();
  const element = await page.waitForSelector(selector, { state: 'visible' });
  const isEnabled = await element.isEnabled();
  if (isEnabled) {
    throw new Error(`Element "${selector}" should be disabled`);
  }
});
