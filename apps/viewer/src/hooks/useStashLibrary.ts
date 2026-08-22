import { useState, useCallback, useEffect, useRef } from "react";
import {
  type StashRecord,
  listStashes,
  searchStashes,
  updateStash,
  deleteStash,
  exportStashes,
  importStashes,
} from "@/lib/stash-store";
import { recordEvent } from "@/lib/telemetry";

export function useStashLibrary() {
  const [query, setQuery] = useState("");
  const [records, setRecords] = useState<StashRecord[]>([]);
  const hasRecordedListViewed = useRef(false);

  const refresh = useCallback(() => {
    setRecords(query.trim() ? searchStashes(query) : listStashes());
  }, [query]);

  useEffect(() => {
    refresh();
    if (!hasRecordedListViewed.current) {
      hasRecordedListViewed.current = true;
      recordEvent("stash_list_viewed");
    }
  }, [refresh]);

  const rename = useCallback(
    (id: string, patch: Partial<Pick<StashRecord, "title" | "tags" | "note">>) => {
      updateStash(id, patch);
      refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    (id: string) => {
      deleteStash(id);
      refresh();
    },
    [refresh],
  );

  const exportJson = useCallback(() => {
    recordEvent("export_used");
    const data = exportStashes();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `stash-export-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, []);

  const importJson = useCallback(
    async (file: File): Promise<{ imported: number; error?: string }> => {
      recordEvent("import_used");
      let parsed: unknown;
      try {
        parsed = JSON.parse(await file.text());
      } catch {
        return { imported: 0, error: "Could not parse file as JSON" };
      }
      const result = importStashes(parsed);
      refresh();
      return result;
    },
    [refresh],
  );

  return { query, setQuery, records, rename, remove, exportJson, importJson };
}
