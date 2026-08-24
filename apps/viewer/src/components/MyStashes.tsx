import * as React from "react";
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import AppHeader from "@/components/AppHeader";
import { useLocale } from "@/components/LocaleProvider";
import { t } from "@/i18n";
import {
  SharedCard,
  SharedCardHeader,
  SharedCardContent,
  SharedButtonArea,
  PrimaryButton,
  OutlineButton,
} from "@/components/shared";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { TabListItem } from "@/components/TabListItem";
import { useStashLibrary } from "@/hooks/useStashLibrary";
import type { StashRecord } from "@/lib/stash-store";
import { formatDateTime } from "@stash/shared";
import { recordEvent } from "@/lib/telemetry";
import { probeLocalBridge } from "@/lib/local-bridge";
import type { StashExportRecord, StashExport } from "@stash/shared/agent-export";
import {
  FaMagnifyingGlass,
  FaPlus,
  FaFileArrowDown,
  FaFileArrowUp,
  FaTrash,
  FaPen,
} from "react-icons/fa6";

type LibrarySource = "extension" | "viewer-local";

function isSafeHttpUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

/**
 * Convert an extension `StashExportRecord` into a viewer-shaped
 * `StashRecord`. Title/note are passed through as-is — the canonical
 * `null` from the extension is fine for rendering (falsy in the JSX
 * checks below). Items are dropped if their URL is not `http(s)`.
 */
function exportRecordToStashRecord(rec: StashExportRecord): StashRecord {
  return {
    id: rec.id,
    title: rec.title ?? undefined,
    tags: [...rec.tags],
    note: rec.note ?? undefined,
    items: rec.items.filter((it) => isSafeHttpUrl(it.url)),
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
}

function StashEditForm({
  record,
  onSave,
  onCancel,
  lang,
}: {
  record: StashRecord;
  onSave: (patch: { title?: string; tags: string[]; note?: string }) => void;
  onCancel: () => void;
  lang: Parameters<typeof t>[2];
}) {
  const [title, setTitle] = useState(record.title ?? "");
  const [tags, setTags] = useState(record.tags.join(", "));
  const [note, setNote] = useState(record.note ?? "");

  return (
    <div className="flex flex-col gap-2 px-4 pb-4">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t("myStashes.titlePlaceholder", undefined, lang)}
        className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
      />
      <input
        type="text"
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        placeholder={t("myStashes.tagsPlaceholder", undefined, lang)}
        className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
      />
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t("myStashes.notePlaceholder", undefined, lang)}
        className="min-h-[70px] w-full resize-y rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() =>
            onSave({
              title: title.trim() || undefined,
              tags: tags
                .split(",")
                .map((tag) => tag.trim())
                .filter(Boolean),
              note: note.trim() || undefined,
            })
          }
          className="h-9 flex-1 rounded-lg bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          {t("myStashes.save", undefined, lang)}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-9 flex-1 rounded-lg border border-border bg-card text-sm font-semibold text-foreground hover:bg-secondary"
        >
          {t("myStashes.cancel", undefined, lang)}
        </button>
      </div>
    </div>
  );
}

function StashCard({
  record,
  onRename,
  onDelete,
  readOnly,
  lang,
}: {
  record: StashRecord;
  onRename: (id: string, patch: { title?: string; tags: string[]; note?: string }) => void;
  onDelete: (id: string) => void;
  readOnly: boolean;
  lang: Parameters<typeof t>[2];
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const safeItems = useMemo(
    () => record.items.filter((it) => isSafeHttpUrl(it.url)),
    [record.items],
  );

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() =>
          setExpanded((v) => {
            if (!v) recordEvent("stash_reopened");
            return !v;
          })
        }
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex min-w-0 flex-col gap-1">
          <span data-stash-title className="truncate text-sm font-semibold text-foreground">
            {record.title || t("myStashes.untitled", undefined, lang)}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {record.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
          <span className="text-xs text-muted-foreground">
            {safeItems.length} {t("myStashes.items", undefined, lang)} ·{" "}
            {formatDateTime(record.updatedAt)}
          </span>
        </div>
        {!readOnly && (
          <div className="flex shrink-0 items-center gap-3">
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                setEditing((v) => !v);
                setExpanded(true);
              }}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.click()}
              aria-label={t("myStashes.edit", undefined, lang)}
              className="cursor-pointer text-muted-foreground hover:text-foreground"
            >
              <FaPen className="size-3.5" />
            </span>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                setConfirmDelete(true);
              }}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.click()}
              aria-label={t("myStashes.delete", undefined, lang)}
              className="cursor-pointer text-muted-foreground hover:text-red-600"
            >
              <FaTrash className="size-3.5" />
            </span>
          </div>
        )}
      </button>

      {expanded && (
        <div className="border-t border-border">
          {editing && !readOnly ? (
            <StashEditForm
              record={record}
              lang={lang}
              onCancel={() => setEditing(false)}
              onSave={(patch) => {
                onRename(record.id, patch);
                setEditing(false);
              }}
            />
          ) : (
            <>
              {record.note && (
                <p className="border-b border-border px-4 py-3 text-sm whitespace-pre-wrap text-foreground">
                  {record.note}
                </p>
              )}
              {safeItems.map((item, index) => (
                <React.Fragment key={item.url + index}>
                  {index > 0 && <div className="h-px bg-border" />}
                  <SafeTabListItem url={item.url} title={item.title} />
                </React.Fragment>
              ))}
            </>
          )}
        </div>
      )}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("myStashes.deleteConfirmTitle", undefined, lang)}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("myStashes.deleteConfirmBody", undefined, lang)}
          </p>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="h-9 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-secondary"
            >
              {t("myStashes.cancel", undefined, lang)}
            </button>
            <button
              type="button"
              onClick={() => {
                onDelete(record.id);
                setConfirmDelete(false);
              }}
              className="h-9 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700"
            >
              {t("myStashes.deleteConfirm", undefined, lang)}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Render a `TabListItem` for an item whose URL has been pre-validated as
 * `http(s)`. `TabListItem` enforces `rel="noopener noreferrer nofollow"`
 * on its outbound anchor and sets `target="_blank"`.
 */
function SafeTabListItem({ url, title }: { url: string; title: string }) {
  return <TabListItem url={url} title={title} />;
}

/**
 * Build the canonical `StashExport` for the JSON island.
 * - `source === "extension"`: trust the bridge payload verbatim.
 * - `source === "viewer-local"`: per the plan, expose an empty
 *   `stashes: []` rather than duplicating viewer-localStorage records.
 */
function buildIslandExport(source: LibrarySource, bridgeExport: StashExport | null): StashExport {
  if (source === "extension" && bridgeExport) {
    return {
      version: 1,
      source: "extension",
      stashes: bridgeExport.stashes,
    };
  }
  return { version: 1, source: "viewer-local", stashes: [] };
}

/**
 * Render a record as Markdown following the `/s` conventions: title
 * heading, a bulleted line per item, an optional tags line, and an
 * optional note line. The `http(s)`-only filter is applied before this
 * is called, so item URLs are safe to embed raw.
 */
function recordToMarkdown(record: StashRecord): string {
  const heading = record.title?.trim() || "Untitled";
  const lines: string[] = [`# ${heading}`, ""];
  if (record.items.length === 0) {
    lines.push("_(no items)_", "");
  } else {
    for (const item of record.items) {
      // Item titles may contain markdown metacharacters; only escape
      // backslashes for now and let the link text fall through. URLs
      // are already http(s) and will be rendered by the agent.
      const label = item.title || item.url;
      lines.push(`- [${label}](${item.url})`);
    }
    lines.push("");
  }
  if (record.tags.length > 0) {
    lines.push(`tags: ${record.tags.join(", ")}`);
  }
  if (record.note) {
    lines.push(`note: ${record.note}`);
  }
  return lines.join("\n");
}

/**
 * Detect the optional `?agent=json|markdown` browser-only view.
 * Client-side only; this is intentionally not a fetch endpoint (the
 * `client:only` Astro shell returns an empty document to non-browser
 * clients — fetch agents must use `/s` instead).
 */
function readAgentMode(): "json" | "markdown" | null {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("agent");
  if (value === "json" || value === "markdown") return value;
  return null;
}

export default function MyStashes() {
  const { lang } = useLocale();
  const {
    query,
    setQuery,
    records: viewerRecords,
    rename,
    remove,
    exportJson,
    importJson,
  } = useStashLibrary();
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Source-aware loading: probe the extension bridge after mount. If it
  // returns an `extension` source, render those records in-memory and
  // do NOT touch viewer localStorage. Otherwise fall back to
  // useStashLibrary() (viewer localStorage).
  const [source, setSource] = useState<LibrarySource>("viewer-local");
  const [extensionRecords, setExtensionRecords] = useState<StashRecord[]>([]);
  // The bridge payload itself, kept around so the JSON island can copy
  // it verbatim. `null` while probing or when the bridge is unavailable.
  const [bridgeExport, setBridgeExport] = useState<StashExport | null>(null);
  // `loading` until the bridge probe resolves or the viewer-local
  // fallback is selected. Mirrors the lifecycle required by the plan's
  // `data-stash-status` attribute on the JSON island.
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await probeLocalBridge();
      if (cancelled) return;
      if (result.available && result.export && result.export.source === "extension") {
        setExtensionRecords(result.export.stashes.map(exportRecordToStashRecord));
        setSource("extension");
        setBridgeExport(result.export);
      } else {
        setSource("viewer-local");
        setBridgeExport(null);
      }
      setStatus("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredExtensionRecords = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return extensionRecords;
    return extensionRecords.filter((r) => {
      const haystack = [r.title ?? "", ...r.tags, r.note ?? ""].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [extensionRecords, query]);

  const records = source === "extension" ? filteredExtensionRecords : viewerRecords;

  const handleNew = useCallback(() => {
    window.location.href = "/s/new";
  }, []);

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleImportFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      const result = await importJson(file);
      setImportMessage(
        result.error
          ? t("myStashes.importError", undefined, lang)
          : t("myStashes.importSuccess", { count: result.imported }, lang),
      );
      setTimeout(() => setImportMessage(null), 3000);
    },
    [importJson, lang],
  );

  const isExtensionSource = source === "extension";

  // The agent island payload is built from the bridge export when the
  // extension source is active, and from an empty `viewer-local`
  // fallback otherwise — we never duplicate viewer-localStorage records
  // into the island.
  const islandExport = useMemo(
    () => buildIslandExport(source, bridgeExport),
    [source, bridgeExport],
  );
  const islandJson = useMemo(() => JSON.stringify(islandExport), [islandExport]);

  // Optional `?agent=json|markdown` browser-only view. Read once on
  // mount so the very first render already lands in the right shape
  // (avoids a SharedCard→agent-mode flicker when an agent navigates
  // straight to /stashes?agent=json|markdown).
  const [agentMode] = useState<"json" | "markdown" | null>(() => readAgentMode());

  if (agentMode === "json") {
    return (
      <div data-stash-root data-stash-status={status} className="min-h-screen p-3">
        <pre id="agent-export" data-stash-status={status}>
          {islandJson}
        </pre>
      </div>
    );
  }

  if (agentMode === "markdown") {
    const markdown = records.map(recordToMarkdown).join("\n\n");
    return (
      <div data-stash-root data-stash-status={status} className="min-h-screen p-3">
        <pre id="agent-export-md" data-stash-status={status}>
          {markdown}
        </pre>
      </div>
    );
  }

  return (
    <div data-stash-root className="flex min-h-screen flex-col items-center p-3 pt-6 sm:pt-8">
      <AppHeader />

      <SharedCard>
        <SharedCardHeader title={t("myStashes.title", undefined, lang)} />

        <SharedCardContent>
          <div className="flex flex-wrap items-center gap-2">
            <span
              data-testid="stash-source-chip"
              data-stash-source={source}
              className="rounded-full bg-muted px-3 py-1 text-[11px] font-medium text-muted-foreground"
            >
              {isExtensionSource
                ? t("myStashes.sourceExtension", undefined, lang)
                : t("myStashes.sourceViewer", undefined, lang)}
            </span>
            {isExtensionSource && (
              <span className="rounded-full bg-secondary px-3 py-1 text-[11px] text-muted-foreground">
                {t("myStashes.readOnlyHint", undefined, lang)}
              </span>
            )}
          </div>

          <div className="relative">
            <FaMagnifyingGlass className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("myStashes.searchPlaceholder", undefined, lang)}
              className="w-full rounded-xl border border-border bg-secondary py-2.5 pr-3 pl-9 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
            />
          </div>

          {records.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              {t("myStashes.empty", undefined, lang)}
            </p>
          ) : (
            <div data-stash-list className="flex flex-col gap-2">
              {records.map((record) => (
                <div data-stash-record-id={record.id} key={record.id}>
                  <StashCard
                    record={record}
                    lang={lang}
                    onRename={rename}
                    onDelete={remove}
                    readOnly={isExtensionSource}
                  />
                </div>
              ))}
            </div>
          )}

          {importMessage && (
            <p className="text-center text-xs text-muted-foreground">{importMessage}</p>
          )}
        </SharedCardContent>
      </SharedCard>

      {!isExtensionSource && (
        <SharedButtonArea>
          <PrimaryButton onClick={handleNew}>
            <FaPlus className="size-4" />
            {t("myStashes.newStash", undefined, lang)}
          </PrimaryButton>
          <div className="flex justify-center gap-2">
            <OutlineButton
              onClick={exportJson}
              aria-label={t("myStashes.export", undefined, lang)}
              className="size-10 rounded-xl p-0"
            >
              <FaFileArrowDown className="size-4" />
            </OutlineButton>
            <OutlineButton
              onClick={handleImportClick}
              aria-label={t("myStashes.import", undefined, lang)}
              className="size-10 rounded-xl p-0"
            >
              <FaFileArrowUp className="size-4" />
            </OutlineButton>
          </div>
        </SharedButtonArea>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={handleImportFile}
      />

      {/*
        Deterministic browser-agent contract: a single JSON island
        inside the page root. Lifecycle: `data-stash-status` starts
        `loading` and flips to `ready` once the bridge probe (or
        viewer-local fallback) settles. The island is the ONLY canonical
        export surface — records are NOT mirrored into URL fragments,
        per-record data-attrs, window globals, or page storage.
      */}
      <script type="application/json" id="stash-local-export" data-stash-status={status}>
        {islandJson}
      </script>
    </div>
  );
}
