import { useState, type MouseEvent } from "react";
import {
  LuChevronDown,
  LuChevronRight,
  LuLink2,
  LuPin,
  LuPlus,
  LuShare2,
  LuTrash2,
  LuX,
} from "react-icons/lu";
import { formatDateTime, formatRemainingTime } from "@stash/shared";
import { recordEvent } from "../../../lib/telemetry";
import { isKept, recentExpiresAt, type StashRecord } from "../../../lib/stash-store";

interface StashItemProps {
  stash: StashRecord;
  onUpdate: (patch: { title?: string; tags?: string[]; note?: string }) => unknown;
  onDelete: () => unknown;
  onKeep: () => unknown;
  onShare: () => Promise<unknown>;
}

function getDisplayTitle(stash: StashRecord): string {
  const title = stash.title?.trim();
  if (title) return title;
  if (stash.items.length === 0) return "Untitled stash";

  const firstItem = stash.items[0];
  let host = firstItem.url;
  try {
    host = new URL(firstItem.url).hostname.replace(/^www\./, "");
  } catch {
    // Keep the original value for non-URL items.
  }
  const firstTitle = firstItem.title || host;
  return stash.items.length > 1 ? `${firstTitle} + ${stash.items.length - 1} more` : firstTitle;
}

export function StashItem({ stash, onUpdate, onDelete, onKeep, onShare }: StashItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(stash.title ?? "");
  const [noteDraft, setNoteDraft] = useState(stash.note ?? "");
  const [tagDraft, setTagDraft] = useState("");

  const [sharesExpanded, setSharesExpanded] = useState(false);

  const itemText = stash.items.length === 1 ? "1 item" : `${stash.items.length} items`;
  const shares = stash.shares ?? [];
  const recent = !isKept(stash);
  const expiresAt = recentExpiresAt(stash);
  const linkNeverExpires = expiresAt >= Date.now() + 50 * 365 * 24 * 60 * 60 * 1000;
  const recentExpiryLabel = linkNeverExpires
    ? "link never expires"
    : `expires in ${formatRemainingTime(Math.max(0, expiresAt - Date.now()))}`;

  async function handleShareClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    setIsSharing(true);
    try {
      await onShare();
    } finally {
      setIsSharing(false);
    }
  }

  function handleTitleBlur() {
    const trimmed = titleDraft.trim();
    if (trimmed !== (stash.title ?? "")) {
      onUpdate({ title: trimmed || undefined });
    }
  }

  function handleNoteBlur() {
    if (noteDraft !== (stash.note ?? "")) {
      onUpdate({ note: noteDraft || undefined });
    }
  }

  function handleAddTag() {
    const tag = tagDraft.trim();
    if (!tag || stash.tags.includes(tag)) {
      setTagDraft("");
      return;
    }
    onUpdate({ tags: [...stash.tags, tag] });
    setTagDraft("");
  }

  function handleRemoveTag(tag: string) {
    onUpdate({ tags: stash.tags.filter((t) => t !== tag) });
  }

  function handleDeleteClick() {
    if (confirmingDelete) {
      onDelete();
    } else {
      setConfirmingDelete(true);
      setTimeout(() => setConfirmingDelete(false), 3000);
    }
  }

  return (
    <div className="stash-item">
      <div
        className="stash-item-header"
        onClick={() =>
          setIsExpanded((v) => {
            if (!v) recordEvent("stash_reopened");
            return !v;
          })
        }
      >
        <span className="stash-item-chevron">
          {isExpanded ? <LuChevronDown /> : <LuChevronRight />}
        </span>
        <div className="stash-item-summary">
          <span className="stash-item-title">{getDisplayTitle(stash)}</span>
          <span className="stash-item-meta">
            {itemText} · {formatDateTime(stash.updatedAt)}
          </span>
          {recent && (
            <span className="stash-state-badge stash-recent-badge">
              Recent · {recentExpiryLabel}
            </span>
          )}
          {stash.tags.length > 0 && (
            <div className="stash-tags">
              {stash.tags.map((tag) => (
                <span key={tag} className="stash-tag">
                  {tag}
                </span>
              ))}
            </div>
          )}
          {shares.length > 0 && (
            <button
              className="stash-shares-toggle"
              type="button"
              aria-expanded={sharesExpanded}
              aria-label={`Shared ${shares.length} ${shares.length === 1 ? "time" : "times"}`}
              onClick={(e) => {
                e.stopPropagation();
                setSharesExpanded((v) => !v);
              }}
            >
              <LuLink2 aria-hidden />
              <span>
                Shared {shares.length} {shares.length === 1 ? "time" : "times"}
              </span>
            </button>
          )}
        </div>
        <div className="stash-row-actions">
          <button
            className="stash-row-action"
            onClick={handleShareClick}
            disabled={isSharing}
            type="button"
          >
            <LuShare2 aria-hidden />
            {isSharing ? "Sharing..." : "Share"}
          </button>
          {recent && (
            <button
              className="stash-row-action"
              onClick={(event) => {
                event.stopPropagation();
                onKeep();
              }}
              type="button"
            >
              <LuPin aria-hidden />
              Keep
            </button>
          )}
          <button
            className={`stash-delete-btn ${confirmingDelete ? "stash-delete-btn-confirm" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteClick();
            }}
            aria-label="Delete stash"
            title={confirmingDelete ? "Click again to confirm" : "Delete stash"}
            type="button"
          >
            <LuTrash2 />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="stash-item-body" onClick={(e) => e.stopPropagation()}>
          <label className="stash-field-label">Title</label>
          <input
            type="text"
            className="stash-field-input"
            value={titleDraft}
            placeholder="Untitled stash"
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={handleTitleBlur}
          />

          <label className="stash-field-label">Tags</label>
          <div className="stash-tags-editor">
            {stash.tags.map((tag) => (
              <span key={tag} className="stash-tag stash-tag-editable">
                {tag}
                <button
                  className="stash-tag-remove"
                  onClick={() => handleRemoveTag(tag)}
                  aria-label={`Remove tag ${tag}`}
                >
                  <LuX />
                </button>
              </span>
            ))}
            <input
              type="text"
              className="stash-tag-input"
              placeholder="Add tag..."
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddTag();
                }
              }}
            />
            <button className="stash-tag-add-btn" onClick={handleAddTag} aria-label="Add tag">
              <LuPlus />
            </button>
          </div>

          <label className="stash-field-label">Note</label>
          <textarea
            className="stash-field-textarea"
            value={noteDraft}
            placeholder="Add a note..."
            onChange={(e) => setNoteDraft(e.target.value)}
            onBlur={handleNoteBlur}
          />

          {sharesExpanded && shares.length > 0 && (
            <div className="stash-shares" onClick={(e) => e.stopPropagation()}>
              <label className="stash-field-label">Shares</label>
              <div className="stash-shares-list">
                {shares.map((share, i) => {
                  const isActive = share.expiresAt > Date.now();
                  return (
                    <div key={`${share.url}-${i}`} className="stash-share">
                      <a
                        className="stash-item-link"
                        href={share.url}
                        target="_blank"
                        rel="noreferrer"
                        title={share.url}
                      >
                        {share.url}
                      </a>
                      <span className="stash-share-meta">
                        {formatDateTime(share.createdAt)} ·{" "}
                        {share.itemCount === 1 ? "1 tab" : `${share.itemCount} tabs`}
                        {isActive
                          ? ` · ${formatRemainingTime(share.expiresAt - Date.now())} left`
                          : " · expired"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <label className="stash-field-label">Items</label>
          <div className="stash-item-links">
            {stash.items.map((item, i) => (
              <a
                key={`${item.url}-${i}`}
                className="stash-item-link"
                href={item.url}
                target="_blank"
                rel="noreferrer"
                title={item.url}
              >
                {item.title || item.url}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
