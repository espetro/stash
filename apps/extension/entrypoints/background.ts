import { defineBackground } from "wxt/sandbox";
import { encodeTabsToShareUrl } from "@stash/codec";
import type { TabInfo } from "@stash/codec";
import { getBrotliFunctions } from "../lib/brotli";
import { getSettings } from "../lib/settings";

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    if (import.meta.env.FIREFOX) {
      browser.contextMenus.create({
        id: "share-tabs",
        title: "Share selected tabs…",
        contexts: ["tab"],
      });
    }
  });

  // Handle context menu clicks
  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== "share-tabs") return;

    try {
      // Query highlighted tabs (multi-selected)
      const tabs = await browser.tabs.query({
        highlighted: true,
        currentWindow: true,
      });

      if (tabs.length === 0) return;

      // Extract tab info - only http:// and https:// URLs
      const tabInfos = tabs
        .filter((t) => t.url && t.title)
        .filter((t) => t.url!.startsWith("http://") || t.url!.startsWith("https://"))
        .map((t) => ({ url: t.url!, title: t.title! })) as TabInfo[];

      if (tabInfos.length === 0) return;

      const brotli = await getBrotliFunctions();
      const { viewerOrigin } = getSettings();

      const result = await encodeTabsToShareUrl(tabInfos, brotli, viewerOrigin);

      // Copy to clipboard
      await navigator.clipboard.writeText(result.url);

      // Show notification
      const message = result.truncated
        ? `Link copied! ${result.itemCount} of ${tabInfos.length} tabs shared (URL budget reached)`
        : `Link copied! ${result.itemCount} tab${result.itemCount > 1 ? "s" : ""} shared`;

      await browser.notifications.create({
        type: "basic",
        iconUrl: browser.runtime.getURL("/icon-48.png"),
        title: "Stash",
        message,
      });
    } catch (error) {
      console.error("Failed to share tabs:", error);
      await browser.notifications.create({
        type: "basic",
        iconUrl: browser.runtime.getURL("/icon-48.png"),
        title: "Stash Error",
        message: "Failed to create share link",
      });
    }
  });
});
