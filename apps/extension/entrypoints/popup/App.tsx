import { useState, useEffect, useRef } from "react";
import { useTabSelection } from "./hooks/useTabSelection";
import { TabList } from "./components/TabList";
import { SelectAllToggle } from "./components/SelectAllToggle";
import { LinkResult } from "./components/LinkResult";
import { ErrorMessage } from "./components/ErrorMessage";
import { HistoryView } from "./components/HistoryView";
import { StashesView } from "./components/StashesView";
import { Button } from "@/components/ui/Button";
import { encodeTabsToShareUrl, EXPIRY_HOURS_MAP } from "@stash/codec";
import { getBrotliFunctions } from "@stash/shared";
import { getSettings, type Settings } from "@/lib/settings";
import { addToHistory, type HistoryEntry } from "@/lib/history";
import { createStash } from "@/lib/stash-store";
import { createShortLink } from "@/lib/shortener";
import { recordEvent } from "@/lib/telemetry";
import Header from "./components/Header";

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
  const [view, setView] = useState<"main" | "history" | "stashes">("main");
  const [historyLinkResult, setHistoryLinkResult] = useState<HistoryEntry | null>(null);
  const [isStashSaved, setIsStashSaved] = useState(false);
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
      const tabInfos = selectedTabs.map((t) => ({ url: t.url, title: t.title }));
      const brotli = await getBrotliFunctions();
      const expiryHours = EXPIRY_HOURS_MAP[settings.expiryMode];
      const result = await encodeTabsToShareUrl(
        tabInfos,
        brotli,
        expiryHours,
        settings.viewerOrigin,
      );

      let finalUrl = result.url;
      if (settings.shortenerEnabled) {
        const fragmentIdx = result.url.indexOf("#p=");
        if (fragmentIdx !== -1) {
          const payload = result.url.slice(fragmentIdx + "#p=".length);
          const shortResult = await createShortLink({
            payload,
            ttlDays: 7,
            shortenerOrigin: settings.shortenerOrigin,
          });
          if ("url" in shortResult) {
            finalUrl = shortResult.url;
            recordEvent("shortener_used");
          } else {
            recordEvent("link_copied");
          }
        }
      } else {
        recordEvent("link_copied");
      }

      await navigator.clipboard.writeText(finalUrl);

      const expiresAt = Date.now() + expiryHours * 3600 * 1000;
      await addToHistory({
        id: Date.now().toString(36),
        url: finalUrl,
        itemCount: result.itemCount,
        truncated: result.truncated,
        createdAt: Date.now(),
        expiresAt,
      });

      setShareUrl(finalUrl);
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

  async function handleSaveStash() {
    try {
      if (selectedCount === 0) {
        setError("Please select at least one tab");
        return;
      }

      const selectedTabs = tabs.filter((t) => t.isSelected);
      const items = selectedTabs.map((t) => ({ url: t.url, title: t.title }));
      await createStash({ items });
      recordEvent("stash_saved");

      setIsStashSaved(true);
      setTimeout(() => setIsStashSaved(false), 2000);
    } catch (err) {
      console.error("handleSaveStash error:", err);
      setError("Failed to save stash");
    }
  }

  async function handleCopy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      console.error(error);
      setError("Failed to copy to clipboard");
    }
  }

  function handleBack() {
    setShareUrl(null);
    setHistoryLinkResult(null);
    setIsCopied(false);
    setLinkTabs([]);
  }

  function handleSelectAll(maxCount: number) {
    selectAll(maxCount);
  }

  function handleShowLinkResult(entry: HistoryEntry) {
    setHistoryLinkResult(entry);
  }

  function handleBackFromHistory() {
    setHistoryLinkResult(null);
    setView("main");
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
        onClickStashes={() => {
          recordEvent("stash_list_viewed");
          setView("stashes");
        }}
        onClickHistory={() => setView("history")}
        onClickSettings={() => browser.runtime.openOptionsPage()}
      />

      {error && <ErrorMessage message={error} onDismiss={() => setError(null)} />}

      {view === "stashes" ? (
        <StashesView onBack={() => setView("main")} />
      ) : view === "history" ? (
        historyLinkResult ? (
          <>
            <LinkResult
              url={historyLinkResult.url}
              onCopy={handleCopy}
              isCopied={false}
              itemCount={historyLinkResult.itemCount}
              tabs={[]}
              truncated={historyLinkResult.truncated}
              totalCount={historyLinkResult.itemCount}
            />
            <div className="popup-actions">
              <Button variant="secondary" onClick={handleBackFromHistory}>
                ← Back to History
              </Button>
            </div>
          </>
        ) : (
          <HistoryView onBack={() => setView("main")} onShowLinkResult={handleShowLinkResult} />
        )
      ) : (
        <>
          {shareUrl ? (
            <>
              <LinkResult
                url={shareUrl}
                onCopy={handleCopy}
                isCopied={isCopied}
                itemCount={linkItemCount}
                tabs={linkTabs}
                truncated={linkTruncated}
                totalCount={tabs.filter((t) => t.isSelected).length}
              />
              <div className="popup-actions">
                <Button variant="secondary" onClick={handleBack}>
                  ← Back to Selection
                </Button>
              </div>
            </>
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
                  Create Link ({selectedCount})
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleSaveStash}
                  disabled={selectedCount === 0}
                >
                  {isStashSaved ? "Saved!" : "Save Stash"}
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
