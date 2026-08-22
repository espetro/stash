import { useMemo, useRef, useState } from "react";
import { LuArchive, LuDownload, LuUpload } from "react-icons/lu";
import { useStashes } from "../hooks/useStashes";
import { StashItem } from "./StashItem";
import { ErrorMessage } from "./ErrorMessage";
import { exportStashesToJSON, parseStashesImport } from "../../../lib/stash-io";
import { recordEvent } from "../../../lib/telemetry";
import type { StashRecord } from "../../../lib/stash-store";

const sortByUpdatedDesc = (a: StashRecord, b: StashRecord) => b.updatedAt - a.updatedAt;

interface StashesViewProps {
  onBack: () => void;
}

export function StashesView({ onBack }: StashesViewProps) {
  const { stashes, isLoading, error, setError, update, remove, create } = useStashes();
  const [searchQuery, setSearchQuery] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredStashes = useMemo(() => {
    const sorted = [...stashes].sort(sortByUpdatedDesc);
    const query = searchQuery.trim().toLowerCase();
    if (!query) return sorted;

    return sorted.filter((s) => {
      const title = s.title?.toLowerCase() ?? "";
      const note = s.note?.toLowerCase() ?? "";
      const tags = s.tags.join(" ").toLowerCase();
      return title.includes(query) || note.includes(query) || tags.includes(query);
    });
  }, [stashes, searchQuery]);

  function handleExport() {
    recordEvent("export_used");
    const json = exportStashesToJSON(stashes);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stash-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    try {
      recordEvent("import_used");
      const text = await file.text();
      const imported = parseStashesImport(text);
      const existingIds = new Set(stashes.map((s) => s.id));
      for (const record of imported) {
        if (existingIds.has(record.id)) continue;
        await create({
          title: record.title,
          tags: record.tags,
          note: record.note,
          items: record.items,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import stashes");
    }
  }

  if (isLoading) {
    return (
      <div className="stash-view">
        <div className="loading">Loading stashes...</div>
      </div>
    );
  }

  return (
    <div className="stash-view">
      <div className="stash-header">
        <div className="stash-header-left">
          <button className="stash-back-btn" onClick={onBack} aria-label="Go back" type="button">
            ←
          </button>
          <span className="stash-title">My Stashes</span>
        </div>
        <div className="stash-header-actions">
          <button
            className="stash-header-btn"
            onClick={handleExport}
            aria-label="Export stashes"
            title="Export as JSON"
            type="button"
            disabled={stashes.length === 0}
          >
            <LuDownload />
          </button>
          <button
            className="stash-header-btn"
            onClick={handleImportClick}
            aria-label="Import stashes"
            title="Import from JSON"
            type="button"
          >
            <LuUpload />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            style={{ display: "none" }}
            onChange={handleImportFile}
          />
        </div>
      </div>

      {error && <ErrorMessage message={error} onDismiss={() => setError(null)} />}

      {stashes.length > 0 && (
        <input
          type="text"
          className="history-search"
          placeholder="Search by title, tag, or note..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      )}

      {filteredStashes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <LuArchive />
          </div>
          {stashes.length === 0 ? "No stashes yet" : "No matching stashes"}
        </div>
      ) : (
        <div className="stash-list">
          {filteredStashes.map((stash) => (
            <StashItem
              key={stash.id}
              stash={stash}
              onUpdate={(patch) => update(stash.id, patch)}
              onDelete={() => remove(stash.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
