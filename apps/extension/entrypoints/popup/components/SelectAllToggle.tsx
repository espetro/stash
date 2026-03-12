import React from "react";
import type { PopupTab } from "../types";
import { findMaxTabsWithinBudget } from "../../../lib/encoder.js";
import type { TabInfo } from "../../../lib/types.js";

interface SelectAllToggleProps {
  tabs: PopupTab[];
  onSelectAll: (maxCount: number) => void;
  onDeselectAll: () => void;
}

export function SelectAllToggle({ tabs, onSelectAll, onDeselectAll }: SelectAllToggleProps) {
  const selectedCount = tabs.filter((t) => t.isSelected).length;
  const allSelected = selectedCount === tabs.length && tabs.length > 0;

  function handleSelectAll() {
    const tabInfos: TabInfo[] = tabs.map((t) => ({ url: t.url, title: t.title }));
    const maxCount = findMaxTabsWithinBudget(tabInfos);
    onSelectAll(maxCount);
  }

  const isTruncated = (() => {
    if (selectedCount === 0) return false;
    const tabInfos: TabInfo[] = tabs.map((t) => ({ url: t.url, title: t.title }));
    const maxCount = findMaxTabsWithinBudget(tabInfos);
    return maxCount < tabs.length;
  })();

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
