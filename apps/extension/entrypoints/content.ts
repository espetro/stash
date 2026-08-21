import { defineContentScript } from "wxt/utils/define-content-script";

/**
 * Stash bridge relay: forwards `stash-bridge-request` window.postMessage
 * payloads to the background service worker via browser.runtime.sendMessage,
 * and relays the bridge response back to the page via window.postMessage.
 */
export default defineContentScript({
  matches: ["https://stash.illo.fyi/*"],
  main() {
    window.addEventListener("message", (event: MessageEvent) => {
      // Ignore messages from other windows/frames and our own postMessage echoes.
      if (event.source !== window) return;
      const data: unknown = event.data;
      if (typeof data !== "object" || data === null) return;
      if ((data as { type?: unknown }).type !== "stash-bridge-request") return;

      browser.runtime
        .sendMessage(data)
        .then((response: unknown) => {
          if (
            typeof response === "object" &&
            response !== null &&
            (response as { type?: unknown }).type === "stash-bridge-response"
          ) {
            window.postMessage(response, "*");
          }
        })
        .catch((error) => {
          // Relay failures (e.g. extension context invalidated) are dropped;
          // the page client owns request timeouts.
          console.warn("stash bridge relay failed:", error);
        });
    });
  },
});
