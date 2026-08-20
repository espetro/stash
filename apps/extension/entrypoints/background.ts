import { defineBackground } from "wxt/utils/define-background";
import { encodeTabsToShareUrl, EXPIRY_HOURS_MAP } from "@stash/codec";
import type { TabInfo } from "@stash/codec";
import { getBrotliFunctions } from "@stash/shared";
import { getSettings, settingsItem } from "../lib/settings";
import type { RuntimePort } from "../global";
import { MCP_PORT_NAME, startMcpServerOverPort } from "../lib/mcp/background-server";
import { handleBridgeRequest, isBridgeRequest } from "../lib/server/bridge";
import type { BridgeResponse } from "../lib/server/bridge";

function bridgeErrorResponse(id: number, error: unknown): BridgeResponse {
  return {
    type: "stash-bridge-response",
    id,
    status: 500,
    headers: {},
    body: JSON.stringify({ error: String(error) }),
  };
}

/** Handle a bridge request and return the response via sendResponse.
 *  The listener returns `true` to keep the message channel open for the async
 *  sendResponse; non-bridge messages return false so other listeners own them. */
function respondToBridgeRequest(
  message: unknown,
  sendResponse: (response: unknown) => void,
): boolean {
  if (!isBridgeRequest(message)) return false; // not ours; don't respond
  const { id } = message;
  handleBridgeRequest(message)
    .then(sendResponse)
    .catch((error) => sendResponse(bridgeErrorResponse(id, error)));
  return true;
}

export default defineBackground(() => {
  // MCP server over runtime ports (fresh server + transport per connection)
  browser.runtime.onConnect.addListener((port) => {
    if (port.name === MCP_PORT_NAME) {
      startMcpServerOverPort(port as unknown as RuntimePort);
    }
  });

  // Stash bridge server: external extensions via onMessageExternal,
  // content-script relay (content.ts) via onMessage.
  const bridgeListener = (
    message: unknown,
    _sender: unknown,
    sendResponse: (response: unknown) => void,
  ): true => {
    respondToBridgeRequest(message, sendResponse);
    return true; // keep channel open; respondToBridgeRequest no-ops for non-bridge messages
  };
  browser.runtime.onMessageExternal.addListener(bridgeListener);
  browser.runtime.onMessage.addListener(bridgeListener);

  settingsItem.onChanged((newValue) => {
    console.log("Settings changed:", newValue);
  });

  browser.runtime.onInstalled.addListener(async () => {
    await browser.contextMenus.removeAll();

    if (import.meta.env.FIREFOX) {
      browser.contextMenus.create({
        id: "share-tabs",
        title: "Share selected tabs…",
        contexts: ["tab"],
      });
    } else {
      browser.contextMenus.create({
        id: "share-tabs",
        title: "Share selected tabs…",
        contexts: ["action"],
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
      const settings = await getSettings();
      const expiryHours = EXPIRY_HOURS_MAP[settings.expiryMode];

      const result = await encodeTabsToShareUrl(
        tabInfos,
        brotli,
        expiryHours,
        settings.viewerOrigin,
      );

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
