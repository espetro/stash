import React, { useState, useMemo } from "react";
import { useHistory } from "../hooks/useHistory";
import { HistoryItem } from "./HistoryItem";

interface HistoryViewProps {
  onBack: () => void;
}

export function HistoryView({ onBack }: HistoryViewProps) {
  const { entries, isLoading, error, clear } = useHistory();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) {
      return entries;
    }
    const query = searchQuery.toLowerCase();
    return entries.filter((entry) => entry.url.toLowerCase().includes(query));
  }, [entries, searchQuery]);

  const activeCount = useMemo(() => {
    const now = Date.now();
    return entries.filter((entry) => entry.expiresAt > now).length;
  }, [entries]);

  const handleEntryClick = async (url: string) => {
    try {
      await browser.tabs.create({ url });
    } catch {
      // Silently fail if tabs API is unavailable
    }
  };

  const handleClear = async () => {
    await clear();
  };

  if (isLoading) {
    return (
      <div className="history-view">
        <div className="loading">Loading history...</div>
      </div>
    );
  }

  return (
    <div className="history-view">
      <div className="history-header">
        <div className="history-header-left">
          <button className="history-back-btn" onClick={onBack} aria-label="Go back" type="button">
            ←
          </button>
          <span className="history-title">History</span>
        </div>
        {entries.length > 0 && (
          <button className="history-clear-btn" onClick={handleClear} type="button">
            CLEAR
          </button>
        )}
      </div>

      {error && (
        <div className="error-message">
          <span className="error-message-text">{error}</span>
        </div>
      )}

      {entries.length > 0 && (
        <input
          type="text"
          className="history-search"
          placeholder="Search by URL..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      )}

      {filteredEntries.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          {entries.length === 0 ? "No history yet" : "No matching entries"}
        </div>
      ) : (
        <div className="history-list">
          {filteredEntries.map((entry) => (
            <HistoryItem key={entry.id} entry={entry} onClick={() => handleEntryClick(entry.url)} />
          ))}
        </div>
      )}

      {entries.length > 0 && (
        <div className="history-footer">
          <span className="history-footer-text">SHOWING LAST 30 DAYS</span>
          <span className="history-footer-count">{activeCount} active</span>
        </div>
      )}
    </div>
  );
}
