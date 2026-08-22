import { useState } from "react";

interface SaveStashFormProps {
  itemCount: number;
  onSave: (input: { title?: string; tags: string[]; note?: string }) => Promise<void>;
  onCancel: () => void;
  onSaved?: () => void;
}

export function SaveStashForm({ itemCount, onSave, onCancel, onSaved }: SaveStashFormProps) {
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status !== "idle") return;
    setStatus("saving");
    try {
      await onSave({
        title: title.trim() || undefined,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        note: note.trim() || undefined,
      });
      setStatus("saved");
      if (onSaved) setTimeout(onSaved, 1500);
    } catch {
      setStatus("idle");
    }
  }

  if (status === "saved") {
    return (
      <div className="save-stash-form">
        <p className="save-stash-saved">Saved!</p>
      </div>
    );
  }

  return (
    <form className="save-stash-form" onSubmit={handleSubmit}>
      <div className="save-stash-header">
        Save {itemCount} tab{itemCount !== 1 ? "s" : ""}
      </div>
      <input
        type="text"
        className="history-search"
        placeholder="Stash title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <input
        type="text"
        className="history-search"
        placeholder="tags, comma, separated"
        value={tags}
        onChange={(e) => setTags(e.target.value)}
      />
      <textarea
        className="stash-field-textarea"
        placeholder="Note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="popup-actions">
        <button type="submit" className="btn btn-primary" disabled={status === "saving"}>
          {status === "saving" ? "Saving..." : "Save"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
