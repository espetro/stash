import { useState, useEffect, useCallback } from "react";
import type { PopupTab } from "../types";
import type { Tabs } from "webextension-polyfill";

const GOOGLE_FAVICON_URL = "https://www.google.com/s2/favicons?domain=";

function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function getFaviconUrl(url: string): string {
  const domain = getDomain(url);
  return `${GOOGLE_FAVICON_URL}${domain}&sz=32`;
}

function isValidTab(tab: Tabs.Tab): boolean {
  // Only allow http:// and https:// URLs
  return !!(
    tab.url &&
    (tab.url.startsWith("http://") || tab.url.startsWith("https://"))
  );
}

export function useTabSelection() {
  const [tabs, setTabs] = useState<PopupTab[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load tabs on mount
  useEffect(() => {
    async function loadTabs() {
      try {
        setIsLoading(true);
        const allTabs = await browser.tabs.query({ currentWindow: true });
        const highlightedTabs = await browser.tabs.query({
          highlighted: true,
          currentWindow: true,
        });
        const highlightedIds = new Set(highlightedTabs.map((t) => t.id));

        const popupTabs: PopupTab[] = allTabs.filter(isValidTab).map((t) => ({
          id: t.id!,
          index: t.index,
          url: t.url!,
          title: t.title || t.url!,
          faviconUrl: getFaviconUrl(t.url!),
          domain: getDomain(t.url!),
          isSelected: highlightedIds.has(t.id),
        }));

        setTabs(popupTabs);
      } catch (err) {
        setError("Failed to load tabs");
        console.error("useTabSelection loadTabs error:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadTabs();
  }, []);

  // Listen for external highlight changes
  useEffect(() => {
    function onHighlighted(info: { tabIds: number[]; windowId: number }) {
      setTabs((prev) =>
        prev.map((tab) => ({
          ...tab,
          isSelected: info.tabIds.includes(tab.id),
        })),
      );
    }
    browser.tabs.onHighlighted.addListener(onHighlighted);
    return () => {
      browser.tabs.onHighlighted.removeListener(onHighlighted);
    };
  }, []);

  const toggleTab = useCallback(
    async (tabId: number) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) return;

      try {
        const newIsSelected = !tab.isSelected;

        const newSelectedTabs = tabs.map((t) =>
          t.id === tabId ? { ...t, isSelected: newIsSelected } : t,
        );
        const selectedIndices = newSelectedTabs.filter((t) => t.isSelected).map((t) => t.index);

        if (selectedIndices.length > 0) {
          await browser.tabs.highlight({ tabs: selectedIndices, populate: false });
        } else {
          // Cannot highlight zero tabs — just update local state
          setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, isSelected: false } : t)));
          return;
        }

        setTabs((prev) =>
          prev.map((t) => (t.id === tabId ? { ...t, isSelected: newIsSelected } : t)),
        );
      } catch (err) {
        console.error("toggleTab error:", err);
        setError("Failed to update tab selection");
      }
    },
    [tabs],
  );

  const selectAll = useCallback(
    async (maxCount?: number) => {
      try {
        const tabsToSelect = maxCount !== undefined ? tabs.slice(0, maxCount) : tabs;
        const indices = tabsToSelect.map((t) => t.index);
        if (indices.length > 0) {
          await browser.tabs.highlight({ tabs: indices, populate: false });
          const selectedIds = new Set(tabsToSelect.map((t) => t.id));
          setTabs((prev) => prev.map((t) => ({ ...t, isSelected: selectedIds.has(t.id) })));
        }
      } catch (err) {
        console.error("selectAll error:", err);
        setError("Failed to select all tabs");
      }
    },
    [tabs],
  );

  const deselectAll = useCallback(async () => {
    try {
      // Must highlight at least 1 tab — use the active tab
      const activeTabs = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (activeTabs.length > 0) {
        await browser.tabs.highlight({
          tabs: [activeTabs[0].index],
          populate: false,
        });
      }
      setTabs((prev) => prev.map((t) => ({ ...t, isSelected: false })));
    } catch (err) {
      console.error("deselectAll error:", err);
      setError("Failed to deselect all tabs");
    }
  }, [tabs]);

  const selectedCount = tabs.filter((t) => t.isSelected).length;

  return {
    tabs,
    isLoading,
    error,
    setError,
    toggleTab,
    selectAll,
    deselectAll,
    selectedCount,
  };
}
