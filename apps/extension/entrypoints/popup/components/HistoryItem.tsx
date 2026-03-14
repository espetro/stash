import React from "react";
import type { HistoryEntry } from "../../../lib/history";

interface HistoryItemProps {
  entry: HistoryEntry;
  onClick: () => void;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const entryDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((today.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));

  const timeStr = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  if (diffDays === 0) {
    return `Today, ${timeStr}`;
  } else if (diffDays === 1) {
    return `Yesterday, ${timeStr}`;
  } else {
    const dateStr = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    return `${dateStr}, ${timeStr}`;
  }
}

function formatTimeRemaining(msRemaining: number): string {
  if (msRemaining <= 0) {
    return "EXPIRED";
  }

  const hours = Math.floor(msRemaining / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;

  if (days >= 1) {
    if (remainingHours > 0) {
      return `Expires in ${days}d ${remainingHours}h`;
    }
    return `Expires in ${days}d`;
  }

  return `Expires in ${hours}h`;
}

export function HistoryItem({ entry, onClick }: HistoryItemProps) {
  const now = Date.now();
  const isActive = entry.expiresAt > now;
  const msRemaining = entry.expiresAt - now;
  const timeRemaining = formatTimeRemaining(msRemaining);
  const isExpiringSoon = isActive && msRemaining < 24 * 60 * 60 * 1000;

  const handleClick = () => {
    if (isActive) {
      onClick();
    }
  };

  const tabText = entry.itemCount === 1 ? "1 tab" : `${entry.itemCount} tabs`;

  return (
    <div
      className={`history-item ${isActive ? "history-item-active" : "history-item-expired"}`}
      onClick={handleClick}
      role={isActive ? "button" : undefined}
      tabIndex={isActive ? 0 : undefined}
    >
      <span className={`history-item-icon ${!isActive ? "history-item-icon-expired" : ""}`}>
        ⏰
      </span>
      <div className="history-item-content">
        <span className="history-item-date">{formatDate(entry.createdAt)}</span>
        <span className="history-item-count">{tabText}</span>
      </div>
      <span
        className={`history-item-expiry ${
          isActive
            ? isExpiringSoon
              ? "history-item-expiry-warning"
              : "history-item-expiry-active"
            : "history-item-expiry-expired"
        }`}
      >
        {timeRemaining}
      </span>
      {isActive && <span className="history-item-chevron">›</span>}
    </div>
  );
}
