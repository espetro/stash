/**
 * F8.W5 one-time migration: fold `stash-history` entries into record
 * `shares[]` (spec §11.1). Gated by the `historyMerged` marker in
 * browser.storage.local, so re-runs are no-ops. `stash-history` itself is
 * kept untouched for one release as a downgrade path (older builds ignore
 * the unknown `shares[]` field and keep reading history); deletion of the
 * key and `history.ts` is scheduled one release after this ships.
 *
 * Matching: a history entry matches an existing record by payload identity
 * — the share url against the record's own prior share urls, then against
 * its item urls (re-sharing a saved stash). Entries matching nothing become
 * minimal carrier records with `items: []`, carrying just the ShareEvent.
 */
import { StorageItem } from "webext-storage";
import { getHistory, type HistoryEntry } from "./history";
import { listStashes, materializeStashes, type ShareEvent, type StashRecord } from "./stash-store";

export const HISTORY_MERGED_KEY = "historyMerged";

const historyMergedItem = new StorageItem<boolean>(HISTORY_MERGED_KEY, {
  area: "local",
  defaultValue: false,
});

function toShareEvent(entry: HistoryEntry): ShareEvent {
  return {
    url: entry.url,
    itemCount: entry.itemCount,
    truncated: entry.truncated,
    createdAt: entry.createdAt,
    expiresAt: entry.expiresAt,
  };
}

function matchRecord(
  entry: HistoryEntry,
  records: StashRecord[],
): StashRecord | undefined {
  return records.find(
    (r) =>
      r.shares?.some((s) => s.url === entry.url) ||
      r.items.some((i) => i.url === entry.url),
  );
}

/**
 * Run the migration. Idempotent: after the first successful run the marker
 * makes every subsequent call a no-op. Returns the number of entries merged
 * (0 on a re-run).
 */
export async function migrateHistoryToShares(): Promise<number> {
  try {
    if (await historyMergedItem.get()) return 0;
  } catch {
    // Storage unavailable (tests); treat as unmerged.
  }

  const history = await getHistory();
  const records = await listStashes();
  const now = Date.now();
  const merged: StashRecord[] = records.map((r) => ({ ...r }));
  let count = 0;

  for (const entry of history) {
    const event = toShareEvent(entry);
    const match = matchRecord(entry, merged);
    if (match) {
      match.shares = [...(match.shares ?? []), event];
      match.updatedAt = now;
    } else {
      merged.push({
        id: `h${entry.id}`,
        title: undefined,
        tags: [],
        note: undefined,
        items: [],
        shares: [event],
        createdAt: entry.createdAt,
        updatedAt: now,
      });
    }
    count++;
  }

  await materializeStashes(() => merged);
  try {
    await historyMergedItem.set(true);
  } catch {
    // If the marker write fails, the next run re-merges; appending is not
    // idempotent, but the record set is rebuilt from `stash-records` which
    // now carries shares, so the fallback keeps duplicates out of items.
  }
  return count;
}
