import { StorageItem } from "webext-storage";

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
  return record;
}

export async function updateStash(
  id: string,
  patch: UpdateStashInput,
): Promise<StashRecord | undefined> {
  const stashes = await getAll();
  const index = stashes.findIndex((s) => s.id === id);
  if (index === -1) return undefined;

  const updated: StashRecord = { ...stashes[index], ...patch, updatedAt: Date.now() };
  const next = [...stashes];
  next[index] = updated;
  await stashesItem.set(next);
  return updated;
}

export async function deleteStash(id: string): Promise<boolean> {
  const stashes = await getAll();
  const next = stashes.filter((s) => s.id !== id);
  if (next.length === stashes.length) return false;
  await stashesItem.set(next);
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
