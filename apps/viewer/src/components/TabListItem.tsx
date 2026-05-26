import { useState } from "react";

interface TabItem {
  url: string;
  title: string;
}

function getFaviconUrl(url: string): string {
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  } catch {
    return `https://www.google.com/s2/favicons?domain=${url}&sz=32`;
  }
}

export function TabListItem({ url, title }: TabItem) {
  const faviconUrl = getFaviconUrl(url);
  const [faviconError, setFaviconError] = useState(false);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted sm:px-5 sm:py-4"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
        {!faviconError ? (
          <img
            src={faviconUrl}
            alt=""
            className="h-5 w-5 object-contain"
            onError={() => setFaviconError(true)}
          />
        ) : (
          <span className="text-sm text-muted-foreground">&#128279;</span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium text-foreground">{title}</span>
        <span className="truncate text-xs text-muted-foreground">{url}</span>
      </div>
    </a>
  );
}
