import { useState, useEffect, useCallback } from "react";
import type { PopupTab } from "../types";
import type { Tabs } from "webextension-polyfill";
import { getDomain, getFaviconUrl } from "@stash/shared";

function isValidTab(tab: Tabs.Tab): boolean {
  // Only allow http:// and https:// URLs
  return !!(tab.url && (tab.url.startsWith("http://") || tab.url.startsWith("https://")));
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

  const toggleTab = useCallback(
    async (tabId: number) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) return;

      try {
        const newIsSelected = !tab.isSelected;

        // Only update local state — do NOT call browser.tabs.highlight()
        // to avoid switching focus and closing the popup
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
        const selectedIds = new Set(tabsToSelect.map((t) => t.id));
        setTabs((prev) => prev.map((t) => ({ ...t, isSelected: selectedIds.has(t.id) })));
      } catch (err) {
        console.error("selectAll error:", err);
        setError("Failed to select all tabs");
      }
    },
    [tabs],
  );

  const deselectAll = useCallback(async () => {
    try {
      setTabs((prev) => prev.map((t) => ({ ...t, isSelected: false })));
    } catch (err) {
      console.error("deselectAll error:", err);
      setError("Failed to deselect all tabs");
    }
  }, []);

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
