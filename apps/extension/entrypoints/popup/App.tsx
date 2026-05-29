import React, { useState, useEffect } from "react";
import { useTabSelection } from "./hooks/useTabSelection";
import { TabList } from "./components/TabList";
import { SelectAllToggle } from "./components/SelectAllToggle";
import { LinkResult } from "./components/LinkResult";
import { ErrorMessage } from "./components/ErrorMessage";
import { HistoryView } from "./components/HistoryView";
import { Button } from "../../components/ui/Button";
import { encodeTabsToShareUrl, EXPIRY_HOURS_MAP } from "@stash/codec";
import { getBrotliFunctions } from "@stash/shared";
import { getSettings, type Settings } from "../../lib/settings";
import { addToHistory } from "../../lib/history";

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
    } catch (err) {
      setError("Failed to copy to clipboard");
    }
  }

  function handleBack() {
    setShareUrl(null);
    setIsCopied(false);
    setLinkTabs([]);
  }

  function handleSelectAll(maxCount: number) {
    selectAll(maxCount);
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
      <div className="popup-header">
        <h1>Stash</h1>
        <div className="header-buttons">
          <button
            className="theme-toggle"
            onClick={() => setView("history")}
            aria-label="View history"
            title="History"
          >
            🕐
          </button>
          <button
            className="theme-toggle"
            onClick={() => browser.runtime.openOptionsPage()}
            aria-label="Open settings"
            title="Settings"
          >
            ⚙️
          </button>
        </div>
      </div>

      {error && <ErrorMessage message={error} onDismiss={() => setError(null)} />}

      {view === "history" ? (
        <HistoryView onBack={() => setView("main")} />
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
                <Button
                  variant="primary"
                  onClick={handleCreateLink}
                  disabled={selectedCount === 0}
                >
                  Create Link ({selectedCount})
                </Button>
              </div>
            </>
          )}
        </>
      )}
      <div className="popup-footer">
        <span className="version">v{import.meta.env.APP_VERSION}</span>
      </div>
    </div>
  );
}
