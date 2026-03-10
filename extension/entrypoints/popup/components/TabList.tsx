import React from 'react';
import type { PopupTab } from '../types';
import { TabItem } from './TabItem';

interface TabListProps {
  tabs: PopupTab[];
  onToggle: (tabId: number) => void;
}

export function TabList({ tabs, onToggle }: TabListProps) {
  if (tabs.length === 0) {
    return (
      <div className="empty-state">No tabs to share</div>
    );
  }

  return (
    <div className="tab-list">
      {tabs.map((tab) => (
        <TabItem
          key={tab.id}
          tab={tab}
          onToggle={() => onToggle(tab.id)}
        />
      ))}
    </div>
  );
}
