import { browser } from "wxt/browser";
import type { StashExportRecord } from "@stash/shared/agent-export";
import { setPendingImport } from "./pending-import";

export const LIBRARY_PAGE_PATH = "/library.html";

export const OPEN_LIBRARY_MESSAGE = "stash:ext:open-library";

/** Records parked for the pending-import banner on the Library page. */
export interface OpenLibraryHandoff {
  records: StashExportRecord[];
  source: string;
}

interface OpenLibraryMessage {
  type: typeof OPEN_LIBRARY_MESSAGE;
  hash?: string;
  handoff?: OpenLibraryHandoff;
}

export function isOpenLibraryMessage(value: unknown): value is OpenLibraryMessage {
  if (typeof value !== "object" || value === null) return false;
  return (value as { type?: unknown }).type === OPEN_LIBRARY_MESSAGE;
}

function isExtensionPageContext(): boolean {
  // Extension pages (popup, library, background worker) expose the full
  // tabs API; content scripts run on http(s) pages and must relay through
  // the background worker. The `-extension:` suffix covers both
  // chrome-extension:// and moz-extension://.
  return globalThis.location?.protocol?.endsWith("-extension:") ?? false;
}

async function openFromExtension(hash?: string, handoff?: OpenLibraryHandoff): Promise<void> {
  if (handoff) {
    await setPendingImport({
      records: handoff.records,
      source: handoff.source,
      receivedAt: Date.now(),
    });
  }
  const url = browser.runtime.getURL(`${LIBRARY_PAGE_PATH}${hash ?? ""}` as `/` & string);
  await browser.tabs.create({ url });
}

/**
 * Open the extension's unlisted Library page. From a content script this
 * relays through `OPEN_LIBRARY_MESSAGE` to the background worker, which
 * runs `openLibraryRelay` below; from extension contexts it opens the tab
 * directly (and writes the pending-import slot itself when a viewer
 * handoff payload is attached).
 */
export async function openLibraryPage(hash?: string, handoff?: OpenLibraryHandoff): Promise<void> {
  if (isExtensionPageContext()) {
    await openFromExtension(hash, handoff);
    return;
  }
  await browser.runtime.sendMessage({
    type: OPEN_LIBRARY_MESSAGE,
    hash,
    handoff,
  } satisfies OpenLibraryMessage);
}

/**
 * Background-side handler for `OPEN_LIBRARY_MESSAGE`. Register inside the
 * background entrypoint; `sender.id` is checked by the caller.
 */
export async function openLibraryRelay(message: OpenLibraryMessage): Promise<{ ok: true }> {
  const hash = typeof message.hash === "string" ? message.hash : "";
  const handoff =
    message.handoff && Array.isArray(message.handoff.records)
      ? { records: message.handoff.records, source: String(message.handoff.source ?? "") }
      : undefined;
  await openFromExtension(hash, handoff);
  return { ok: true };
}
