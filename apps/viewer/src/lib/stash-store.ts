export interface StashItem {
  url: string;
  title: string;
}

export interface StashRecord {
  id: string;
  title?: string;
  tags: string[];
  note?: string;
  items: StashItem[];
  createdAt: number;
  updatedAt: number;
}

export interface StashExport {
  version: 1;
  stashes: StashRecord[];
}

const STORAGE_KEY = "stash:records";

function hasLocalStorage(): boolean {
  return typeof localStorage !== "undefined";
}

function readAll(): StashRecord[] {
  if (!hasLocalStorage()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isStashRecord) : [];
  } catch {
    return [];
  }
}

function writeAll(records: StashRecord[]): void {
  if (!hasLocalStorage()) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function isStashRecord(value: unknown): value is StashRecord {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    Array.isArray(r.tags) &&
    Array.isArray(r.items) &&
    typeof r.createdAt === "number" &&
    typeof r.updatedAt === "number"
  );
}

export function listStashes(): StashRecord[] {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getStash(id: string): StashRecord | undefined {
  return readAll().find((r) => r.id === id);
}

export function createStash(input: {
  title?: string;
  tags?: string[];
  note?: string;
  items: StashItem[];
}): StashRecord {
  const now = Date.now();
  const record: StashRecord = {
    id: crypto.randomUUID(),
    title: input.title,
    tags: input.tags ?? [],
    note: input.note,
    items: input.items,
    createdAt: now,
    updatedAt: now,
  };
  const records = readAll();
  records.push(record);
  writeAll(records);
  return record;
}

export function updateStash(
  id: string,
  patch: Partial<Pick<StashRecord, "title" | "tags" | "note" | "items">>,
): StashRecord | undefined {
  const records = readAll();
  const index = records.findIndex((r) => r.id === id);
  if (index === -1) return undefined;
  const existing = records[index];
  if (!existing) return undefined;
  const updated: StashRecord = { ...existing, ...patch, updatedAt: Date.now() };
  records[index] = updated;
  writeAll(records);
  return updated;
}

export function deleteStash(id: string): void {
  writeAll(readAll().filter((r) => r.id !== id));
}

export function searchStashes(query: string): StashRecord[] {
  const q = query.trim().toLowerCase();
  if (!q) return listStashes();
  return listStashes().filter((r) => {
    const haystack = [r.title ?? "", ...r.tags, r.note ?? ""].join(" ").toLowerCase();
    return haystack.includes(q);
  });
}

export function exportStashes(): StashExport {
  return { version: 1, stashes: listStashes() };
}

/** Parses+validates an import file's contents, appending new records
 * and skipping ids that already exist locally (dedupe by id). */
export function importStashes(data: unknown): { imported: number; error?: string } {
  if (!data || typeof data !== "object") {
    return { imported: 0, error: "Invalid file" };
  }
  const stashes = (data as Record<string, unknown>).stashes;
  if (!Array.isArray(stashes)) {
    return { imported: 0, error: "Invalid file: missing stashes array" };
  }

  const existing = readAll();
  const existingIds = new Set(existing.map((r) => r.id));
  let imported = 0;

  for (const candidate of stashes) {
    if (!isStashRecord(candidate) || existingIds.has(candidate.id)) continue;
    existing.push(candidate);
    existingIds.add(candidate.id);
    imported++;
  }

  writeAll(existing);
  return { imported };
}
