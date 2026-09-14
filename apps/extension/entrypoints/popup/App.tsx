import { useState, useEffect, useRef } from "react";
import { useTabSelection } from "./hooks/useTabSelection";
import { TabList } from "./components/TabList";
import { SelectAllToggle } from "./components/SelectAllToggle";
import { LinkResult } from "./components/LinkResult";
import { ErrorMessage } from "./components/ErrorMessage";
import { StashesView } from "./components/StashesView";
import { SyncStatusBar } from "./components/SyncStatusBar";
import { Button } from "@/components/ui/Button";
import { encodeTabsToShareUrl, EXPIRY_HOURS_MAP } from "@stash/codec";
import { getBrotliFunctions } from "@stash/shared";
import { getSettings, type Settings } from "@/lib/settings";
import { addToHistory } from "@/lib/history";
import { appendShareEvent } from "@/lib/stash-store";
import { createStash, listStashes } from "@/lib/stash-store";
import { recordEvent } from "@/lib/telemetry";
import { SaveStashForm } from "./components/SaveStashForm";
import Header from "./components/Header";

const EXPIRY_LABELS: Record<string, string | undefined> = {
  "24h": "24 hours",
  "7d": "7 days",
  "30d": "30 days",
  never: undefined,
};

export default function App() {
  const { tabs, isLoading, error, setError, toggleTab, selectAll, deselectAll, selectedCount } =
    useTabSelection();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [isSettingsLoading, setIsSettingsLoading] = useState(true);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [linkItemCount, setLinkItemCount] = useState(0);
  const [linkTruncated, setLinkTruncated] = useState(false);
  const [linkTabs, setLinkTabs] = useState<Array<{ url: string; title: string }>>([]);
  const [copyUrl, setCopyUrl] = useState<string | null>(null);
  const [view, setView] = useState<"main" | "stashes" | "saveStash">("main");
  const [stashToSave, setStashToSave] = useState<Array<{ url: string; title: string }>>([]);
  const hasRecordedTabSelection = useRef(false);

  useEffect(() => {
    getSettings()
      .then(setSettings)
      .finally(() => setIsSettingsLoading(false));
    recordEvent("popup_open");
  }, []);

  function handleToggleTab(tabId: number) {
    if (!hasRecordedTabSelection.current) {
      hasRecordedTabSelection.current = true;
      recordEvent("tabs_selected");
    }
    toggleTab(tabId);
  }

  async function handleCreateLink() {
    try {
      if (!settings) return;
      if (selectedCount === 0) {
        setError("Please select at least one tab");
        return;
      }
      recordEvent("create_clicked");

      const selectedTabs = tabs.filter((t) => t.isSelected);
      const tabInfos = selectedTabs.map((t) => ({
        url: t.url,
        title: t.title,
      }));
      const brotli = await getBrotliFunctions();
      const expiryHours = EXPIRY_HOURS_MAP[settings.expiryMode];
      const result = await encodeTabsToShareUrl(
        tabInfos,
        brotli,
        expiryHours,
        settings.viewerOrigin,
      );
      const finalUrl = result.url;
      recordEvent("link_copied");

      await navigator.clipboard.writeText(finalUrl);

      const now = Date.now();
      const expiresAt = now + expiryHours * 3600 * 1000;
      await addToHistory({
        id: now.toString(36),
        url: finalUrl,
        itemCount: result.itemCount,
        truncated: result.truncated,
        createdAt: now,
        expiresAt,
      });

      // F8: also append the share to any saved stash sharing this payload
      // (payload identity = same set of item urls), so the Saved view shows
      // the full share history. stash-history keeps writing during the
      // one-release downgrade window (plan W5).
      const shareEvent = {
        url: finalUrl,
        itemCount: result.itemCount,
        truncated: result.truncated,
        createdAt: now,
        expiresAt,
      };
      const stashes = await listStashes();
      const tabUrls = new Set(tabInfos.map((t) => t.url));
      const match = stashes.find(
        (s) => s.items.length === tabInfos.length && s.items.every((i) => tabUrls.has(i.url)),
      );
      if (match) await appendShareEvent(match.id, shareEvent);

      setShareUrl(finalUrl);
      setCopyUrl(finalUrl);
      setLinkItemCount(result.itemCount);
      setLinkTruncated(result.truncated);
      setLinkTabs(tabInfos);
      setIsCopied(true);

      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error("handleCreateLink error:", err);
      setError("Failed to create share link");
    }
  }

  function handleOpenSaveStash() {
    if (selectedCount === 0) {
      setError("Please select at least one tab");
      return;
    }
    setStashToSave(tabs.filter((t) => t.isSelected).map((t) => ({ url: t.url, title: t.title })));
    setView("saveStash");
  }

  async function handleSaveStash(input: { title?: string; tags: string[]; note?: string }) {
    try {
      await createStash({ ...input, items: stashToSave });
      recordEvent("stash_saved");
    } catch (err) {
      console.error("handleSaveStash error:", err);
      setError("Failed to save stash");
      throw err;
    }
  }

  function handleStashSaved() {
    setStashToSave([]);
    setView("main");
  }

  function handleCopy() {
    if (!copyUrl) return;
    navigator.clipboard
      .writeText(copyUrl)
      .then(() => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      })
      .catch((error) => {
        console.error(error);
        setError("Failed to copy to clipboard");
      });
  }

  function handleBack() {
    setShareUrl(null);
    setCopyUrl(null);
    setIsCopied(false);
    setLinkTabs([]);
  }

  function handleSelectAll(maxCount: number) {
    selectAll(maxCount);
  }

  function handleHeaderBack() {
    if (view === "stashes" || view === "saveStash") {
      setView("main");
      setStashToSave([]);
      return;
    }
    handleBack();
  }

  if (isLoading || isSettingsLoading) {
    return (
      <div className="popup-container">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="popup-container">
      <Header
        onBack={view !== "main" || shareUrl ? () => handleHeaderBack() : undefined}
        onClickStashes={() => {
          recordEvent("stash_list_viewed");
          setView("stashes");
        }}
        onClickSettings={() => browser.runtime.openOptionsPage()}
      />

      {error && <ErrorMessage message={error} onDismiss={() => setError(null)} />}

      {view === "stashes" ? (
        <>
          <SyncStatusBar />
          <StashesView />
        </>
      ) : view === "saveStash" ? (
        <SaveStashForm
          itemCount={stashToSave.length}
          onSave={handleSaveStash}
          onSaved={handleStashSaved}
          onCancel={() => {
            setStashToSave([]);
            setView("main");
          }}
        />
      ) : (
        <>
          {shareUrl ? (
            <LinkResult
              url={shareUrl}
              onCopy={handleCopy}
              isCopied={isCopied}
              itemCount={linkItemCount}
              tabs={linkTabs}
              truncated={linkTruncated}
              totalCount={tabs.filter((t) => t.isSelected).length}
              expiresLabel={EXPIRY_LABELS[settings?.expiryMode ?? "never"]}
              shortenerEnabled={settings?.shortenerEnabled ?? false}
              shortenerOrigin={settings?.shortenerOrigin}
              onShortened={(shortUrl) => setCopyUrl(shortUrl)}
            />
          ) : (
            <>
              <SelectAllToggle
                tabs={tabs}
                onSelectAll={handleSelectAll}
                onDeselectAll={deselectAll}
              />
              <TabList tabs={tabs} onToggle={handleToggleTab} />
              <div className="popup-actions">
                <Button variant="primary" onClick={handleCreateLink} disabled={selectedCount === 0}>
                  Share tabs ({selectedCount})
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleOpenSaveStash}
                  disabled={selectedCount === 0}
                  title="Keep this session in your stash library on this device."
                >
                  Save locally
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
