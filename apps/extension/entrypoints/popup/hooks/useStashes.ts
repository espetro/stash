import { useState, useEffect, useCallback } from "react";
import {
  listStashes,
  createStash,
  importStashes,
  updateStash,
  deleteStash,
  searchStashes,
  type StashRecord,
  type CreateStashInput,
  type UpdateStashInput,
} from "../../../lib/stash-store";

export function useStashes() {
  const [stashes, setStashes] = useState<StashRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const all = await listStashes();
      setStashes(all);
    } catch {
      setError("Failed to load stashes");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const create = useCallback(async (input: CreateStashInput) => {
    try {
      const record = await createStash(input);
      setStashes((prev) => [...prev, record]);
      return record;
    } catch {
      setError("Failed to create stash");
      return undefined;
    }
  }, []);

  const importRecords = useCallback(async (records: StashRecord[]) => {
    try {
      const added = await importStashes(records);
      if (added.length > 0) {
        setStashes((prev) => [...prev, ...added]);
      }
      return added;
    } catch {
      setError("Failed to import stashes");
      return undefined;
    }
  }, []);

  const update = useCallback(async (id: string, patch: UpdateStashInput) => {
    try {
      const updated = await updateStash(id, patch);
      if (updated) {
        setStashes((prev) => prev.map((s) => (s.id === id ? updated : s)));
      }
      return updated;
    } catch {
      setError("Failed to update stash");
      return undefined;
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    try {
      const removed = await deleteStash(id);
      if (removed) {
        setStashes((prev) => prev.filter((s) => s.id !== id));
      }
      return removed;
    } catch {
      setError("Failed to delete stash");
      return false;
    }
  }, []);

  const search = useCallback(async (query: string) => {
    try {
      return await searchStashes(query);
    } catch {
      setError("Failed to search stashes");
      return [];
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    stashes,
    isLoading,
    error,
    setError,
    refresh,
    create,
    importRecords,
    update,
    remove,
    search,
  };
}
