/**
 * Canonical export shape consumed by browser-class agents when reading
 * stash records from a profile-local source (extension storage or
 * viewer localStorage). The shape is intentionally narrow and stable:
 * `version` is a strict literal guard, optional fields normalize to
 * `null` (not `undefined`) so the JSON island stays canonical after
 * `JSON.stringify`, and item URLs must be `http(s)`.
 */

/** Maximum number of stashes accepted in a single export. */
export const MAX_STASHES = 1000;

export interface StashExportItem {
  url: string;
  title: string;
}

export interface StashExportRecord {
  id: string;
  title: string | null;
  tags: string[];
  note: string | null;
  items: StashExportItem[];
  createdAt: number;
  updatedAt: number;
}

export interface StashExport {
  version: 1;
  source: "extension" | "viewer-local";
  stashes: StashExportRecord[];
}

/**
 * Structural shape compatible with both the extension's `StashRecord`
 * and the viewer's `StashRecord`. Optional fields are `string | null |
 * undefined` so we can normalize `undefined` → `null` at the boundary.
 */
export interface StashRecordLike {
  id: string;
  title?: string | null;
  tags: string[];
  note?: string | null;
  items: { url: string; title: string }[];
  createdAt: number;
  updatedAt: number;
}

const ALLOWED_SOURCES: ReadonlyArray<StashExport["source"]> = [
  "extension",
  "viewer-local",
];

function isHttpUrl(url: unknown): url is string {
  return typeof url === "string" && (url.startsWith("http://") || url.startsWith("https://"));
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidItem(value: unknown): value is StashExportItem {
  if (!isPlainRecord(value)) return false;
  return typeof value.url === "string" && isHttpUrl(value.url) && typeof value.title === "string";
}

function isValidStashRecord(value: unknown): value is StashExportRecord {
  if (!isPlainRecord(value)) return false;
  if (typeof value.id !== "string") return false;
  if (value.title !== null && typeof value.title !== "string") return false;
  if (!Array.isArray(value.tags)) return false;
  if (!value.tags.every((t) => typeof t === "string")) return false;
  if (value.note !== null && typeof value.note !== "string") return false;
  if (!Array.isArray(value.items)) return false;
  if (!value.items.every(isValidItem)) return false;
  if (typeof value.createdAt !== "number") return false;
  if (typeof value.updatedAt !== "number") return false;
  return true;
}

/**
 * Normalize extension/viewer records into the canonical export shape.
 * Records whose items[] contain a non-`http(s)` URL are dropped to
 * keep the JSON island safe for browser-agent consumers.
 */
export function toStashExport(
  records: StashRecordLike[],
  source: StashExport["source"],
): StashExport {
  if (records.length > MAX_STASHES) {
    throw new Error(`toStashExport: too many records (${records.length} > ${MAX_STASHES})`);
  }

  const stashes: StashExportRecord[] = [];
  for (const record of records) {
    const items = record.items.filter(
      (item): item is StashExportItem =>
        typeof item === "object" &&
        item !== null &&
        typeof item.url === "string" &&
        typeof item.title === "string" &&
        isHttpUrl(item.url),
    );
    if (items.length !== record.items.length) {
      // Record has at least one non-http(s) item; drop the whole record
      // to keep item semantics per-record.
      continue;
    }
    stashes.push({
      id: record.id,
      title: record.title ?? null,
      tags: [...record.tags],
      note: record.note ?? null,
      items: items.map((it) => ({ url: it.url, title: it.title })),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  return {
    version: 1,
    source,
    stashes,
  };
}

/**
 * Strict validator for an untrusted `StashExport` payload. Fails closed
 * on any deviation: wrong version, unknown source, missing fields,
 * non-array containers, oversized payloads, or invalid item URLs.
 */
export function isStashExport(value: unknown): value is StashExport {
  if (!isPlainRecord(value)) return false;
  if (value.version !== 1) return false;
  if (typeof value.source !== "string") return false;
  if (!ALLOWED_SOURCES.includes(value.source as StashExport["source"])) return false;
  if (!Array.isArray(value.stashes)) return false;
  if (value.stashes.length > MAX_STASHES) return false;
  for (const stash of value.stashes) {
    if (!isValidStashRecord(stash)) return false;
  }
  return true;
}
