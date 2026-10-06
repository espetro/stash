/**
 * Local browser-agent surface: postMessage protocol between `/stashes`
 * and the Stash extension's content-script bridge.
 *
 * Wire format (exact-origin postMessage; mirror of
 * `apps/extension/entrypoints/stashes-bridge.content.ts`):
 *
 *   request  { type: BRIDGE_*_TYPE, version: 1, requestId: string,
 *              payload?: unknown }
 *   response { type: "stash:viewer:response", version: 1, requestId,
 *              status: "ok" | "error", payload?: unknown, error?: string }
 *
 * Request types (PR E):
 *  - `stash:viewer:presence` — presence ping, answered even when the
 *    data bridge is disabled; powers the "Open your Library" CTA.
 *  - `stash:viewer:request`  — full-library export (StashExport); the
 *    bridge answers `bridge_disabled` when the user has not opted in.
 *  - `stash:viewer:open`     — open the extension's Library page.
 *  - `stash:viewer:handoff`  — payload: StashExport(source
 *    "viewer-local"); the extension parks it for user-confirmed import.
 *
 * Every exchange is a single request, a single response, a strict
 * timeout, and a hard guarantee that the listener is detached on every
 * resolution path. Failure is non-fatal: callers fall back gracefully.
 *
 * Security notes:
 *  - We only accept messages whose `source === window` (the bridge posts
 *    from the page's own window context). Foreign-window postMessages
 *    cannot impersonate the page.
 *  - Export payloads are re-validated via `isStashExport` from
 *    `@stash/shared/agent-export` — strict version guard, http(s) URLs,
 *    array shape, and field types. Untrusted input fails closed.
 */
import { isStashExport, type StashExport } from "@stash/shared/agent-export";

export const BRIDGE_REQUEST_TYPE = "stash:viewer:request" as const;
export const BRIDGE_PRESENCE_TYPE = "stash:viewer:presence" as const;
export const BRIDGE_OPEN_TYPE = "stash:viewer:open" as const;
export const BRIDGE_HANDOFF_TYPE = "stash:viewer:handoff" as const;
export const BRIDGE_RESPONSE_TYPE = "stash:viewer:response" as const;
export const BRIDGE_PROTOCOL_VERSION = 1 as const;

const DEFAULT_TIMEOUT_MS = 1500;
// The content script attaches its `message` listener only after an async
// settings read (and only once `document_idle` fires), so a request sent
// immediately on navigation can be posted before anything is listening —
// postMessage delivers to whoever is listening *right now*, there is no
// queuing, so that first request is lost for good. Re-sending on a short
// interval until a response lands (or the overall timeout expires) closes
// that race without needing an artificially long single wait.
const RETRY_INTERVAL_MS = 150;

export interface BridgeProbeOptions {
  timeoutMs?: number;
}

export interface BridgeProbeResult {
  available: boolean;
  export?: StashExport;
  error?: string;
}

export interface BridgeReply {
  ok: boolean;
  payload?: unknown;
  error?: string;
}

interface ViewerResponse {
  type: typeof BRIDGE_RESPONSE_TYPE;
  version: typeof BRIDGE_PROTOCOL_VERSION;
  requestId: string;
  status: "ok" | "error";
  payload?: unknown;
  error?: string;
}

function newRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback: timestamp + small counter; collisions are bounded within a
  // single page lifetime and the bridge does its own replay protection.
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Send a single request to the extension content-script bridge and wait
 * for a matching response, a bridge-side error, or a timeout. ALWAYS
 * cleans up its `message` listener before resolving.
 */
async function postViewerRequest(
  type: string,
  payload: unknown,
  opts: BridgeProbeOptions = {},
): Promise<BridgeReply> {
  if (typeof window === "undefined") {
    return { ok: false, error: "no_window" };
  }

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const requestId = newRequestId();

  return new Promise<BridgeReply>((resolve) => {
    let settled = false;

    const cleanup = (): void => {
      window.removeEventListener("message", onMessage);
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      clearInterval(retryHandle);
    };

    const settle = (result: BridgeReply): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const onMessage = (event: MessageEvent): void => {
      if (settled) return;
      if (event.source !== window) return;

      const data = event.data as Partial<ViewerResponse> | null;
      if (!data || typeof data !== "object") return;
      if (data.type !== BRIDGE_RESPONSE_TYPE) return;
      if (data.version !== BRIDGE_PROTOCOL_VERSION) return;
      if (data.requestId !== requestId) return;

      if (data.status === "ok") {
        settle({ ok: true, payload: data.payload });
        return;
      }
      settle({
        ok: false,
        error: typeof data.error === "string" ? data.error : "bridge_error",
      });
    };

    let timeoutHandle: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      settle({ ok: false, error: "timeout" });
    }, timeoutMs);

    const send = (): void => {
      try {
        window.postMessage(
          {
            type,
            version: BRIDGE_PROTOCOL_VERSION,
            requestId,
            payload,
          },
          "*",
        );
      } catch {
        // Synchronous postMessage failures (rare; e.g. detached frame)
        // collapse to an unavailable result so the caller can fall back.
        settle({ ok: false, error: "post_failed" });
      }
    };

    window.addEventListener("message", onMessage);
    const retryHandle: ReturnType<typeof setInterval> = setInterval(send, RETRY_INTERVAL_MS);
    send();
  });
}

/**
 * Ask the bridge for the extension's full-library export. Resolves
 * `available: true` with a validated `StashExport`, or `available:
 * false` with the error string (`timeout`, `bridge_disabled`, …).
 */
export async function probeLocalBridge(opts: BridgeProbeOptions = {}): Promise<BridgeProbeResult> {
  const reply = await postViewerRequest(BRIDGE_REQUEST_TYPE, undefined, opts);
  if (!reply.ok) {
    return { available: false, error: reply.error };
  }
  if (isStashExport(reply.payload)) {
    return { available: true, export: reply.payload };
  }
  return { available: false, error: "invalid_payload" };
}

/**
 * Presence ping: answered whenever the extension is installed, even if
 * the user has not enabled the data bridge — the CTA on /stashes keys
 * off this rather than the gated export probe.
 */
export async function probeBridgePresence(opts: BridgeProbeOptions = {}): Promise<boolean> {
  const reply = await postViewerRequest(BRIDGE_PRESENCE_TYPE, undefined, opts);
  if (!reply.ok) return false;
  const payload = reply.payload as { present?: unknown } | null;
  return payload?.present === true;
}

/** Ask the extension to open its Library page in a new tab. */
export async function openLibraryInExtension(): Promise<BridgeReply> {
  return postViewerRequest(BRIDGE_OPEN_TYPE, undefined);
}

/**
 * One-time handoff: park this page's viewer-local records in the
 * extension's `pending-import` slot; the user confirms the merge on the
 * Library page that opens next. Callers clear their own storage only
 * after an `ok` reply.
 */
export async function sendLibraryHandoff(export_: StashExport): Promise<BridgeReply> {
  return postViewerRequest(BRIDGE_HANDOFF_TYPE, export_);
}
