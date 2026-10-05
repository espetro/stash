import { StorageItem } from "webext-storage";
import { removeHistoryByUrls } from "./history";
import { revokeShortLink } from "./shortener";
import { recordCreate, recordDelete, recordUpdate } from "./sync/outbox";
import { getProfileId, materializationGuard } from "./sync/profile";

export interface StashItem {
  url: string;
  title: string;
}

/** One share of a record (F8): the generated link plus its lifecycle. */
export interface ShareEvent {
  url: string;
  shortUrl?: string;
  itemCount: number;
  truncated: boolean;
  createdAt: number;
  expiresAt: number;
}

export interface StashRecord {
  /** Share history (F8): appended by the share flow, absent on pre F8 records. */
  shares?: ShareEvent[];
  id: string;
  title?: string;
  tags: string[];
  note?: string;
  items: StashItem[];
  createdAt: number;
  updatedAt: number;
  /** false = Recent (share-only). Missing = kept, so existing records keep working. */
  kept?: boolean;
}

export interface RecordShareInput {
  items: StashItem[];
  title?: string;
  sourceId?: string;
  share: ShareEvent;
}

export interface CreateStashInput {
  title?: string;
  tags?: string[];
  note?: string;
  items: StashItem[];
  kept?: boolean;
  shares?: ShareEvent[];
}

export interface UpdateStashInput {
  title?: string;
  tags?: string[];
  note?: string;
  items?: StashItem[];
  kept?: boolean;
}

export const RECENT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export const isKept = (record: StashRecord): boolean => record.kept !== false;

export const recentExpiresAt = (record: StashRecord): number => {
  const shares = record.shares ?? [];
  if (shares.length === 0) return record.createdAt + RECENT_MAX_AGE_MS;
  const linkExpiry = Math.max(...shares.map((share) => share.expiresAt));
  const lastShare = Math.max(...shares.map((share) => share.createdAt));
  return Math.min(linkExpiry, lastShare + RECENT_MAX_AGE_MS);
};

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
    shares: input.shares ?? [],
    createdAt: now,
    updatedAt: now,
    kept: input.kept ?? true,
  };
  const stashes = await getAll();
  await stashesItem.set([...stashes, record]);
  await afterWrite("create", record);
  return record;
}

export async function importStashes(records: StashRecord[]): Promise<StashRecord[]> {
  const stashes = await getAll();
  const existingIds = new Set(stashes.map((stash) => stash.id));
  const added: StashRecord[] = [];

  for (const record of records) {
    if (existingIds.has(record.id)) continue;
    existingIds.add(record.id);
    added.push({
      ...record,
      tags: record.tags ?? [],
      shares: record.shares ?? [],
    });
  }

  if (added.length === 0) return [];

  await stashesItem.set([...stashes, ...added]);
  for (const record of added) {
    await afterWrite("create", record);
  }
  return added;
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

/**
 * Append one share to a record's `shares[]` (F8). Additive and optional, so
 * pre F8 records without the field upgrade in place; daemon-origin writes
 * are guarded the same way as every other user write.
 */
export async function appendShareEvent(
  recordId: string,
  event: ShareEvent,
): Promise<StashRecord | undefined> {
  const stashes = await getAll();
  const index = stashes.findIndex((s) => s.id === recordId);
  if (index === -1) return undefined;
  const updated: StashRecord = {
    ...stashes[index],
    shares: [...(stashes[index].shares ?? []), event],
    updatedAt: Date.now(),
  };
  const next = [...stashes];
  next[index] = updated;
  await stashesItem.set(next);
  await afterWrite("update", updated);
  return updated;
}

export async function recordShare(input: RecordShareInput): Promise<StashRecord> {
  if (input.sourceId) {
    const existing = await appendShareEvent(input.sourceId, input.share);
    if (existing) return existing;
  }

  return createStash({
    items: input.items,
    title: input.title,
    kept: false,
    shares: [input.share],
  });
}

export async function keepStash(id: string): Promise<StashRecord | undefined> {
  return updateStash(id, { kept: true });
}

export async function attachShortUrl(
  id: string,
  payloadUrl: string,
  shortUrl: string,
): Promise<StashRecord | undefined> {
  const stashes = await getAll();
  const index = stashes.findIndex((stash) => stash.id === id);
  if (index === -1) return undefined;

  const shares = [...(stashes[index].shares ?? [])];
  let shareIndex = -1;
  for (let i = shares.length - 1; i >= 0; i--) {
    if (shares[i].url === payloadUrl) {
      shareIndex = i;
      break;
    }
  }
  if (shareIndex === -1) return undefined;

  shares[shareIndex] = { ...shares[shareIndex], shortUrl };
  const updated: StashRecord = { ...stashes[index], shares, updatedAt: Date.now() };
  const next = [...stashes];
  next[index] = updated;
  await stashesItem.set(next);
  await afterWrite("update", updated);
  return updated;
}

export async function pruneExpiredRecent(now = Date.now()): Promise<string[]> {
  const expired = (await getAll()).filter(
    (record) => !isKept(record) && recentExpiresAt(record) <= now,
  );
  const deletedIds: string[] = [];
  for (const record of expired) {
    if (await deleteStash(record.id, { revoke: false })) deletedIds.push(record.id);
  }
  return deletedIds;
}

export async function deleteStash(
  id: string,
  options: { revoke?: boolean } = {},
): Promise<boolean> {
  const stashes = await getAll();
  const deleted = stashes.find((stash) => stash.id === id);
  if (!deleted) return false;
  const next = stashes.filter((s) => s.id !== id);
  await stashesItem.set(next);
  await afterWrite("delete", deleted);
  const shareUrls = deleted.shares?.map((share) => share.url) ?? [];
  if (shareUrls.length > 0) {
    await removeHistoryByUrls(shareUrls);
  }
  if (options.revoke !== false) {
    for (const shortUrl of deleted.shares?.flatMap((share) =>
      share.shortUrl ? [share.shortUrl] : [],
    ) ?? []) {
      void revokeShortLink(shortUrl);
    }
  }
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
