import type { ServerTtl } from "./store";

/** Coarse dimensions recorded for every request. No URLs, titles, tags,
 *  notes, or user identifiers are ever included — aggregate counters only. */
export type ClientClass = "human" | "agent" | "unknown";
export type OriginClass = "extension" | "web" | "other" | "n/a";
export type TtlBucket = "1d" | "7d" | "14d" | "30d" | "n/a";
export type TelemetryRoute =
  | "api_stash"
  | "api_stash_delete"
  | "mcp"
  | "s_view_html"
  | "s_view_json"
  | "s_view_md"
  | "s_view_txt"
  | "card"
  | "health"
  | "beacon";

export interface TelemetryEvent {
  route: TelemetryRoute;
  clientClass: ClientClass;
  status: number;
  ttlBucket: TtlBucket;
  origin: OriginClass;
  /** Only set for route "beacon": the allowlisted client event name. */
  beaconEvent?: string;
  /** Only set for route "beacon": which surface sent it. */
  surface?: "extension" | "web";
}

/** Optional sink an adapter (e.g. the Cloudflare worker) can plug in to
 *  record events. server-core stays runtime-agnostic: it never talks to
 *  Analytics Engine directly, it just calls this port. */
export interface TelemetrySink {
  record: (event: TelemetryEvent) => void;
}

const AGENT_UA_MARKERS = ["mcp-sdk", "node", "python-httpx", "curl", "python-requests"];

/** Server-side best-effort classification from request signals only —
 *  never from payload contents. */
export function classifyClient(request: Request): ClientClass {
  const url = new URL(request.url);
  if (url.pathname === "/mcp") return "agent";
  if (/\.(json|md)$/.test(url.pathname)) return "agent";

  const accept = (request.headers.get("Accept") ?? "").toLowerCase();
  if (accept.includes("application/json") || accept.includes("text/markdown")) return "agent";

  const ua = (request.headers.get("User-Agent") ?? "").toLowerCase();
  if (ua && AGENT_UA_MARKERS.some((marker) => ua.includes(marker))) return "agent";

  const hasSecFetch =
    request.headers.has("Sec-Fetch-Mode") || request.headers.has("Sec-Fetch-Site");
  if (ua.includes("mozilla") && hasSecFetch) return "human";
  if (!ua) return "unknown";

  return hasSecFetch ? "human" : "unknown";
}

/** Classifies request origin from Origin/Referer headers. Used only for the
 *  extension/web dimension on POST /api/stash and /beacon — never stored
 *  per-request beyond this coarse label. */
export function classifyOrigin(request: Request, viewerOrigin?: string): OriginClass {
  const source = request.headers.get("Origin") ?? request.headers.get("Referer") ?? "";
  if (!source) return "n/a";
  if (source.startsWith("chrome-extension://") || source.startsWith("moz-extension://")) {
    return "extension";
  }
  if (viewerOrigin && source.startsWith(viewerOrigin)) return "web";
  if (source.startsWith("http://") || source.startsWith("https://")) return "web";
  return "other";
}

export function ttlBucketFor(ttl: ServerTtl | string | undefined): TtlBucket {
  if (ttl === "1d" || ttl === "7d" || ttl === "14d" || ttl === "30d") return ttl;
  return "n/a";
}

export const BEACON_EVENTS = [
  "popup_open",
  "tabs_selected",
  "create_clicked",
  "link_copied",
  "stash_saved",
  "shortener_used",
  "stash_list_viewed",
  "stash_reopened",
  "export_used",
  "import_used",
] as const;

export type BeaconEvent = (typeof BEACON_EVENTS)[number];

export function isBeaconEvent(value: unknown): value is BeaconEvent {
  return typeof value === "string" && (BEACON_EVENTS as readonly string[]).includes(value);
}
