import { defineBackground } from 'wxt/sandbox';
import { encodeTabsToShareUrl } from '../lib/encoder.js';
import type { TabInfo } from '../lib/types.js';

export default defineBackground(() => {
  // Create context menu on install
  browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus.create({
      id: 'share-tabs',
      title: 'Share selected tabs…',
      contexts: ['tab']
    });
  });

  // Handle context menu clicks
  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== 'share-tabs') return;

    try {
      // Query highlighted tabs (multi-selected)
      const tabs = await browser.tabs.query({
        highlighted: true,
        currentWindow: true
      });

      if (tabs.length === 0) return;

      // Extract tab info
      const tabInfos = tabs
        .filter(t => t.url && t.title)
        .map(t => ({ url: t.url!, title: t.title! })) as TabInfo[];

      if (tabInfos.length === 0) return;

      // Encode to share URL
      const result = encodeTabsToShareUrl(tabInfos);

      // Copy to clipboard
      await navigator.clipboard.writeText(result.url);

      // Show notification
      const message = result.truncated
        ? `Link copied! ${result.itemCount} of ${tabInfos.length} tabs shared (URL budget reached)`
        : `Link copied! ${result.itemCount} tab${result.itemCount > 1 ? 's' : ''} shared`;

      await browser.notifications.create({
        type: 'basic',
        iconUrl: browser.runtime.getURL('/icon-48.png'),
        title: 'TabShare',
        message
      });

    } catch (error) {
      console.error('Failed to share tabs:', error);
      await browser.notifications.create({
        type: 'basic',
        iconUrl: browser.runtime.getURL('/icon-48.png'),
        title: 'TabShare Error',
        message: 'Failed to create share link'
      });
    }
  });
});
