import { LuAlarmClock } from "react-icons/lu";
import type { HistoryEntry } from "../../../lib/history";
import { formatDateTime, formatRemainingTime } from "@stash/shared";

interface HistoryItemProps {
  entry: HistoryEntry;
  onClick: () => void;
}

export function HistoryItem({ entry, onClick }: HistoryItemProps) {
  const now = Date.now();
  const isActive = entry.expiresAt > now;
  const msRemaining = entry.expiresAt - now;
  const timeRemaining = formatRemainingTime(msRemaining);
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
        <LuAlarmClock />
      </span>
      <div className="history-item-content">
        <span className="history-item-date">{formatDateTime(entry.createdAt)}</span>
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
