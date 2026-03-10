import React from 'react';
import type { PopupTab } from '../types';

interface TabItemProps {
  tab: PopupTab;
  onToggle: () => void;
}

export function TabItem({ tab, onToggle }: TabItemProps) {
  const displayTitle = tab.title.length > 30 
    ? tab.title.substring(0, 30) + '...' 
    : tab.title;

  return (
    <div className="tab-item">
      <input
        type="checkbox"
        className="tab-checkbox"
        checked={tab.isSelected}
        onChange={onToggle}
        id={`tab-${tab.id}`}
      />
      <img
        className="tab-favicon"
        src={tab.faviconUrl}
        alt=""
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
      />
      <label htmlFor={`tab-${tab.id}`} className="tab-title" title={tab.title}>
        {displayTitle}
      </label>
      <span className="tab-domain">{tab.domain}</span>
    </div>
  );
}
