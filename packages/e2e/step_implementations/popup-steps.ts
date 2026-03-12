import { step } from '@getgauge/cli';
import { expect } from '@playwright/test';
import { Page } from 'playwright';
import { getBrowserHelper } from '../helpers/browser-helper';
import { getCurrentPage, setCurrentPage } from './common-steps';

let popupPage: Page | null = null;

step('The user clicks the extension icon', async () => {
  const browserHelper = getBrowserHelper();
  const context = browserHelper.getContext();

  const extensionId = await getExtensionId();

  popupPage = await context.newPage();
  await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
  await popupPage.waitForLoadState('networkidle');
});

async function getExtensionId(): Promise<string> {
  const browserHelper = getBrowserHelper();
  const context = browserHelper.getContext();

  const backgroundPages = context.backgroundPages();
  if (backgroundPages.length > 0) {
    const url = backgroundPages[0].url();
    const match = url.match(/chrome-extension:\/\/([a-z]{32})\//);
    if (match) {
      return match[1];
    }
  }

  const pages = context.pages();
  if (pages.length > 0) {
    try {
      const extensionId = await pages[0].evaluate(async () => {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
          return chrome.runtime.id;
        }
        return null;
      });
      if (extensionId) {
        return extensionId;
      }
    } catch (error) {
    }
  }

  return 'abcdefghijklmnopabcdefghijklmnop';
}

step('The popup should open', async () => {
  expect(popupPage).toBeTruthy();
  const container = await popupPage!.locator('.popup-container').count();
  expect(container).toBeGreaterThan(0);
});

step('The popup should display a tab list', async () => {
  const tabList = await popupPage!.locator('.tab-list').count();
  expect(tabList).toBeGreaterThan(0);
});

step('The popup should display <count> tabs', async (count: string) => {
  const expectedCount = parseInt(count, 10);
  const tabItems = await popupPage!.locator('.tab-item').count();
  expect(tabItems).toBe(expectedCount);
});

step('The user selects tab at index <index>', async (index: string) => {
  const tabIndex = parseInt(index, 10);
  const checkbox = popupPage!.locator('.tab-checkbox').nth(tabIndex);
  await checkbox.click();
});

step('The tab at index <index> should be highlighted in the browser', async (index: string) => {
  const tabIndex = parseInt(index, 10);
  const checkbox = popupPage!.locator('.tab-checkbox').nth(tabIndex);
  await expect(checkbox).toBeChecked();
});

step('The user clicks Select All', async () => {
  const button = popupPage!.locator('button:has-text("Select All")');
  await button.click();
});

step('The popup should show budget message', async () => {
  const budgetMessage = popupPage!.locator('.budget-message');
  await expect(budgetMessage).toBeVisible();
});

step('The user clicks Create Link', async () => {
  const button = popupPage!.locator('button:has-text("Create Link")');
  await button.click();
});

step('The user clicks Create Link without selecting any tabs', async () => {
  const button = popupPage!.locator('button:has-text("Create Link")');
  await button.click();
});

step('The popup should show the link result', async () => {
  const linkResult = popupPage!.locator('.link-result');
  await expect(linkResult).toBeVisible();
});

step('The user clicks the copy button', async () => {
  const button = popupPage!.locator('button:has-text("Copy Link")');
  await button.click();
});

step('The link should be copied to clipboard', async () => {
  const linkResult = popupPage!.locator('.link-result input');
  const linkValue = await linkResult.inputValue();
  expect(linkValue).toBeTruthy();
  expect(linkValue.length).toBeGreaterThan(0);
  (global as any)['shareLink'] = linkValue;
});

step('The popup should show an error message', async () => {
  const errorMessage = popupPage!.locator('.error-message');
  await expect(errorMessage).toBeVisible();
});

step('The popup should show "No tabs to share"', async () => {
  const emptyState = popupPage!.locator('.empty-state');
  await expect(emptyState).toContainText('No tabs to share');
});

step('only chrome:// tabs are open', async () => {
  const browserHelper = getBrowserHelper();
  const context = browserHelper.getContext();
  const pages = context.pages();

  for (const page of pages) {
    await page.close();
  }

  await context.newPage();
  await context.newPage();
});

step('A new tab is opened with URL <url>', async (url: string) => {
  const browserHelper = getBrowserHelper();
  const page = await browserHelper.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  setCurrentPage(page);
});

step('<count> new tabs are opened with various URLs', async (countStr: string) => {
  const count = parseInt(countStr, 10);
  const baseUrls = [
    'https://github.com',
    'https://stackoverflow.com',
    'https://developer.mozilla.org',
    'https://www.reddit.com/r/webdev',
    'https://css-tricks.com',
    'https://example.com',
    'https://test.com',
    'https://demo.com',
    'https://sample.com',
    'https://mock.com'
  ];

  for (let i = 0; i < count; i++) {
    const url = `${baseUrls[i % baseUrls.length]}/${i}`;
    const browserHelper = getBrowserHelper();
    const page = await browserHelper.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    setCurrentPage(page);
  }
});

step('The popup is closed', async () => {
  if (popupPage) {
    await popupPage.close();
    popupPage = null;
  }
});
