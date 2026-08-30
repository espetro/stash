import { StorageItem } from "webext-storage";
import { recordCreate, recordDelete, recordUpdate } from "./sync/outbox";
import { getProfileId, materializationGuard } from "./sync/profile";

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

export interface CreateStashInput {
  title?: string;
  tags?: string[];
  note?: string;
  items: StashItem[];
}

export interface UpdateStashInput {
  title?: string;
  tags?: string[];
  note?: string;
  items?: StashItem[];
}

export const stashesItem = new StorageItem<StashRecord[]>("stash-records", {
  area: "local",
  defaultValue: [],
});

/**
 * Wrap a local user write: after the local write lands, append the change to
 * the sync outbox (F5.W2). Daemon-origin (materialized) writes call with
 * `fromDaemon = true` (F5.W3) and never hit the outbox — a writer-identity
 * guard, not a time-based heuristic, so echo loops are impossible.
 */
async function afterWrite(
  op: "create" | "update" | "delete",
  record: StashRecord,
  fromDaemon = false,
): Promise<void> {
  if (fromDaemon || materializationGuard.active) return;
  const origin = await getProfileId();
  if (op === "create") return recordCreate(record, origin);
  if (op === "update") return recordUpdate(record, origin);
  return recordDelete(record.id, origin);
}

async function getAll(): Promise<StashRecord[]> {
  try {
    return (await stashesItem.get()) ?? [];
  } catch {
    return [];
  }
}

export async function listStashes(): Promise<StashRecord[]> {
  return getAll();
}

export async function getStash(id: string): Promise<StashRecord | undefined> {
  const stashes = await getAll();
  return stashes.find((s) => s.id === id);
}

/**
 * Daemon-side materialization path (F5.W3): write a whole record set into the
 * local store WITHOUT recording outbox changes. Used by the sync client so a
 * materialized write and a local user write are serialized through one path.
 */
export async function materializeStashes(
  upsert: (stashes: StashRecord[]) => StashRecord[],
): Promise<void> {
  materializationGuard.active = true;
  try {
    const stashes = await getAll();
    await stashesItem.set(upsert(stashes));
  } finally {
    materializationGuard.active = false;
  }
}

export async function createStash(input: CreateStashInput): Promise<StashRecord> {
  const now = Date.now();
  const record: StashRecord = {
    id: now.toString(36),
    title: input.title,
    tags: input.tags ?? [],
    note: input.note,
    items: input.items,
    createdAt: now,
    updatedAt: now,
  };
  const stashes = await getAll();
  await stashesItem.set([...stashes, record]);
  await afterWrite("create", record);
  return record;
}

export async function updateStash(
  id: string,
  patch: UpdateStashInput,
): Promise<StashRecord | undefined> {
  const stashes = await getAll();
  const index = stashes.findIndex((s) => s.id === id);
  if (index === -1) return undefined;

  // `patch` always carries all UpdateStashInput keys (Zod-optional params
  // are passed through as explicit `undefined`, not omitted), so a naive
  // spread would blow away untouched fields on a partial update (e.g.
  // updating only `title` would wipe `items`/`tags`/`note` to undefined).
  const definedPatch = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  );
  const updated: StashRecord = { ...stashes[index], ...definedPatch, updatedAt: Date.now() };
  const next = [...stashes];
  next[index] = updated;
  await stashesItem.set(next);
  await afterWrite("update", updated);
  return updated;
}

export async function deleteStash(id: string): Promise<boolean> {
  const stashes = await getAll();
  const next = stashes.filter((s) => s.id !== id);
  if (next.length === stashes.length) return false;
  await stashesItem.set(next);
  await afterWrite("delete", { ...stashes.find((s) => s.id === id)!, id });
  return true;
}

export async function searchStashes(query: string): Promise<StashRecord[]> {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return getAll();
  const stashes = await getAll();
  return stashes.filter((s) => {
    const title = s.title?.toLowerCase() ?? "";
    const note = s.note?.toLowerCase() ?? "";
    const tags = s.tags.join(" ").toLowerCase();
    return title.includes(q) || note.includes(q) || tags.includes(q);
  });
}
