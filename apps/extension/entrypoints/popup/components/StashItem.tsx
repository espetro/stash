import { useState } from "react";
import { LuChevronDown, LuChevronRight, LuPlus, LuTrash2, LuX } from "react-icons/lu";
import { formatDateTime } from "@stash/shared";
import { recordEvent } from "../../../lib/telemetry";
import type { StashRecord } from "../../../lib/stash-store";

interface StashItemProps {
  stash: StashRecord;
  onUpdate: (patch: { title?: string; tags?: string[]; note?: string }) => unknown;
  onDelete: () => unknown;
}

export function StashItem({ stash, onUpdate, onDelete }: StashItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [titleDraft, setTitleDraft] = useState(stash.title ?? "");
  const [noteDraft, setNoteDraft] = useState(stash.note ?? "");
  const [tagDraft, setTagDraft] = useState("");

  const itemText = stash.items.length === 1 ? "1 item" : `${stash.items.length} items`;

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
          <span className="stash-item-title">{stash.title || "Untitled stash"}</span>
          <span className="stash-item-meta">
            {itemText} · {formatDateTime(stash.updatedAt)}
          </span>
          {stash.tags.length > 0 && (
            <div className="stash-tags">
              {stash.tags.map((tag) => (
                <span key={tag} className="stash-tag">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          className={`stash-delete-btn ${confirmingDelete ? "stash-delete-btn-confirm" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            handleDeleteClick();
          }}
          aria-label="Delete stash"
          title={confirmingDelete ? "Click again to confirm" : "Delete stash"}
        >
          <LuTrash2 />
        </button>
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
