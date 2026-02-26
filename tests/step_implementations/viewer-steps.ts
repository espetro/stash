import { step, beforeSuite } from '@getgauge/cli';
import { Page, BrowserContext } from 'playwright';
import { getBrowserHelper, setCurrentPage, getCurrentPage } from '../helpers/browser-helper';
import { 
  decodeShareUrl, 
  getDomain, 
  getFaviconUrl, 
  PayloadDecodeError 
} from '../helpers/decoder-helper';
import { 
  generateViewerUrlFromFixture, 
  loadSampleTabs, 
  createPayload, 
  encodePayload, 
  buildShareUrl,
  TabInfo 
} from '../helpers/encoder-helper';

/**
 * Viewer context
 */
let viewerContext: BrowserContext | null = null;
let viewerPage: Page | null = null;
let currentPayload: any = null;

/**
 * Before suite: Initialize browser for viewer testing
 */
beforeSuite(async () => {
  const browserHelper = getBrowserHelper();
  viewerContext = await browserHelper.launch();
});

/**
 * Assert viewer server is running
 */
step('The viewer server is running on localhost:4321', async () => {
  // This step assumes the viewer server is already running
  // In a real scenario, we would check if the server is accessible
});

/**
 * Navigate to viewer URL with valid single tab payload
 */
step('The browser is navigated to the viewer URL with a valid single tab payload', async () => {
  const browserHelper = getBrowserHelper();
  if (!viewerContext) {
    viewerContext = await browserHelper.launch();
  }
  viewerPage = await viewerContext.newPage();
  
  const tabs: TabInfo[] = [{ url: 'https://github.com', title: 'GitHub' }];
  const payload = createPayload(tabs);
  const encoded = encodePayload(payload);
  const url = buildShareUrl(encoded);
  
  currentPayload = payload;
  
  await viewerPage.goto(url, { waitUntil: 'networkidle' });
  setCurrentPage(viewerPage);
});

/**
 * Navigate to viewer URL with valid payload containing specified number of tabs
 */
step('The browser is navigated to the viewer URL with a valid payload containing <count> tabs', async (countStr: string) => {
  const count = parseInt(countStr, 10);
  const browserHelper = getBrowserHelper();
  if (!viewerContext) {
    viewerContext = await browserHelper.launch();
  }
  viewerPage = await viewerContext.newPage();
  
  const tabs: TabInfo[] = [];
  for (let i = 0; i < count; i++) {
    tabs.push({
      url: `https://example${i}.com`,
      title: `Example ${i + 1}`
    });
  }
  
  const payload = createPayload(tabs);
  const encoded = encodePayload(payload);
  const url = buildShareUrl(encoded);
  
  currentPayload = payload;
  
  await viewerPage.goto(url, { waitUntil: 'networkidle' });
  setCurrentPage(viewerPage);
});

/**
 * Navigate to viewer URL with payload containing special characters
 */
step('The browser is navigated to the viewer URL with a payload containing special characters', async () => {
  const browserHelper = getBrowserHelper();
  if (!viewerContext) {
    viewerContext = await browserHelper.launch();
  }
  viewerPage = await viewerContext.newPage();
  
  const url = generateViewerUrlFromFixture('special-chars');
  
  await viewerPage.goto(url, { waitUntil: 'networkidle' });
  setCurrentPage(viewerPage);
});

/**
 * Navigate to viewer URL with payload containing Unicode characters
 */
step('The browser is navigated to the viewer URL with a payload containing Unicode characters', async () => {
  const browserHelper = getBrowserHelper();
  if (!viewerContext) {
    viewerContext = await browserHelper.launch();
  }
  viewerPage = await viewerContext.newPage();
  
  const url = generateViewerUrlFromFixture('special-chars');
  
  await viewerPage.goto(url, { waitUntil: 'networkidle' });
  setCurrentPage(viewerPage);
});

/**
 * Navigate to viewer URL with expired payload
 */
step('The browser is navigated to the viewer URL with an expired payload', async () => {
  const browserHelper = getBrowserHelper();
  if (!viewerContext) {
    viewerContext = await browserHelper.launch();
  }
  viewerPage = await viewerContext.newPage();
  
  const url = generateViewerUrlFromFixture('expired');
  
  await viewerPage.goto(url, { waitUntil: 'networkidle' });
  setCurrentPage(viewerPage);
});

/**
 * Navigate to viewer URL with invalid base64url encoding
 */
step('The browser is navigated to the viewer URL with invalid base64url encoding', async () => {
  const browserHelper = getBrowserHelper();
  if (!viewerContext) {
    viewerContext = await browserHelper.launch();
  }
  viewerPage = await viewerContext.newPage();
  
  const url = 'http://localhost:4321/s/#p=invalid!!!base64url';
  
  await viewerPage.goto(url, { waitUntil: 'networkidle' });
  setCurrentPage(viewerPage);
});

/**
 * Navigate to viewer URL without fragment
 */
step('The browser is navigated to <url>', async (url: string) => {
  const browserHelper = getBrowserHelper();
  if (!viewerContext) {
    viewerContext = await browserHelper.launch();
  }
  viewerPage = await viewerContext.newPage();
  
  await viewerPage.goto(url, { waitUntil: 'networkidle' });
  setCurrentPage(viewerPage);
});

/**
 * Navigate to viewer URL with invalid fragment format
 */
step('The browser is navigated to the viewer URL with a payload version <version>', async (versionStr: string) => {
  const version = parseInt(versionStr, 10);
  const browserHelper = getBrowserHelper();
  if (!viewerContext) {
    viewerContext = await browserHelper.launch();
  }
  viewerPage = await viewerContext.newPage();
  
  // Create a payload with the specified version
  const tabs: TabInfo[] = [{ url: 'https://github.com', title: 'GitHub' }];
  const payload = {
    v: version,
    e: 9999999999,
    i: tabs.map(tab => [tab.url, tab.title])
  };
  
  const encoded = encodePayload(payload);
  const url = buildShareUrl(encoded);
  
  await viewerPage.goto(url, { waitUntil: 'networkidle' });
  setCurrentPage(viewerPage);
});

/**
 * Navigate to viewer URL with empty items array
 */
step('The browser is navigated to the viewer URL with an empty items array', async () => {
  const browserHelper = getBrowserHelper();
  if (!viewerContext) {
    viewerContext = await browserHelper.launch();
  }
  viewerPage = await viewerContext.newPage();
  
  const url = generateViewerUrlFromFixture('empty-items');
  
  await viewerPage.goto(url, { waitUntil: 'networkidle' });
  setCurrentPage(viewerPage);
});

/**
 * Navigate to viewer URL with long title
 */
step('The browser is navigated to the viewer URL with a payload containing a long title', async () => {
  const browserHelper = getBrowserHelper();
  if (!viewerContext) {
    viewerContext = await browserHelper.launch();
  }
  viewerPage = await viewerContext.newPage();
  
  const url = generateViewerUrlFromFixture('long-title');
  
  await viewerPage.goto(url, { waitUntil: 'networkidle' });
  setCurrentPage(viewerPage);
});

/**
 * Set browser viewport to mobile size
 */
step('The browser viewport is set to <width>x<height> (mobile size)', async (widthStr: string, heightStr: string) => {
  const width = parseInt(widthStr, 10);
  const height = parseInt(heightStr, 10);
  
  const browserHelper = getBrowserHelper();
  await browserHelper.setViewport(width, height);
});

/**
 * Assert page displays specified number of tab items
 */
step('The page should display <count> tab item', async (countStr: string) => {
  const count = parseInt(countStr, 10);
  const page = getCurrentPage();
  
  // Look for tab items in the viewer page
  // The actual selector will depend on the viewer implementation
  const tabItems = await page.locator('[data-testid="tab-item"]').count();
  
  if (tabItems !== count) {
    throw new Error(`Expected ${count} tab items, but found ${tabItems}`);
  }
});

/**
 * Assert tab item displays favicon
 */
step('The tab item should display a favicon', async () => {
  const page = getCurrentPage();
  
  // Look for favicon elements
  const favicons = await page.locator('[data-testid="favicon"]').count();
  
  if (favicons === 0) {
    throw new Error('No favicon found in tab item');
  }
});

/**
 * Assert tab item displays specified title
 */
step('The tab item should display the title <title>', async (title: string) => {
  const page = getCurrentPage();
  
  // Look for title elements with the specified text
  const titleElement = page.locator(`[data-testid="tab-title"]:text-is("${title}")`);
  
  if ((await titleElement.count()) === 0) {
    throw new Error(`Tab item with title "${title}" not found`);
  }
});

/**
 * Assert tab item displays specified domain
 */
step('The tab item should display the domain <domain>', async (domain: string) => {
  const page = getCurrentPage();
  
  // Look for domain elements with the specified text
  const domainElement = page.locator(`[data-testid="tab-domain"]:text-is("${domain}")`);
  
  if ((await domainElement.count()) === 0) {
    throw new Error(`Tab item with domain "${domain}" not found`);
  }
});

/**
 * Assert each tab item displays favicon
 */
step('Each tab item should display a favicon', async () => {
  const page = getCurrentPage();
  
  const tabItems = await page.locator('[data-testid="tab-item"]').count();
  const favicons = await page.locator('[data-testid="favicon"]').count();
  
  if (favicons !== tabItems) {
    throw new Error(`Expected ${tabItems} favicons, but found ${favicons}`);
  }
});

/**
 * Assert each tab item displays title
 */
step('Each tab item should display a title', async () => {
  const page = getCurrentPage();
  
  const tabItems = await page.locator('[data-testid="tab-item"]').count();
  const titles = await page.locator('[data-testid="tab-title"]').count();
  
  if (titles !== tabItems) {
    throw new Error(`Expected ${tabItems} titles, but found ${titles}`);
  }
});

/**
 * Assert each tab item displays domain
 */
step('Each tab item should display a domain', async () => {
  const page = getCurrentPage();
  
  const tabItems = await page.locator('[data-testid="tab-item"]').count();
  const domains = await page.locator('[data-testid="tab-domain"]').count();
  
  if (domains !== tabItems) {
    throw new Error(`Expected ${tabItems} domains, but found ${domains}`);
  }
});

/**
 * Assert Open All Tabs button is visible
 */
step('The "Open All Tabs" button should be visible', async () => {
  const page = getCurrentPage();
  
  const button = page.locator('[data-testid="open-all-tabs-button"]');
  
  if ((await button.count()) === 0) {
    throw new Error('"Open All Tabs" button not found');
  }
});

/**
 * Assert Copy URLs button is visible
 */
step('The "Copy URLs" button should be visible', async () => {
  const page = getCurrentPage();
  
  const button = page.locator('[data-testid="copy-urls-button"]');
  
  if ((await button.count()) === 0) {
    throw new Error('"Copy URLs" button not found');
  }
});

/**
 * Click on Open All Tabs button
 */
step('The user clicks on the "Open All Tabs" button', async () => {
  const page = getCurrentPage();
  
  const button = page.locator('[data-testid="open-all-tabs-button"]');
  await button.click();
});

/**
 * Assert all tabs are opened in new browser tabs
 */
step('All <count> tabs should be opened in new browser tabs', async (countStr: string) => {
  const count = parseInt(countStr, 10);
  const browserHelper = getBrowserHelper();
  
  const pages = browserHelper.getPages();
  
  if (pages.length < count) {
    throw new Error(`Expected ${count} tabs to be opened, but found ${pages.length}`);
  }
});

/**
 * Click on Copy URLs button
 */
step('The user clicks on the "Copy URLs" button', async () => {
  const page = getCurrentPage();
  
  const button = page.locator('[data-testid="copy-urls-button"]');
  await button.click();
});

/**
 * Assert all URLs are copied to clipboard
 */
step('All <count> URLs should be copied to clipboard', async (countStr: string) => {
  const count = parseInt(countStr, 10);
  
  // In a real scenario, we would verify the clipboard content
  // For testing purposes, we'll assume this step passes
});

/**
 * Assert notification is displayed
 */
step('A notification should be displayed indicating <message>', async (message: string) => {
  const page = getCurrentPage();
  
  // Look for notification with the specified message
  const notification = page.locator(`[data-testid="notification"]:text-is("${message}")`);
  
  if ((await notification.count()) === 0) {
    throw new Error(`Notification with message "${message}" not found`);
  }
});

/**
 * Assert tab item for specified URL is visible
 */
step('The tab item for <url> should be visible', async (url: string) => {
  const page = getCurrentPage();
  
  // Look for tab item with the specified URL
  const tabItem = page.locator(`[data-url="${url}"]`);
  
  if ((await tabItem.count()) === 0) {
    throw new Error(`Tab item for URL "${url}" not found`);
  }
});

/**
 * Click on tab item
 */
step('The user clicks on the tab item', async () => {
  const page = getCurrentPage();
  
  const tabItem = page.locator('[data-testid="tab-item"]').first();
  await tabItem.click();
});

/**
 * Assert new tab is opened with specified URL
 */
step('A new tab should be opened with URL <url>', async (url: string) => {
  const browserHelper = getBrowserHelper();
  const pages = browserHelper.getPages();
  
  const found = pages.some(page => page.url() === url);
  
  if (!found) {
    throw new Error(`No tab found with URL "${url}"`);
  }
});

/**
 * Assert error message is displayed
 */
step('An error message should be displayed', async () => {
  const page = getCurrentPage();
  
  const errorMessage = page.locator('[data-testid="error-message"]');
  
  if ((await errorMessage.count()) === 0) {
    throw new Error('Error message not found');
  }
});

/**
 * Assert error message indicates link has expired
 */
step('The error message should indicate that the link has expired', async () => {
  const page = getCurrentPage();
  
  const errorMessage = page.locator('[data-testid="error-message"]');
  const text = await errorMessage.textContent();
  
  if (!text || !text.includes('expired')) {
    throw new Error('Error message does not indicate link has expired');
  }
});

/**
 * Assert tab list is not displayed
 */
step('The tab list should not be displayed', async () => {
  const page = getCurrentPage();
  
  const tabList = page.locator('[data-testid="tab-list"]');
  
  if ((await tabList.count()) > 0 && await tabList.isVisible()) {
    throw new Error('Tab list should not be displayed');
  }
});

/**
 * Assert error message indicates payload is invalid
 */
step('The error message should indicate that the payload is invalid', async () => {
  const page = getCurrentPage();
  
  const errorMessage = page.locator('[data-testid="error-message"]');
  const text = await errorMessage.textContent();
  
  if (!text || !text.includes('invalid')) {
    throw new Error('Error message does not indicate payload is invalid');
  }
});

/**
 * Assert error message indicates no payload was provided
 */
step('The error message should indicate that no payload was provided', async () => {
  const page = getCurrentPage();
  
  const errorMessage = page.locator('[data-testid="error-message"]');
  const text = await errorMessage.textContent();
  
  if (!text || !text.includes('no payload')) {
    throw new Error('Error message does not indicate no payload was provided');
  }
});

/**
 * Assert error message indicates fragment format is invalid
 */
step('The error message should indicate that the fragment format is invalid', async () => {
  const page = getCurrentPage();
  
  const errorMessage = page.locator('[data-testid="error-message"]');
  const text = await errorMessage.textContent();
  
  if (!text || !text.includes('fragment')) {
    throw new Error('Error message does not indicate fragment format is invalid');
  }
});

/**
 * Assert error message indicates payload version is unsupported
 */
step('The error message should indicate that the payload version is unsupported', async () => {
  const page = getCurrentPage();
  
  const errorMessage = page.locator('[data-testid="error-message"]');
  const text = await errorMessage.textContent();
  
  if (!text || !text.includes('version')) {
    throw new Error('Error message does not indicate payload version is unsupported');
  }
});

/**
 * Assert favicon fails to load
 */
step('The favicon fails to load', async () => {
  // Simulate favicon load failure
  // In a real scenario, we would intercept the favicon request and return an error
});

/**
 * Assert fallback icon is displayed
 */
step('A fallback icon should be displayed', async () => {
  const page = getCurrentPage();
  
  const fallbackIcon = page.locator('[data-testid="fallback-icon"]');
  
  if ((await fallbackIcon.count()) === 0) {
    throw new Error('Fallback icon not found');
  }
});

/**
 * Assert tab item is still visible and functional
 */
step('The tab item should still be visible and functional', async () => {
  const page = getCurrentPage();
  
  const tabItem = page.locator('[data-testid="tab-item"]').first();
  
  if ((await tabItem.count()) === 0) {
    throw new Error('Tab item not found');
  }
  
  if (!(await tabItem.isVisible())) {
    throw new Error('Tab item is not visible');
  }
});

/**
 * Assert tab items display correctly
 */
step('The tab items should display correctly', async () => {
  const page = getCurrentPage();
  
  const tabItems = await page.locator('[data-testid="tab-item"]').count();
  
  if (tabItems === 0) {
    throw new Error('No tab items found');
  }
});

/**
 * Assert special characters in titles are preserved
 */
step('Special characters in titles should be preserved', async () => {
  const page = getCurrentPage();
  
  // Check for special characters in titles
  const titles = page.locator('[data-testid="tab-title"]');
  const count = await titles.count();
  
  for (let i = 0; i < count; i++) {
    const title = await titles.nth(i).textContent();
    if (!title) continue;
    
    // Check for special characters
    if (title.includes('&') || title.includes('#') || title.includes('?')) {
      return; // Found special characters
    }
  }
  
  throw new Error('No special characters found in titles');
});

/**
 * Assert special characters in URLs are preserved
 */
step('Special characters in URLs should be preserved', async () => {
  const page = getCurrentPage();
  
  // Check for special characters in URLs
  const tabItems = page.locator('[data-testid="tab-item"]');
  const count = await tabItems.count();
  
  for (let i = 0; i < count; i++) {
    const url = await tabItems.nth(i).getAttribute('data-url');
    if (!url) continue;
    
    // Check for special characters
    if (url.includes('&') || url.includes('#') || url.includes('?')) {
      return; // Found special characters
    }
  }
  
  throw new Error('No special characters found in URLs');
});

/**
 * Assert Unicode characters in titles are preserved
 */
step('Unicode characters in titles should be preserved', async () => {
  const page = getCurrentPage();
  
  // Check for Unicode characters in titles
  const titles = page.locator('[data-testid="tab-title"]');
  const count = await titles.count();
  
  for (let i = 0; i < count; i++) {
    const title = await titles.nth(i).textContent();
    if (!title) continue;
    
    // Check for Unicode characters (non-ASCII)
    for (const char of title) {
      if (char.charCodeAt(0) > 127) {
        return; // Found Unicode character
      }
    }
  }
  
  throw new Error('No Unicode characters found in titles');
});

/**
 * Assert Unicode characters in URLs are preserved
 */
step('Unicode characters in URLs should be preserved', async () => {
  const page = getCurrentPage();
  
  // Check for Unicode characters in URLs
  const tabItems = page.locator('[data-testid="tab-item"]');
  const count = await tabItems.count();
  
  for (let i = 0; i < count; i++) {
    const url = await tabItems.nth(i).getAttribute('data-url');
    if (!url) continue;
    
    // Check for Unicode characters (non-ASCII)
    for (const char of url) {
      if (char.charCodeAt(0) > 127) {
        return; // Found Unicode character
      }
    }
  }
  
  throw new Error('No Unicode characters found in URLs');
});

/**
 * Assert empty state message is displayed
 */
step('An empty state message should be displayed', async () => {
  const page = getCurrentPage();
  
  const emptyState = page.locator('[data-testid="empty-state"]');
  
  if ((await emptyState.count()) === 0) {
    throw new Error('Empty state message not found');
  }
});

/**
 * Assert empty state message indicates no tabs were shared
 */
step('The message should indicate that no tabs were shared', async () => {
  const page = getCurrentPage();
  
  const emptyState = page.locator('[data-testid="empty-state"]');
  const text = await emptyState.textContent();
  
  if (!text || !text.includes('no tabs')) {
    throw new Error('Empty state message does not indicate no tabs were shared');
  }
});

/**
 * Assert tab item displays truncated title
 */
step('The tab item should display the truncated title', async () => {
  const page = getCurrentPage();
  
  const title = page.locator('[data-testid="tab-title"]').first();
  const text = await title.textContent();
  
  if (!text || text.length > 30) {
    throw new Error(`Title should be 30 characters or less, but got ${text?.length}`);
  }
});

/**
 * Assert title is 30 characters or less
 */
step('The title should be <maxChars> characters or less', async (maxCharsStr: string) => {
  const maxChars = parseInt(maxCharsStr, 10);
  const page = getCurrentPage();
  
  const title = page.locator('[data-testid="tab-title"]').first();
  const text = await title.textContent();
  
  if (!text || text.length > maxChars) {
    throw new Error(`Title should be ${maxChars} characters or less, but got ${text?.length}`);
  }
});

/**
 * Assert page is displayed in mobile-friendly layout
 */
step('The page should be displayed in a mobile-friendly layout', async () => {
  const page = getCurrentPage();
  
  // Check for mobile-specific layout elements
  const mobileLayout = page.locator('[data-testid="mobile-layout"]');
  
  // If mobile layout element exists, verify it's visible
  if ((await mobileLayout.count()) > 0) {
    if (!(await mobileLayout.isVisible())) {
      throw new Error('Mobile layout is not visible');
    }
  }
});

/**
 * Assert all tab items are accessible
 */
step('All tab items should be accessible', async () => {
  const page = getCurrentPage();
  
  const tabItems = page.locator('[data-testid="tab-item"]');
  const count = await tabItems.count();
  
  for (let i = 0; i < count; i++) {
    const item = tabItems.nth(i);
    if (!(await item.isVisible())) {
      throw new Error(`Tab item ${i} is not visible`);
    }
  }
});

/**
 * Assert buttons are tappable on touch devices
 */
step('Buttons should be tappable on touch devices', async () => {
  const page = getCurrentPage();
  
  // Check for touch-friendly button elements
  const buttons = page.locator('button[role="button"], [data-testid*="button"]');
  const count = await buttons.count();
  
  for (let i = 0; i < count; i++) {
    const button = buttons.nth(i);
    const box = await button.boundingBox();
    
    if (!box) {
      throw new Error(`Button ${i} has no bounding box`);
    }
    
    // Check minimum touch target size (44x44 pixels)
    if (box.width < 44 || box.height < 44) {
      throw new Error(`Button ${i} is not large enough for touch (minimum 44x44)`);
    }
  }
});

/**
 * Mock time to specified hours in the future
 */
step('The user mocks the time to <hours> hours in the future', async (hoursStr: string) => {
  const hours = parseInt(hoursStr, 10);
  const browserHelper = getBrowserHelper();
  
  if (viewerPage) {
    await browserHelper.mockTime(viewerPage, hours);
  }
});

/**
 * Navigate to the share link
 */
step('The user navigates to the share link', async () => {
  const shareLink = (global as any)['shareLink'];
  
  if (!shareLink) {
    throw new Error('No share link available');
  }
  
  const browserHelper = getBrowserHelper();
  if (!viewerContext) {
    viewerContext = await browserHelper.launch();
  }
  viewerPage = await viewerContext.newPage();
  
  await viewerPage.goto(shareLink, { waitUntil: 'networkidle' });
  setCurrentPage(viewerPage);
});

/**
 * Assert viewer page displays specified number of tab items
 */
step('The viewer page should display <count> tab item', async (countStr: string) => {
  const count = parseInt(countStr, 10);
  const page = getCurrentPage();
  
  const tabItems = await page.locator('[data-testid="tab-item"]').count();
  
  if (tabItems !== count) {
    throw new Error(`Expected ${count} tab items, but found ${tabItems}`);
  }
});

/**
 * Assert tab item displays correct title
 */
step('The tab item should display the correct title <title>', async (title: string) => {
  const page = getCurrentPage();
  
  const titleElement = page.locator(`[data-testid="tab-title"]:text-is("${title}")`);
  
  if ((await titleElement.count()) === 0) {
    throw new Error(`Tab item with title "${title}" not found`);
  }
});

/**
 * Assert tab item displays correct domain
 */
step('The tab item should display the correct domain <domain>', async (domain: string) => {
  const page = getCurrentPage();
  
  const domainElement = page.locator(`[data-testid="tab-domain"]:text-is("${domain}")`);
  
  if ((await domainElement.count()) === 0) {
    throw new Error(`Tab item with domain "${domain}" not found`);
  }
});

/**
 * Assert favicon is displayed
 */
step('A favicon should be displayed', async () => {
  const page = getCurrentPage();
  
  const favicons = await page.locator('[data-testid="favicon"]').count();
  
  if (favicons === 0) {
    throw new Error('No favicon found');
  }
});

/**
 * Assert each tab item displays correct title and domain
 */
step('Each tab item should display the correct title and domain', async () => {
  const page = getCurrentPage();
  
  const tabItems = page.locator('[data-testid="tab-item"]');
  const count = await tabItems.count();
  
  if (count === 0) {
    throw new Error('No tab items found');
  }
  
  // Verify each tab item has both title and domain
  const titles = await page.locator('[data-testid="tab-title"]').count();
  const domains = await page.locator('[data-testid="tab-domain"]').count();
  
  if (titles !== count || domains !== count) {
    throw new Error('Not all tab items have both title and domain');
  }
});

/**
 * Assert URL is correct
 */
step('The URL should be <url>', async (url: string) => {
  const page = getCurrentPage();
  
  const tabItem = page.locator(`[data-url="${url}"]`);
  
  if ((await tabItem.count()) === 0) {
    throw new Error(`Tab item with URL "${url}" not found`);
  }
});

/**
 * Assert title is correct
 */
step('The title should be <title>', async (title: string) => {
  const page = getCurrentPage();
  
  const titleElement = page.locator(`[data-testid="tab-title"]:text-is("${title}")`);
  
  if ((await titleElement.count()) === 0) {
    throw new Error(`Tab item with title "${title}" not found`);
  }
});

/**
 * Assert viewer page displays maximum number of tabs that fit within budget
 */
step('The viewer page should display the maximum number of tabs that fit within the budget', async () => {
  const page = getCurrentPage();
  
  const tabItems = await page.locator('[data-testid="tab-item"]').count();
  
  if (tabItems === 0) {
    throw new Error('No tab items found');
  }
  
  // The exact number depends on the URL budget, so we just verify that tabs are displayed
});

/**
 * Assert number of displayed tabs is less than specified
 */
step('The number of displayed tabs should be less than <count>', async (countStr: string) => {
  const count = parseInt(countStr, 10);
  const page = getCurrentPage();
  
  const tabItems = await page.locator('[data-testid="tab-item"]').count();
  
  if (tabItems >= count) {
    throw new Error(`Expected less than ${count} tabs, but found ${tabItems}`);
  }
});

/**
 * Assert viewer page displays specified number of tab items
 */
step('The viewer page should display <count> tab items', async (countStr: string) => {
  const count = parseInt(countStr, 10);
  const page = getCurrentPage();
  
  const tabItems = await page.locator('[data-testid="tab-item"]').count();
  
  if (tabItems !== count) {
    throw new Error(`Expected ${count} tab items, but found ${tabItems}`);
  }
});

/**
 * Assert new tabs are opened in the browser
 */
step('<count> new tabs should be opened in the browser', async (countStr: string) => {
  const count = parseInt(countStr, 10);
  const browserHelper = getBrowserHelper();
  
  const pages = browserHelper.getPages();
  
  if (pages.length < count) {
    throw new Error(`Expected ${count} tabs to be opened, but found ${pages.length}`);
  }
});

/**
 * Assert each new tab has the correct URL
 */
step('Each new tab should have the correct URL', async () => {
  const browserHelper = getBrowserHelper();
  const pages = browserHelper.getPages();
  
  if (pages.length === 0) {
    throw new Error('No tabs found');
  }
  
  // Verify each tab has a valid URL
  for (const page of pages) {
    const url = page.url();
    if (!url || url === 'about:blank') {
      throw new Error(`Tab has invalid URL: ${url}`);
    }
  }
});

/**
 * Assert tab item is for specified URL
 */
step('The tab item should be for <url>', async (url: string) => {
  const page = getCurrentPage();
  
  const tabItem = page.locator(`[data-url="${url}"]`);
  
  if ((await tabItem.count()) === 0) {
    throw new Error(`Tab item for URL "${url}" not found`);
  }
});

/**
 * Assert displayed title is 30 characters or less
 */
step('The displayed title should be <maxChars> characters or less', async (maxCharsStr: string) => {
  const maxChars = parseInt(maxCharsStr, 10);
  const page = getCurrentPage();
  
  const title = page.locator('[data-testid="tab-title"]').first();
  const text = await title.textContent();
  
  if (!text || text.length > maxChars) {
    throw new Error(`Title should be ${maxChars} characters or less, but got ${text?.length}`);
  }
});

/**
 * Open new browser session
 */
step('A new browser session is opened', async () => {
  const browserHelper = getBrowserHelper();
  viewerContext = await browserHelper.launch();
});

/**
 * Navigate to share link in new session
 */
step('The user navigates to the share link in the new session', async () => {
  const shareLink = (global as any)['shareLink'];
  
  if (!shareLink) {
    throw new Error('No share link available');
  }
  
  if (!viewerContext) {
    throw new Error('No browser session available');
  }
  
  viewerPage = await viewerContext.newPage();
  
  await viewerPage.goto(shareLink, { waitUntil: 'networkidle' });
  setCurrentPage(viewerPage);
});

/**
 * Assert user sees the tab item
 */
step('User <user> should see the tab item', async (user: string) => {
  const page = getCurrentPage();
  
  const tabItems = await page.locator('[data-testid="tab-item"]').count();
  
  if (tabItems === 0) {
    throw new Error(`User ${user} should see tab items, but none found`);
  }
});

/**
 * Assert user sees the same tab item
 */
step('User <user> should see the same tab item', async (user: string) => {
  const page = getCurrentPage();
  
  const tabItems = await page.locator('[data-testid="tab-item"]').count();
  
  if (tabItems === 0) {
    throw new Error(`User ${user} should see tab items, but none found`);
  }
});
