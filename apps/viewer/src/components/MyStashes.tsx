import * as React from "react";
import { useState, useRef, useCallback } from "react";
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
import {
  FaMagnifyingGlass,
  FaPlus,
  FaFileArrowDown,
  FaFileArrowUp,
  FaTrash,
  FaPen,
} from "react-icons/fa6";

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
  lang,
}: {
  record: StashRecord;
  onRename: (id: string, patch: { title?: string; tags: string[]; note?: string }) => void;
  onDelete: (id: string) => void;
  lang: Parameters<typeof t>[2];
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

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
          <span className="truncate text-sm font-semibold text-foreground">
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
            {record.items.length} {t("myStashes.items", undefined, lang)} ·{" "}
            {formatDateTime(record.updatedAt)}
          </span>
        </div>
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
      </button>

      {expanded && (
        <div className="border-t border-border">
          {editing ? (
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
              {record.items.map((item, index) => (
                <React.Fragment key={item.url + index}>
                  {index > 0 && <div className="h-px bg-border" />}
                  <TabListItem url={item.url} title={item.title} />
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

export default function MyStashes() {
  const { lang } = useLocale();
  const { query, setQuery, records, rename, remove, exportJson, importJson } = useStashLibrary();
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  return (
    <div className="flex min-h-screen flex-col items-center p-3 pt-6 sm:pt-8">
      <AppHeader />

      <SharedCard>
        <SharedCardHeader title={t("myStashes.title", undefined, lang)} />

        <SharedCardContent>
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
            <div className="flex flex-col gap-2">
              {records.map((record) => (
                <StashCard
                  key={record.id}
                  record={record}
                  lang={lang}
                  onRename={rename}
                  onDelete={remove}
                />
              ))}
            </div>
          )}

          {importMessage && (
            <p className="text-center text-xs text-muted-foreground">{importMessage}</p>
          )}
        </SharedCardContent>
      </SharedCard>

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

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={handleImportFile}
      />
    </div>
  );
}
