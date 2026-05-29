import { useState, useEffect } from "react";
import { useTabSelection } from "./hooks/useTabSelection";
import { TabList } from "./components/TabList";
import { SelectAllToggle } from "./components/SelectAllToggle";
import { LinkResult } from "./components/LinkResult";
import { ErrorMessage } from "./components/ErrorMessage";
import { HistoryView } from "./components/HistoryView";
import { Button } from "@/components/ui/Button";
import { encodeTabsToShareUrl, EXPIRY_HOURS_MAP } from "@stash/codec";
import { getBrotliFunctions } from "@stash/shared";
import { getSettings, type Settings } from "@/lib/settings";
import { addToHistory, type HistoryEntry } from "@/lib/history";
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
  const [view, setView] = useState<"main" | "history">("main");
  const [historyLinkResult, setHistoryLinkResult] = useState<HistoryEntry | null>(null);

  useEffect(() => {
    getSettings()
      .then(setSettings)
      .finally(() => setIsSettingsLoading(false));
  }, []);

  async function handleCreateLink() {
    try {
      if (!settings) return;
      if (selectedCount === 0) {
        setError("Please select at least one tab");
        return;
      }

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

      await navigator.clipboard.writeText(result.url);

      const expiresAt = Date.now() + expiryHours * 3600 * 1000;
      await addToHistory({
        id: Date.now().toString(36),
        url: result.url,
        itemCount: result.itemCount,
        truncated: result.truncated,
        createdAt: Date.now(),
        expiresAt,
      });

      setShareUrl(result.url);
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
        onClickHistory={() => setView("history")}
        onClickSettings={() => browser.runtime.openOptionsPage()}
      />

      {error && <ErrorMessage message={error} onDismiss={() => setError(null)} />}

      {view === "history" ? (
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
              <TabList tabs={tabs} onToggle={toggleTab} />
              <div className="popup-actions">
                <Button variant="primary" onClick={handleCreateLink} disabled={selectedCount === 0}>
                  Create Link ({selectedCount})
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
