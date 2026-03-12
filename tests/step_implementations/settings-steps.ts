import { step } from '@getgauge/cli';
import { expect } from '@playwright/test';
import { Page } from 'playwright';
import { getBrowserHelper } from '../helpers/browser-helper';
import { getCurrentPage, setCurrentPage } from './common-steps';
import { decodeShareUrl } from '../helpers/decoder-helper';

let optionsPage: Page | null = null;
let popupPage: Page | null = null;

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

step('The user clicks the extension icon', async () => {
  const browserHelper = getBrowserHelper();
  const context = browserHelper.getContext();

  const extensionId = await getExtensionId();

  popupPage = await context.newPage();
  await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
  await popupPage.waitForLoadState('networkidle');
});

step('The user clicks the settings button', async () => {
  if (!popupPage) {
    throw new Error('Popup page is not initialized. Click extension icon first.');
  }

  const settingsButton = popupPage.locator('button[aria-label*="settings" i], button:has-text("⚙️")').first();

  if (await settingsButton.count() === 0) {
    throw new Error('Settings button not found in popup');
  }

  await settingsButton.click();
});

step('Then a new tab should open with the settings page', async () => {
  const browserHelper = getBrowserHelper();
  const context = browserHelper.getContext();

  await popupPage!.waitForTimeout(500);

  const pages = context.pages();

  const extensionId = await getExtensionId();
  const optionsUrl = `chrome-extension://${extensionId}/options.html`;

  optionsPage = pages.find(page => page.url().includes('options.html')) || null;

  if (!optionsPage) {
    throw new Error('Options page not found after clicking settings button');
  }

  await optionsPage.waitForLoadState('networkidle');
});

step('When the user navigates to the options page', async () => {
  const browserHelper = getBrowserHelper();
  const context = browserHelper.getContext();

  const extensionId = await getExtensionId();

  if (optionsPage && !optionsPage.isClosed()) {
    await optionsPage.close();
  }

  optionsPage = await context.newPage();
  await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);
  await optionsPage.waitForLoadState('networkidle');
});

step('And the user selects the "<option>" expiry option', async (option: string) => {
  if (!optionsPage) {
    throw new Error('Options page is not initialized. Navigate to options page first.');
  }

  const expirySelect = optionsPage.locator('select[name*="expiry" i], #expiry-select, .expiry-select').first();

  if (await expirySelect.count() === 0) {
    const expiryOption = optionsPage.locator(`label:has-text("${option}")`).first();

    if (await expiryOption.count() === 0) {
      throw new Error(`Expiry option "${option}" not found`);
    }

    await expiryOption.click();
  } else {
    await expirySelect.selectOption(option);
  }

  await optionsPage.waitForTimeout(100);
});

step('Then the expiry setting should be saved to localStorage', async () => {
  if (!optionsPage) {
    throw new Error('Options page is not initialized');
  }

  const expiryValue = await optionsPage.evaluate(() => {
    return localStorage.getItem('expiryHours');
  });

  if (!expiryValue) {
    throw new Error('Expiry setting not saved to localStorage');
  }
});

step('And the user selects the <theme> theme', async (theme: string) => {
  if (!optionsPage) {
    throw new Error('Options page is not initialized. Navigate to options page first.');
  }

  const themeRadio = optionsPage.locator(`input[type="radio"][name*="theme" i][value="${theme}"], input[value="${theme}"][data-theme]`).first();

  if (await themeRadio.count() === 0) {
    const themeLabel = optionsPage.locator(`label:has-text("${theme}")`).first();

    if (await themeLabel.count() === 0) {
      throw new Error(`Theme option "${theme}" not found`);
    }

    await themeLabel.click();
  } else {
    await themeRadio.check();
  }

  await optionsPage.waitForTimeout(100);
});

step('Then the theme setting should be saved to localStorage', async () => {
  if (!optionsPage) {
    throw new Error('Options page is not initialized');
  }

  const themeValue = await optionsPage.evaluate(() => {
    return localStorage.getItem('theme');
  });

  if (!themeValue) {
    throw new Error('Theme setting not saved to localStorage');
  }
});

step('And the user navigates back to a content page', async () => {
  const browserHelper = getBrowserHelper();

  if (optionsPage && !optionsPage.isClosed()) {
    await optionsPage.close();
  }

  if (popupPage && !popupPage.isClosed()) {
    await popupPage.close();
    popupPage = null;
  }

  const contentPage = await browserHelper.newPage();
  await contentPage.goto('https://example.com', { waitUntil: 'networkidle' });
  setCurrentPage(contentPage);
});

step('And the user clicks Create Link', async () => {
  if (!popupPage) {
    throw new Error('Popup page is not initialized. Click extension icon first.');
  }

  const button = popupPage.locator('button:has-text("Create Link")');
  await button.click();

  await popupPage.waitForTimeout(500);

  const linkResult = popupPage.locator('.link-result input, .link-result textarea');
  const linkValue = await linkResult.inputValue();

  if (!linkValue) {
    throw new Error('Link was not generated');
  }

  (global as any)['shareLink'] = linkValue;
});

step('Then a share link should be generated', async () => {
  const shareLink = (global as any)['shareLink'];

  if (!shareLink) {
    throw new Error('Share link was not generated');
  }
});

step('And the expiry should be approximately <hours> hours from now', async (hoursStr: string) => {
  const hours = parseInt(hoursStr, 10);
  const shareLink = (global as any)['shareLink'];

  if (!shareLink) {
    throw new Error('No share link available');
  }

  const decodedPayload = decodeShareUrl(shareLink);

  const now = Math.floor(Date.now() / 1000);
  const expectedExpiry = now + (hours * 3600);
  const tolerance = 60;

  const difference = Math.abs(decodedPayload.expiry - expectedExpiry);

  if (difference > tolerance) {
    throw new Error(`Expiry timestamp is not approximately ${hours} hours from now`);
  }
});

step('And the expiry should be greater than <hours> hours from now', async (hoursStr: string) => {
  const hours = parseInt(hoursStr, 10);
  const shareLink = (global as any)['shareLink'];

  if (!shareLink) {
    throw new Error('No share link available');
  }

  const decodedPayload = decodeShareUrl(shareLink);

  const now = Math.floor(Date.now() / 1000);
  const minimumExpiry = now + (hours * 3600);

  if (decodedPayload.expiry < minimumExpiry) {
    throw new Error(`Expiry timestamp (${decodedPayload.expiry}) is not greater than ${hours} hours from now (${minimumExpiry})`);
  }
});
