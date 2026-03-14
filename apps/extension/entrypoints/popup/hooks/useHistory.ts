import { useState, useEffect, useCallback } from "react";
import { getHistory, addToHistory, clearHistory, type HistoryEntry } from "../../../lib/history";

export function useHistory() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const history = await getHistory();
      setEntries(history);
    } catch (err) {
      setError("Failed to load history");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const add = useCallback(async (entry: HistoryEntry) => {
    try {
      await addToHistory(entry);
      setEntries(prev => [...prev, entry]);
    } catch (err) {
      setError("Failed to add to history");
    }
  }, []);

  const clear = useCallback(async () => {
    try {
      await clearHistory();
      setEntries([]);
    } catch (err) {
      setError("Failed to clear history");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { entries, isLoading, error, refresh, add, clear };
}
