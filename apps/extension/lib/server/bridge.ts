import { getExtensionServer } from "./server";

/** postMessage-safe request shape (fetch-like, structured-cloneable). */
export interface BridgeRequest {
  type: "stash-bridge-request";
  id: number;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string | null;
}

/** postMessage-safe response shape. */
export interface BridgeResponse {
  type: "stash-bridge-response";
  id: number;
  status: number;
  headers: Record<string, string>;
  body: string | null;
}

export function isBridgeRequest(v: unknown): v is BridgeRequest {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as BridgeRequest).type === "stash-bridge-request" &&
    typeof (v as BridgeRequest).id === "number" &&
    typeof (v as BridgeRequest).method === "string" &&
    typeof (v as BridgeRequest).url === "string"
  );
}

/** Handle a bridge request: rebuild a web-standard Request, run the server,
 *  serialize the Response back (body as text). */
export async function handleBridgeRequest(req: BridgeRequest): Promise<BridgeResponse> {
  const request = new Request(req.url, {
    method: req.method,
    headers: req.headers,
    body: req.body ?? undefined,
  });
  const res = await getExtensionServer().handle(request);

  const headers: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    headers[key] = value;
  });

  let body: string | null = null;
  if (res.body) {
    // 302 redirects and empty bodies have nothing to relay
    body = await res.text();
  }

  return { type: "stash-bridge-response", id: req.id, status: res.status, headers, body };
}
