import { storage } from "wxt/storage";

export interface HistoryEntry {
  id: string;
  url: string;
  itemCount: number;
  truncated: boolean;
  createdAt: number;
  expiresAt: number;
}

const HISTORY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export const historyItem = storage.defineItem<HistoryEntry[]>("local:stash-history", {
  fallback: [],
});

export async function getHistory(): Promise<HistoryEntry[]> {
  try {
    const history = await historyItem.getValue();
    const now = Date.now();
    const cleanedHistory = history.filter(entry => now - entry.createdAt < HISTORY_MAX_AGE_MS);

    await historyItem.setValue(cleanedHistory);
    return cleanedHistory;
  } catch {
    return [];
  }
}

export async function addToHistory(entry: HistoryEntry): Promise<void> {
  try {
    const history = await historyItem.getValue();
    const updated = [...history, entry];
    await historyItem.setValue(updated);
  } catch {
  }
}

export async function clearHistory(): Promise<void> {
  try {
    await historyItem.setValue([]);
  } catch {
  }
}
