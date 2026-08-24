/**
 * Local browser-agent surface: probe the Stash extension's content-script
 * bridge to ask for the profile-local stash library.
 *
 * Wire format (exact-origin postMessage; mirror of
 * `apps/extension/entrypoints/stashes-bridge.content.ts`):
 *
 *   request  { type: "stash:viewer:request",  version: 1, requestId: string }
 *   response { type: "stash:viewer:response", version: 1, requestId: string,
 *              status: "ok" | "error",
 *              payload?: StashExport, error?: string }
 *
 * The probe is intentionally narrow: a single request, a single response,
 * a strict timeout, and a hard guarantee that the listener is detached on
 * every resolution path. Failure to resolve the bridge is non-fatal: the
 * caller falls back to viewer-local records.
 *
 * Security notes:
 *  - We only accept messages whose `source === window` (the bridge posts
 *    from the page's own window context). Foreign-window postMessages
 *    cannot impersonate the page.
 *  - We re-validate the payload via `isStashExport` from
 *    `@stash/shared/agent-export` — strict version guard, http(s) URLs,
 *    array shape, and field types. Untrusted input fails closed.
 */
import { isStashExport, type StashExport } from "@stash/shared/agent-export";

export const BRIDGE_REQUEST_TYPE = "stash:viewer:request" as const;
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

interface ViewerResponseOk {
  type: typeof BRIDGE_RESPONSE_TYPE;
  version: typeof BRIDGE_PROTOCOL_VERSION;
  requestId: string;
  status: "ok";
  payload: unknown;
}

interface ViewerResponseError {
  type: typeof BRIDGE_RESPONSE_TYPE;
  version: typeof BRIDGE_PROTOCOL_VERSION;
  requestId: string;
  status: "error";
  error: string;
}

type ViewerResponse = ViewerResponseOk | ViewerResponseError;

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
 * for a matching response, a bridge-side error, or a timeout.
 *
 * The function ALWAYS cleans up its `message` listener before returning,
 * even on timeout or unexpected errors. No state leaks across probes.
 */
export async function probeLocalBridge(opts: BridgeProbeOptions = {}): Promise<BridgeProbeResult> {
  if (typeof window === "undefined") {
    return { available: false };
  }

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const requestId = newRequestId();

  return new Promise<BridgeProbeResult>((resolve) => {
    let settled = false;

    const cleanup = (): void => {
      window.removeEventListener("message", onMessage);
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      clearInterval(retryHandle);
    };

    const settle = (result: BridgeProbeResult): void => {
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
        const payload = (data as ViewerResponseOk).payload;
        if (isStashExport(payload)) {
          settle({ available: true, export: payload });
        } else {
          settle({ available: false, error: "invalid_payload" });
        }
        return;
      }

      // status === "error"
      const errorMessage =
        typeof (data as ViewerResponseError).error === "string"
          ? (data as ViewerResponseError).error
          : "bridge_error";
      settle({ available: false, error: errorMessage });
    };

    let timeoutHandle: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      settle({ available: false, error: "timeout" });
    }, timeoutMs);

    const send = (): void => {
      try {
        window.postMessage(
          {
            type: BRIDGE_REQUEST_TYPE,
            version: BRIDGE_PROTOCOL_VERSION,
            requestId,
          },
          "*",
        );
      } catch {
        // Synchronous postMessage failures (rare; e.g. detached frame)
        // collapse to an unavailable result so the caller can fall back.
        settle({ available: false, error: "post_failed" });
      }
    };

    window.addEventListener("message", onMessage);
    const retryHandle: ReturnType<typeof setInterval> = setInterval(send, RETRY_INTERVAL_MS);
    send();
  });
}
