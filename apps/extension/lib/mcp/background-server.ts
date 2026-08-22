import { ChromePortTransport } from "./ChromePortTransport";
import { startMcpServerOverTransport } from "./server";

import type { RuntimePort } from "../../global.d";
import { MCP_PORT_NAME } from "./constants";
export { MCP_PORT_NAME };

/**
 * Externally_connectable allowlist — must stay in sync with
 * `apps/extension/wxt.config.ts` `manifest.externally_connectable.ids`.
 *
 * Mirrors `chrome.runtime.Port.sender.id` for connecting extensions; a
 * peer whose `id` isn't in this list is rejected at the background
 * listener, regardless of what the manifest says.
 */
export const ALLOWED_EXTENSION_IDS: readonly string[] = [
  "mhipkdochajohklmmjinmicahanmldbj", // MCP-B production extension
] as const;

/**
 * Allowlist of web origins that may talk to the background MCP server
 * when the connection originates from a content script / page
 * (`port.sender.url` set, no extension id). Mirrors
 * `manifest.externally_connectable.matches`. Localhost variants are
 * included for the local stdio relay (PR5); the production viewer
 * origin (`stash.illo.fyi`) is reachable from web pages but currently
 * no page code connects to the runtime port — kept here so any future
 * viewer-side MCP client can attach without a config bump.
 *
 * Each entry is parsed as a URL; the *scheme* and *hostname* are used
 * to gate incoming senders (port is intentionally ignored to match the
 * manifest's match-pattern semantics, where `http://localhost/*`
 * permits any port).
 */
export const ALLOWED_ORIGINS: readonly string[] = [
  "https://stash.illo.fyi",
  "http://localhost",
  "http://127.0.0.1",
] as const;

/**
 * Decide whether an incoming runtime port is allowed to talk to the
 * background MCP server. Returns `true` iff the sender's extension id
 * is on `ALLOWED_EXTENSION_IDS`, or the sender's page URL has a
 * scheme + hostname matching one of `ALLOWED_ORIGINS` (port is
 * intentionally ignored, mirroring the externally_connectable manifest
 * match-pattern behaviour).
 */
export function isSenderAllowed(port: RuntimePort): boolean {
  const sender = port.sender;
  if (!sender) return false;

  if (sender.id) {
    return ALLOWED_EXTENSION_IDS.includes(sender.id);
  }

  if (sender.url) {
    let parsed: URL;
    try {
      parsed = new URL(sender.url);
    } catch {
      return false;
    }
    return (ALLOWED_ORIGINS as readonly string[]).some((allowed) => {
      try {
        const allowedUrl = new URL(allowed);
        return allowedUrl.protocol === parsed.protocol
          && allowedUrl.hostname === parsed.hostname;
      } catch {
        return false;
      }
    });
  }

  return false;
}

/** Start a fresh MCP server over an incoming runtime port. */
export function startMcpServerOverPort(port: RuntimePort): void {
  const transport = new ChromePortTransport(port);
  startMcpServerOverTransport(transport).catch((error) => {
    console.error("[mcp] failed to start server over port:", error);
    try {
      port.disconnect();
    } catch {
      // already disconnected
    }
  });
}

/**
 * Return a small string summarising `port.sender` for log lines — never
 * the whole payload, just enough to identify why a connection was rejected.
 */
export function senderDebugInfo(port: RuntimePort): string {
  const s = port.sender;
  if (!s) return "sender=<none>";
  return `id=${s.id ?? "<none>"} url=${s.url ?? "<none>"}`;
}
