import React, { useState, useEffect } from "react";
import type { PopupTab } from "../types";
import { findMaxTabsWithinBudget } from "@stash/codec";
import type { TabInfo } from "@stash/codec";
import { getBrotliFunctions } from "../../../lib/brotli";

interface SelectAllToggleProps {
  tabs: PopupTab[];
  onSelectAll: (maxCount: number) => void;
  onDeselectAll: () => void;
}

export function SelectAllToggle({ tabs, onSelectAll, onDeselectAll }: SelectAllToggleProps) {
  const selectedCount = tabs.filter((t) => t.isSelected).length;
  const allSelected = selectedCount === tabs.length && tabs.length > 0;
  const [maxTabCount, setMaxTabCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function computeMax() {
      if (tabs.length === 0) {
        setMaxTabCount(0);
        return;
      }
      const brotli = await getBrotliFunctions();
      const tabInfos: TabInfo[] = tabs.map((t) => ({ url: t.url, title: t.title }));
      const max = await findMaxTabsWithinBudget(tabInfos, brotli);
      if (!cancelled) setMaxTabCount(max);
    }
    computeMax();
    return () => { cancelled = true; };
  }, [tabs]);

  async function handleSelectAll() {
    const brotli = await getBrotliFunctions();
    const tabInfos: TabInfo[] = tabs.map((t) => ({ url: t.url, title: t.title }));
    const maxCount = await findMaxTabsWithinBudget(tabInfos, brotli);
    onSelectAll(maxCount);
  }

  const isTruncated = maxTabCount !== null && maxTabCount < tabs.length;

  return (
    <div className="select-all-toggle">
      <div>
        <button
          className="btn btn-secondary"
          onClick={allSelected ? onDeselectAll : handleSelectAll}
        >
          {allSelected ? "Deselect All" : "Select All"}
        </button>
        <span className="selected-count">
          {selectedCount} of {tabs.length} selected
        </span>
      </div>
      {isTruncated && <div className="budget-message">URL budget limit reached</div>}
    </div>
  );
}
