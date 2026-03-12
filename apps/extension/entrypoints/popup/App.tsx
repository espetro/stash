import React, { useState } from "react";
import { useTabSelection } from "./hooks/useTabSelection";
import { TabList } from "./components/TabList";
import { SelectAllToggle } from "./components/SelectAllToggle";
import { LinkResult } from "./components/LinkResult";
import { ErrorMessage } from "./components/ErrorMessage";
import { encodeTabsToShareUrl } from "@tab-mail/codec";
import type { TabInfo } from "@tab-mail/codec";

export default function App() {
  const { tabs, isLoading, error, setError, toggleTab, selectAll, deselectAll, selectedCount } =
    useTabSelection();
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [linkItemCount, setLinkItemCount] = useState(0);
  const [linkTruncated, setLinkTruncated] = useState(false);

  async function handleCreateLink() {
    try {
      if (selectedCount === 0) {
        setError("Please select at least one tab");
        return;
      }

      const selectedTabs = tabs.filter((t) => t.isSelected);
      const tabInfos: TabInfo[] = selectedTabs.map((t) => ({ url: t.url, title: t.title }));
      const result = await encodeTabsToShareUrl(tabInfos);

      await navigator.clipboard.writeText(result.url);

      setShareUrl(result.url);
      setLinkItemCount(result.itemCount);
      setLinkTruncated(result.truncated);
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
  }

  function handleSelectAll(maxCount: number) {
    selectAll(maxCount);
  }

  if (isLoading) {
    return (
      <div className="popup-container">
        <div className="loading">Loading tabs...</div>
      </div>
    );
  }

  return (
    <div className="popup-container">
      <div className="popup-header">
        <h1>TabShare</h1>
        <button
          className="theme-toggle"
          onClick={() => browser.runtime.openOptionsPage()}
          aria-label="Open settings"
          title="Settings"
        >
          ⚙️
        </button>
      </div>

      {error && <ErrorMessage message={error} onDismiss={() => setError(null)} />}

      {shareUrl ? (
        <>
          <LinkResult
            url={shareUrl}
            onCopy={handleCopy}
            isCopied={isCopied}
            itemCount={linkItemCount}
            truncated={linkTruncated}
            totalCount={tabs.filter((t) => t.isSelected).length}
          />
          <div className="popup-actions">
            <button className="btn btn-secondary" onClick={handleBack}>
              ← Back to Selection
            </button>
          </div>
        </>
      ) : (
        <>
          <SelectAllToggle tabs={tabs} onSelectAll={handleSelectAll} onDeselectAll={deselectAll} />
          <TabList tabs={tabs} onToggle={toggleTab} />
          <div className="popup-actions">
            <button
              className="btn btn-primary"
              onClick={handleCreateLink}
              disabled={selectedCount === 0}
            >
              Create Link ({selectedCount})
            </button>
          </div>
        </>
      )}
    </div>
  );
}
