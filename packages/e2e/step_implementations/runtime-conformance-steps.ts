/**
 * Runtime-conformance steps: the two genuinely-new assertions that
 * `agent-runtime-conformance.spec` needs and no existing spec covers.
 * Every other step in that spec reuses registrations from
 * `agent-flow-steps.ts` / `local-bridge-steps.ts` / `viewer-steps.ts`.
 */

import type { BrowserContext } from "playwright";
import { step } from "../lib/step-registry";
import { getActiveState } from "../lib/scenario-state";
import { getExtensionId } from "../helpers/browser-helper";
import { VIEWER_ORIGIN } from "../helpers/encoder-helper";
import { setCurrentPage } from "./common-steps";

/**
 * `getExtensionId` falls back to this well-known placeholder when it
 * can't detect a real extension id (no MV3 service worker, no
 * background page, no `chrome.runtime.id`). On a runtime fork with
 * broken MV3 support that fallback silently masks total failure, so
 * this step exists specifically to catch it.
 */
const FALLBACK_EXTENSION_ID = "abcdefghijklmnopabcdefghijklmnop";

function requireExtensionContext(): BrowserContext {
  const ctx = getActiveState().extensionContext;
  if (!ctx) {
    throw new Error("No extension context. Launch the extension first.");
  }
  return ctx;
}

step("The resolved extension id is not the unknown-runtime fallback", async () => {
  const ctx = requireExtensionContext();
  const id = await getExtensionId(ctx);
  if (id === FALLBACK_EXTENSION_ID) {
    throw new Error(
      `getExtensionId() returned the fallback placeholder (${FALLBACK_EXTENSION_ID}). ` +
        "This runtime likely doesn't expose an MV3 service worker, background page, " +
        "or chrome.runtime.id — the extension did not actually load.",
    );
  }
});

interface BridgeProbeResponse {
  type: string;
  version: number;
  requestId: string;
  status: "ok" | "error";
}

step("The agent probes the postMessage bridge directly on /stashes", async () => {
  const ctx = requireExtensionContext();
  const page =
    ctx.pages().find((p) => !p.url().startsWith("chrome-extension://")) ?? (await ctx.newPage());
  setCurrentPage(page);
  await page.goto(`${VIEWER_ORIGIN}/stashes`, { waitUntil: "domcontentloaded" });

  const requestId = `runtime-conformance-${Date.now()}`;
  const response = (await page.evaluate((reqId) => {
    return new Promise<unknown>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        window.removeEventListener("message", handler);
        reject(new Error("No stash:viewer:response received within 10s."));
      }, 10000);
      function handler(event: MessageEvent): void {
        const data = event.data as { type?: string; requestId?: string } | null;
        if (data && data.type === "stash:viewer:response" && data.requestId === reqId) {
          clearTimeout(timeoutId);
          window.removeEventListener("message", handler);
          resolve(data);
        }
      }
      window.addEventListener("message", handler);
      window.postMessage({ type: "stash:viewer:request", version: 1, requestId: reqId }, "*");
    });
  }, requestId)) as BridgeProbeResponse;

  if (response.type !== "stash:viewer:response" || response.requestId !== requestId) {
    throw new Error(`Unexpected bridge response: ${JSON.stringify(response)}`);
  }
  if (response.status !== "ok") {
    throw new Error(`Bridge responded with status "${response.status}", expected "ok".`);
  }
});
