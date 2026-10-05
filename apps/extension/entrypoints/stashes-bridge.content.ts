/**
 * Content-script bridge between the viewer's `/stashes` page and this
 * profile's extension library (PR E). The listener always attaches —
 * per-type gating decides what each request may do:
 *
 *   stash:viewer:presence  presence ping; answered even when the bridge
 *                          setting is off, so /stashes can show the
 *                          "Open your Library" install-detection CTA.
 *   stash:viewer:request   full library export (StashExport); gated on
 *                          `localLibraryViewerEnabled`, otherwise
 *                          `bridge_disabled`.
 *   stash:viewer:open      relay to background → opens library.html.
 *   stash:viewer:handoff   payload: StashExport (source "viewer-local");
 *                          parked under `pending-import` in extension
 *                          storage, then library.html#pending-import
 *                          opens so the user confirms the merge.
 *
 * Wire format (exact-origin postMessage):
 *   request  { type: <one of the above>, version: 1, requestId: string,
 *              payload?: unknown }
 *   response { type: "stash:viewer:response", version: 1, requestId,
 *              status: "ok" | "error", payload?: unknown, error?: string }
 *
 * Hard rules:
 *  - Only exact-origin requests from an allowlisted viewer origin;
 *    malformed/unknown messages are silently dropped (or answered with
 *    an error when a requestId is available to correlate).
 *  - Rejects replayed `requestId`s within a bounded in-memory window
 *    (LRU-ish: clear and continue past the cap, never grow unbounded).
 *    Presence pings are exempt — they are idempotent and the viewer
 *    retries them on a short interval.
 *  - The data request returns only read-only data —
 *    `toStashExport(records, "extension")` from
 *    `@stash/shared/agent-export`. No fetches, no MCP.
 *  - Page writes are impossible: `handoff` carries records into
 *    extension storage via the background worker, and nothing lands in
 *    the library until the user confirms on the Library page.
 */
import { defineContentScript } from "wxt/utils/define-content-script";
import { isStashExport, toStashExport, MAX_STASHES } from "@stash/shared/agent-export";
import { getSettings, LOCAL_LIBRARY_VIEWER_ORIGINS } from "../lib/settings";
import { listStashes } from "../lib/stash-store";
import { openLibraryPage } from "../lib/open-library";

const REQ_TYPE = "stash:viewer:request";
const PRESENCE_TYPE = "stash:viewer:presence";
const OPEN_TYPE = "stash:viewer:open";
const HANDOFF_TYPE = "stash:viewer:handoff";
const RES_TYPE = "stash:viewer:response";
const PROTOCOL_VERSION = 1 as const;
const REPLAY_CAP = 200;
const REQUEST_TYPES = [REQ_TYPE, PRESENCE_TYPE, OPEN_TYPE, HANDOFF_TYPE] as const;

export type ViewerRequestType = (typeof REQUEST_TYPES)[number];

export interface ViewerRequest {
  type: ViewerRequestType;
  version: typeof PROTOCOL_VERSION;
  requestId: string;
  payload?: unknown;
}

export interface ViewerResponse {
  type: typeof RES_TYPE;
  version: typeof PROTOCOL_VERSION;
  requestId: string;
  status: "ok" | "error";
  payload?: unknown;
  error?: string;
}

function requestType(value: unknown): ViewerRequestType | null {
  return typeof value === "string" && (REQUEST_TYPES as readonly string[]).includes(value)
    ? (value as ViewerRequestType)
    : null;
}

function isViewerRequest(value: unknown): value is ViewerRequest {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (requestType(candidate.type) === null) return false;
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
    const inflight = new Set<string>();
    const enabled = await getSettings()
      .then((s) => s.localLibraryViewerEnabled === true)
      .catch(() => false);

    const handler = async (event: MessageEvent): Promise<void> => {
      if (event.source !== window) return;
      if (!isAllowedOrigin(event.origin)) return;

      const requestId = (event.data as { requestId?: unknown } | null)?.requestId;
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

      const request = event.data;
      const respondOk = (payload?: unknown) =>
        reply(window, event.origin, {
          type: RES_TYPE,
          version: PROTOCOL_VERSION,
          requestId: request.requestId,
          status: "ok",
          payload,
        });
      const respondErr = (error: string) =>
        reply(window, event.origin, {
          type: RES_TYPE,
          version: PROTOCOL_VERSION,
          requestId: request.requestId,
          status: "error",
          error,
        });

      // Presence pings are idempotent and exempt from replay tracking.
      if (request.type === PRESENCE_TYPE) {
        respondOk({ present: true });
        return;
      }

      // Replay protection: at-most-once per requestId within the window.
      // Duplicates of an in-flight request are ignored rather than
      // errored — the viewer retries on a fixed interval and the first
      // request's reply may legitimately land after a retry was sent.
      if (inflight.has(request.requestId)) return;
      if (seenRequestIds.has(request.requestId)) {
        respondErr("replay");
        return;
      }
      if (seenRequestIds.size >= REPLAY_CAP) {
        seenRequestIds.clear();
      }
      seenRequestIds.add(request.requestId);
      inflight.add(request.requestId);
      try {
        switch (request.type) {
          case OPEN_TYPE:
            await openLibraryPage();
            respondOk({ opened: true });
            return;

          case HANDOFF_TYPE: {
            const export_ = request.payload;
            if (
              !isStashExport(export_) ||
              export_.source !== "viewer-local" ||
              export_.stashes.length > MAX_STASHES
            ) {
              respondErr("invalid_payload");
              return;
            }
            await openLibraryPage("#pending-import", {
              records: export_.stashes,
              source: export_.source,
            });
            respondOk({ received: export_.stashes.length });
            return;
          }

          case REQ_TYPE: {
            if (!enabled) {
              respondErr("bridge_disabled");
              return;
            }
            const records = await listStashes();
            if (records.length > MAX_STASHES) {
              respondErr("too_many_records");
              return;
            }
            respondOk(toStashExport(records, "extension"));
            return;
          }
        }
      } catch (err) {
        respondErr(err instanceof Error ? err.message : "internal_error");
      } finally {
        inflight.delete(request.requestId);
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
