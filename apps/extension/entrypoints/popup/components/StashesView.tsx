import { useMemo, useRef, useState } from "react";
import { LuArchive, LuDownload, LuUpload } from "react-icons/lu";
import { encodeTabsToShareUrl, EXPIRY_HOURS_MAP } from "@stash/codec";
import { getBrotliFunctions } from "@stash/shared";
import { useStashes } from "../hooks/useStashes";
import { StashItem } from "./StashItem";
import { ErrorMessage } from "./ErrorMessage";
import { exportStashesToJSON, parseStashesImport } from "../../../lib/stash-io";
import { addToHistory } from "../../../lib/history";
import { getSettings } from "../../../lib/settings";
import { recordEvent } from "../../../lib/telemetry";
import { isKept, type StashRecord } from "../../../lib/stash-store";

const sortByUpdatedDesc = (a: StashRecord, b: StashRecord) => b.updatedAt - a.updatedAt;

type LibraryFilter = "all" | "kept" | "recent";

export function StashesView() {
  const { stashes, isLoading, error, setError, update, keep, recordShare, remove, importRecords } =
    useStashes();
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<LibraryFilter>("all");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredStashes = useMemo(() => {
    const filtered = stashes.filter((stash) => {
      if (filter === "kept") return isKept(stash);
      if (filter === "recent") return !isKept(stash);
      return true;
    });
    const sorted = filtered.sort(sortByUpdatedDesc);
    const query = searchQuery.trim().toLowerCase();
    if (!query) return sorted;

    return sorted.filter((s) => {
      const title = s.title?.toLowerCase() ?? "";
      const note = s.note?.toLowerCase() ?? "";
      const tags = s.tags.join(" ").toLowerCase();
      return title.includes(query) || note.includes(query) || tags.includes(query);
    });
  }, [stashes, searchQuery, filter]);

  const keptCount = stashes.filter(isKept).length;
  const recentCount = stashes.length - keptCount;

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
      await importRecords(imported);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import stashes");
    }
  }

  async function handleShare(stash: StashRecord) {
    try {
      const settings = await getSettings();
      const brotli = await getBrotliFunctions();
      const expiryHours = EXPIRY_HOURS_MAP[settings.expiryMode];
      const title = stash.title?.trim() || undefined;
      const result = await encodeTabsToShareUrl(
        stash.items,
        brotli,
        expiryHours,
        settings.viewerOrigin,
        title,
        stash.tags,
        stash.note,
      );
      const now = Date.now();
      const expiresAt = now + expiryHours * 3600 * 1000;

      await navigator.clipboard.writeText(result.url);
      await addToHistory({
        id: now.toString(36),
        url: result.url,
        itemCount: result.itemCount,
        truncated: result.truncated,
        createdAt: now,
        expiresAt,
      });
      await recordShare({
        items: stash.items,
        title,
        sourceId: stash.id,
        share: {
          url: result.url,
          itemCount: result.itemCount,
          truncated: result.truncated,
          createdAt: now,
          expiresAt,
        },
      });
    } catch {
      setError("Failed to create share link");
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
          <span className="stash-title">Library</span>
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
        <>
          <div className="library-filters" aria-label="Filter library">
            <button
              type="button"
              className={`library-filter ${filter === "all" ? "library-filter-active" : ""}`}
              aria-pressed={filter === "all"}
              onClick={() => setFilter("all")}
            >
              All · {stashes.length}
            </button>
            <button
              type="button"
              className={`library-filter ${filter === "kept" ? "library-filter-active" : ""}`}
              aria-pressed={filter === "kept"}
              onClick={() => setFilter("kept")}
            >
              Kept · {keptCount}
            </button>
            <button
              type="button"
              className={`library-filter ${filter === "recent" ? "library-filter-active" : ""}`}
              aria-pressed={filter === "recent"}
              onClick={() => setFilter("recent")}
            >
              Recent · {recentCount}
            </button>
          </div>
          <input
            type="text"
            className="history-search"
            placeholder="Search by title, tag, or note..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </>
      )}

      {filteredStashes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <LuArchive />
          </div>
          {stashes.length === 0
            ? "No stashes yet"
            : searchQuery
              ? "No matching stashes"
              : filter === "kept"
                ? "No kept stashes"
                : filter === "recent"
                  ? "No Recent stashes"
                  : "No matching stashes"}
        </div>
      ) : (
        <div className="stash-list">
          {filteredStashes.map((stash) => (
            <StashItem
              key={stash.id}
              stash={stash}
              onUpdate={(patch) => update(stash.id, patch)}
              onDelete={() => remove(stash.id)}
              onKeep={() => keep(stash.id)}
              onShare={() => handleShare(stash)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
