import * as React from "react";
import { useState, useCallback, useRef } from "react";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import LanguageSelector from "@/components/LanguageSelector";
import { useLocale } from "@/components/LocaleProvider";
import { t } from "@/i18n";
import { ShareDrawer } from "./ShareDrawer";
import { QrDialogContent } from "./QrDialog";
import { Dialog } from "@/components/ui/dialog";
import { TabListItem } from "@/components/TabListItem";
import { useDecodeShareUrl, type DecodedData } from "@/hooks/useDecodeShareUrl";
import { buildCaption } from "@stash/shared";
import { encodeTabsToShareUrl, EXPIRY_HOURS_MAP } from "@stash/codec";
import { getBrotliFunctions } from "@stash/shared";
import {
  SharedCard,
  SharedCardHeader,
  SharedCardContent,
  SharedButtonArea,
  SplitButtonGroup,
  OutlineButton,
} from "@/components/shared";
import { FaRegSquare, FaRegSquareCheck } from "react-icons/fa6";

type Item = DecodedData["items"][number];

function NoteDialog({
  note,
  title,
  onClose,
}: {
  note: string;
  title: string;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div
          role="dialog"
          aria-label={title}
          className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl"
        >
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            {title}
          </h2>
          <p className="text-sm leading-relaxed break-words whitespace-pre-wrap text-foreground select-text">
            {note}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-5 h-11 w-full rounded-xl border border-border bg-secondary text-sm font-semibold text-foreground hover:bg-muted"
          >
            {t("sharedTabs.close", undefined, undefined)}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function JsonOutput({ data }: { data: DecodedData }) {
  const output = {
    expiry: data.expiry,
    isExpired: data.isExpired,
    items: data.items.map(([url, title]) => ({ url, title })),
  };

  return (
    <pre className="whitespace-pre-wrap break-words p-4 text-sm text-foreground">
      {JSON.stringify(output, null, 2)}
    </pre>
  );
}

function MdOutput({ data }: { data: DecodedData }) {
  const lines = data.items.map(([url, title]) => {
    const escaped = title.replace(/]/g, "\\]").replace(/\[/g, "\\[");
    return `[${escaped}](${url})`;
  });

  return (
    <pre className="whitespace-pre-wrap break-words p-4 text-sm text-foreground">
      {lines.join("\n")}
    </pre>
  );
}

export default function TabViewer() {
  const { lang } = useLocale();
  const state = useDecodeShareUrl();
  const [qrOpen, setQrOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Local item list (remove-as-consumed); initialized from decoded payload.
  const [items, setItems] = useState<Item[] | null>(null);
  // Selection state: set of selected item indices; anchor for shift+click ranges.
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const lastClicked = useRef<number | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [editedUrl, setEditedUrl] = useState<string | null>(null);
  const [openNote, setOpenNote] = useState<{ text: string; title: string } | null>(null);

  const syncItems = useCallback(
    (data: DecodedData) => {
      if (items === null) setItems(data.items);
    },
    [items],
  );

  const handleNew = useCallback(() => {
    window.location.href = "/s/new";
  }, []);

  const handleShareQr = useCallback(() => {
    setQrOpen(true);
  }, []);

  const handleOpenDrawer = useCallback(() => {
    setQrOpen(false);
    setDrawerOpen(true);
  }, []);

  const handleDrawerClose = useCallback(() => {
    setDrawerOpen(false);
  }, []);

  if (state.type === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center p-3">
        <p className="text-lg font-medium text-foreground">Loading...</p>
      </div>
    );
  }

  if (state.type === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center p-3">
        <p className="text-lg font-medium text-foreground">{state.message}</p>
      </div>
    );
  }

  const { data, format } = state;
  syncItems(data);

  if (format === "json") {
    return (
      <div className="min-h-screen p-0">
        <JsonOutput data={data} />
      </div>
    );
  }

  if (format === "md") {
    return (
      <div className="min-h-screen p-0">
        <MdOutput data={data} />
      </div>
    );
  }

  const currentItems = items ?? data.items;
  const dirty = items !== null && items.length !== data.items.length;
  const allSelected = currentItems.length > 0 && selected.size === currentItems.length;

  const toggleItem = (index: number, shift: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (shift && lastClicked.current !== null) {
        const [from, to] =
          lastClicked.current < index ? [lastClicked.current, index] : [index, lastClicked.current];
        for (let i = from; i <= to; i++) next.add(i);
      } else {
        if (next.has(index)) next.delete(index);
        else next.add(index);
      }
      return next;
    });
    lastClicked.current = index;
  };

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(currentItems.map((_, i) => i)));
    lastClicked.current = null;
  };

  const removeSelected = () => {
    setItems(currentItems.filter((_, i) => !selected.has(i)));
    setSelected(new Set());
    lastClicked.current = null;
  };

  const openSelected = () => {
    for (const i of selected) {
      const item = currentItems[i];
      if (item) window.open(item[0], "_blank", "noopener,noreferrer");
    }
  };

  const saveEdited = async () => {
    if (!items) return;
    setSaveState("saving");
    try {
      const brotli = await getBrotliFunctions();
      const tabs = items.map(([url, title]) => ({ url, title }));
      // Preserve remaining lifetime of the original link
      const hoursLeft = Math.max(1, Math.round((data.expiry - Date.now() / 1000) / 3600));
      const never = data.expiry > Date.now() / 1000 + 875000 / 2;
      const expiryHours = never ? EXPIRY_HOURS_MAP.never : hoursLeft;
      const result = await encodeTabsToShareUrl(tabs, brotli, expiryHours, undefined, data.title);
      setEditedUrl(result.url);
      setSaveState("saved");
    } catch {
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 2000);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center p-3 pt-6 sm:pt-8">
      <SharedCard className="h-[75dvh] max-h-[75dvh] sm:h-[75vh]">
        <SharedCardHeader
          title={data.title ?? t("sharedTabs.title", undefined, lang)}
          caption={buildCaption(currentItems.length, data.expiry)}
        />

        <SharedCardContent className="flex flex-col overflow-hidden px-3 pb-3 sm:px-5 sm:pb-5">
          <div className="flex shrink-0 items-center justify-between px-1 pb-2">
            <button
              type="button"
              onClick={toggleAll}
              className="flex items-center gap-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              aria-pressed={allSelected}
            >
              {allSelected ? (
                <FaRegSquareCheck className="size-4" />
              ) : (
                <FaRegSquare className="size-4" />
              )}
              {allSelected
                ? t("sharedTabs.deselectAll", undefined, lang)
                : t("sharedTabs.selectAll", undefined, lang)}
            </button>
            {selected.size > 0 && (
              <div className="flex items-center gap-3 text-xs">
                <span className="text-muted-foreground">{selected.size}</span>
                <button
                  type="button"
                  onClick={openSelected}
                  className="font-medium text-primary hover:underline"
                >
                  {t("sharedTabs.openSelected", undefined, lang)}
                </button>
                <button
                  type="button"
                  onClick={removeSelected}
                  className="font-medium text-muted-foreground hover:text-foreground hover:underline"
                >
                  {t("sharedTabs.removeSelected", undefined, lang)}
                </button>
              </div>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border">
            <div className="custom-scrollbar h-full overflow-y-auto">
              {currentItems.length === 0 && (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  {t("sharedTabs.empty", undefined, lang)}
                </p>
              )}
              {currentItems.map((item, index) => (
                <React.Fragment key={item[0] + index}>
                  {index > 0 && <div className="h-px bg-border" />}
                  <TabListItem
                    url={item[0]}
                    title={item[1]}
                    kind={item[2]}
                    selected={selected.has(index)}
                    onToggle={(shift) => toggleItem(index, shift)}
                    onOpenNote={() => setOpenNote({ text: item[0], title: item[1] })}
                  />
                </React.Fragment>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-center gap-2">
            <ThemeSwitcher />
            <LanguageSelector variant="card" />
          </div>
        </SharedCardContent>
      </SharedCard>

      <SharedButtonArea>
        {dirty ? (
          <OutlineButton onClick={saveEdited} disabled={saveState === "saving"}>
            {saveState === "saving"
              ? t("stash.generating", undefined, lang)
              : saveState === "saved"
                ? t("sharedTabs.savedEdited", undefined, lang)
                : saveState === "error"
                  ? t("stash.error", undefined, lang)
                  : t("sharedTabs.saveEdited", undefined, lang)}
          </OutlineButton>
        ) : (
          <SplitButtonGroup
            mainLabel={t("sharedTabs.shareQr", undefined, lang)}
            onMainClick={handleShareQr}
            onDropdownClick={handleOpenDrawer}
          />
        )}
        <OutlineButton onClick={handleNew}>{t("sharedTabs.new", undefined, lang)}</OutlineButton>
      </SharedButtonArea>

      {editedUrl && (
        <div className="mt-3 w-full max-w-160 rounded-xl border border-border bg-muted p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            {t("sharedTabs.editedLink", undefined, lang)}
          </p>
          <a href={editedUrl} className="block break-all font-mono text-xs text-primary underline">
            {editedUrl}
          </a>
        </div>
      )}

      {openNote && (
        <NoteDialog note={openNote.text} title={openNote.title} onClose={() => setOpenNote(null)} />
      )}

      <Dialog
        open={qrOpen}
        onOpenChange={(open) => {
          setQrOpen(open);
          if (open) setDrawerOpen(false);
        }}
      >
        <QrDialogContent
          tabs={currentItems.map(([url, title]) => ({ url, title }))}
          title={data.title}
          onClose={() => setQrOpen(false)}
        />
      </Dialog>

      <ShareDrawer
        open={drawerOpen}
        onClose={handleDrawerClose}
        data={{
          expiry: data.expiry,
          isExpired: data.isExpired,
          items: currentItems,
          title: data.title,
        }}
      />
    </div>
  );
}
