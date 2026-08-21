/**
 * Fetch-compatible client for the in-extension stash server, for consumers
 * that talk to the background bridge (other extensions via
 * runtime.sendMessage, or web pages via the content-script relay).
 *
 * Usage from another extension (after externally_connectable):
 *   const res = await fetchViaBridge((msg) =>
 *     browser.runtime.sendMessage(STASH_EXT_ID, msg), url, init);
 */

export interface BridgeClient {
  (message: unknown): Promise<unknown>;
}

interface PendingEntry {
  resolve: (r: BridgeSerializedResponse) => void;
  reject: (e: Error) => void;
}

interface BridgeSerializedResponse {
  type: "stash-bridge-response";
  id: number;
  status: number;
  headers: Record<string, string>;
  body: string | null;
}

let nextId = 1;
const pending = new Map<number, PendingEntry>();

function dispatch(send: BridgeClient, message: unknown): void {
  send(message).catch((err) => {
    for (const [, entry] of pending) entry.reject(new Error(String(err)));
    pending.clear();
  });
}

export class BridgeFetchResponse {
  constructor(private readonly data: BridgeSerializedResponse) {}

  get ok(): boolean {
    return this.data.status >= 200 && this.data.status < 300;
  }
  get status(): number {
    return this.data.status;
  }
  get headers(): Record<string, string> {
    return this.data.headers;
  }
  async text(): Promise<string> {
    return this.data.body ?? "";
  }
  async json(): Promise<unknown> {
    return JSON.parse(await this.text());
  }
}

/** Relay a response message coming back from the background bridge. */
export function handleBridgeClientMessage(v: unknown): boolean {
  if (
    typeof v !== "object" ||
    v === null ||
    (v as BridgeSerializedResponse).type !== "stash-bridge-response"
  ) {
    return false;
  }
  const res = v as BridgeSerializedResponse;
  const entry = pending.get(res.id);
  if (!entry) return false;
  pending.delete(res.id);
  entry.resolve(res);
  return true;
}

/** fetch(url, init) semantics over the bridge. */
export function fetchViaBridge(
  send: BridgeClient,
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
): Promise<BridgeFetchResponse> {
  const id = nextId++;
  const p = new Promise<BridgeSerializedResponse>((resolve, reject) => {
    pending.set(id, { resolve, reject });
  });
  dispatch(send, {
    type: "stash-bridge-request",
    id,
    method: init?.method ?? "GET",
    url,
    headers: init?.headers,
    body: init?.body ?? null,
  });
  return p.then((data) => new BridgeFetchResponse(data));
}

/** Convenience: a BridgeClient bound to another extension's runtime. */
export function extensionBridgeClient(extensionId: string): BridgeClient {
  return (message) => browser.runtime.sendMessage(extensionId, message);
}
