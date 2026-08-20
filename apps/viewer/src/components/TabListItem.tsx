import { useState } from "react";
import { getFaviconUrl } from "@stash/shared";

interface TabItem {
  url: string;
  title: string;
  kind?: "url" | "note" | string;
  selected?: boolean;
  onToggle?: (shiftKey: boolean) => void;
  onOpenNote?: () => void;
}

export function TabListItem({ url, title, kind, selected, onToggle, onOpenNote }: TabItem) {
  const faviconUrl = getFaviconUrl(url);
  const [faviconError, setFaviconError] = useState(false);
  const isNote = kind === "note";

  const body = (
    <>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
        {!isNote && !faviconError ? (
          <img
            src={faviconUrl}
            alt=""
            className="h-5 w-5 object-contain"
            onError={() => setFaviconError(true)}
          />
        ) : (
          <span className="text-sm text-muted-foreground">{isNote ? "☰" : "&#128279;"}</span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium text-foreground">{title}</span>
        <span className="truncate text-xs text-muted-foreground">{isNote ? title : url}</span>
      </div>
    </>
  );

  return (
    <div
      className={`group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted sm:px-5 sm:py-4 ${
        selected ? "bg-muted" : ""
      }`}
    >
      {onToggle && (
        <button
          type="button"
          role="checkbox"
          aria-checked={selected ?? false}
          aria-label={title}
          onClick={(e) => {
            e.preventDefault();
            onToggle(e.shiftKey);
          }}
          className="mt-2 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border transition-colors"
        >
          {selected && (
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-primary">
              <path
                fillRule="evenodd"
                d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </button>
      )}
      {isNote ? (
        <button
          type="button"
          onClick={onOpenNote}
          className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 text-left"
        >
          {body}
        </button>
      ) : (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-w-0 flex-1 items-start gap-3"
        >
          {body}
        </a>
      )}
    </div>
  );
}
