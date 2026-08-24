/**
 * Content-script bridge that serves this profile's local stash library
 * (from `browser.storage.local` via `lib/stash-store`) to the configured
 * viewer origin when the user has opted in.
 *
 * Wire format (exact-origin postMessage):
 *   request  { type: "stash:viewer:request",  version: 1, requestId: string }
 *   response { type: "stash:viewer:response", version: 1, requestId: string,
 *              status: "ok" | "error",
 *              payload?: StashExport, error?: string }
 *
 * Hard rules:
 *  - Only listens while `localLibraryViewerEnabled === true`.
 *  - Rejects everything except exact-origin messages with the request
 *    shape above; silently drops malformed/unknown messages.
 *  - Rejects replayed `requestId`s within a bounded in-memory window
 *    (LRU-ish: clear and continue past the cap, never grow unbounded).
 *  - Returns only read-only data — `toStashExport(records, "extension")`
 *    from `@stash/shared/agent-export`. No writes, no fetches, no MCP.
 *  - Never touches `browser.storage.*`, `localStorage`, or IndexedDB.
 *    The script only reads stashes from extension storage via the
 *    same module the popup/MCP use; storage writes from the viewer
 *    are impossible because the response is postMessage-only.
 */
import { defineContentScript } from "wxt/utils/define-content-script";
import { toStashExport, MAX_STASHES } from "@stash/shared/agent-export";
import { getSettings, LOCAL_LIBRARY_VIEWER_ORIGINS } from "../lib/settings";
import { listStashes } from "../lib/stash-store";

const REQ_TYPE = "stash:viewer:request";
const RES_TYPE = "stash:viewer:response";
const PROTOCOL_VERSION = 1 as const;
const REPLAY_CAP = 200;

interface ViewerRequest {
  type: typeof REQ_TYPE;
  version: typeof PROTOCOL_VERSION;
  requestId: string;
}

interface ViewerResponseOk {
  type: typeof RES_TYPE;
  version: typeof PROTOCOL_VERSION;
  requestId: string;
  status: "ok";
  payload: ReturnType<typeof toStashExport>;
}

interface ViewerResponseError {
  type: typeof RES_TYPE;
  version: typeof PROTOCOL_VERSION;
  requestId: string;
  status: "error";
  error: string;
}

type ViewerResponse = ViewerResponseOk | ViewerResponseError;

function isViewerRequest(value: unknown): value is ViewerRequest {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.type !== REQ_TYPE) return false;
  if (candidate.version !== PROTOCOL_VERSION) return false;
  if (typeof candidate.requestId !== "string" || candidate.requestId.length === 0) return false;
  return true;
}

function isAllowedOrigin(origin: unknown): origin is string {
  return typeof origin === "string" && LOCAL_LIBRARY_VIEWER_ORIGINS.includes(origin);
}

function reply(target: Window, origin: string, message: ViewerResponse): void {
  target.postMessage(message, origin);
}

export default defineContentScript({
  matches: [
    "https://stash.illo.fyi/stashes*",
    "http://localhost:4321/stashes*",
    "http://127.0.0.1:4321/stashes*",
  ],
  runAt: "document_idle",
  async main(_ctx) {
    const seenRequestIds = new Set<string>();

    // Resolve the opt-in gate first. If the user has not enabled the bridge,
    // do NOT register the message listener at all — there is nothing to do
    // and no reason to hold open a window-attached handler.
    let enabled = false;
    try {
      const settings = await getSettings();
      enabled = settings.localLibraryViewerEnabled === true;
    } catch {
      enabled = false;
    }
    if (!enabled) return;

    const handler = async (event: MessageEvent): Promise<void> => {
      if (event.source !== window) return;
      if (!isAllowedOrigin(event.origin)) return;

      const requestId = (event.data as { requestId?: unknown } | null)?.requestId;
      // Need a request id up front to send any response (incl. errors).
      // Shapes without one are silently dropped.
      const candidateId = typeof requestId === "string" && requestId.length > 0 ? requestId : null;

      if (!isViewerRequest(event.data)) {
        if (candidateId !== null) {
          reply(window, event.origin, {
            type: RES_TYPE,
            version: PROTOCOL_VERSION,
            requestId: candidateId,
            status: "error",
            error: "malformed_request",
          });
        }
        return;
      }

      // Replay protection: at-most-once per requestId within the window.
      if (seenRequestIds.has(event.data.requestId)) {
        reply(window, event.origin, {
          type: RES_TYPE,
          version: PROTOCOL_VERSION,
          requestId: event.data.requestId,
          status: "error",
          error: "replay",
        });
        return;
      }
      if (seenRequestIds.size >= REPLAY_CAP) {
        // LRU-ish: clear and continue. We don't need ordered eviction
        // because the cap is a runaway guard, not a security boundary.
        seenRequestIds.clear();
      }
      seenRequestIds.add(event.data.requestId);

      try {
        const records = await listStashes();
        if (records.length > MAX_STASHES) {
          reply(window, event.origin, {
            type: RES_TYPE,
            version: PROTOCOL_VERSION,
            requestId: event.data.requestId,
            status: "error",
            error: "too_many_records",
          });
          return;
        }
        const payload = toStashExport(records, "extension");
        reply(window, event.origin, {
          type: RES_TYPE,
          version: PROTOCOL_VERSION,
          requestId: event.data.requestId,
          status: "ok",
          payload,
        });
      } catch (err) {
        reply(window, event.origin, {
          type: RES_TYPE,
          version: PROTOCOL_VERSION,
          requestId: event.data.requestId,
          status: "error",
          error: err instanceof Error ? err.message : "internal_error",
        });
      }
    };

    // Expose a teardown so tests (and any future unload hooks) can detach.
    let detached = false;
    const detach = (): void => {
      if (detached) return;
      detached = true;
      window.removeEventListener("message", handler);
    };

    window.addEventListener("message", handler);
    return detach;
  },
});
