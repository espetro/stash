import * as React from "react";
import { useState, useEffect, useCallback } from "react";
import { decodeShareUrl, PayloadDecodeError } from "@stash/codec";
import { getBrotliFunctions } from "@/lib/brotli";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface TabItem {
  url: string;
  title: string;
}

interface DecodedData {
  expiry: number;
  isExpired: boolean;
  items: [string, string][];
}

function getFaviconUrl(url: string): string {
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  } catch {
    return `https://www.google.com/s2/favicons?domain=${url}&sz=32`;
  }
}

function formatRemainingTime(expiryTimestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const remainingSeconds = expiryTimestamp - now;

  if (remainingSeconds <= 0) {
    return "Expired";
  }

  const TEN_YEARS_SECONDS = 10 * 365 * 24 * 60 * 60;
  if (remainingSeconds > TEN_YEARS_SECONDS) {
    return "Never expires";
  }

  const hours = Math.floor(remainingSeconds / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);

  if (hours > 0) {
    return `Expires in ${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `Expires in ${minutes}m`;
  } else {
    return "Expires in < 1m";
  }
}

function formatDateLabel(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function estimateCreatedAt(expiryTimestamp: number): number {
  const now = Math.floor(Date.now() / 1000);
  const DEFAULT_EXPIRY_HOURS = 24;
  const estimated = expiryTimestamp - DEFAULT_EXPIRY_HOURS * 3600;
  return Math.min(estimated, now);
}

function buildCaption(count: number, expiry: number): string {
  const createdAt = estimateCreatedAt(expiry);
  const parts = [
    `${count} tab${count !== 1 ? "s" : ""}`,
    `Created ${formatDateLabel(createdAt)}`,
    formatRemainingTime(expiry),
  ];
  return parts.join(" · ");
}

function getFormatParam(): string | null {
  const raw = new URLSearchParams(window.location.search).get("format");
  return raw ? raw.toLowerCase() : null;
}

function TabListItem({ url, title }: TabItem) {
  const faviconUrl = getFaviconUrl(url);
  const [faviconError, setFaviconError] = useState(false);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-[#fafafa] sm:px-5 sm:py-4"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f4f4f5]">
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

function JsonOutput({ data }: { data: DecodedData }) {
  const output = {
    expiry: data.expiry,
    isExpired: data.isExpired,
    items: data.items.map(([url, title]) => ({ url, title })),
  };

  return (
    <pre className="whitespace-pre-wrap break-words p-4 text-sm text-foreground">
      {JSON.stringify(output, null, 2)}
    </pre>
  );
}

function MdOutput({ data }: { data: DecodedData }) {
  const lines = data.items.map(([url, title]) => {
    const escaped = title.replace(/]/g, "\\]").replace(/\[/g, "\\[");
    return `[${escaped}](${url})`;
  });

  return (
    <pre className="whitespace-pre-wrap break-words p-4 text-sm text-foreground">
      {lines.join("\n")}
    </pre>
  );
}

export default function TabViewer() {
  const [state, setState] = useState<
    | { type: "loading" }
    | { type: "error"; message: string }
    | { type: "content"; data: DecodedData; format: string | null }
  >({ type: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const format = getFormatParam();
        const fragment = window.location.hash;

        if (!fragment) {
          if (!cancelled) setState({ type: "error", message: "No share data found in URL" });
          return;
        }

        const brotli = await getBrotliFunctions();
        const decodedData = await decodeShareUrl(fragment, brotli);

        if (decodedData.isExpired) {
          if (!cancelled) setState({ type: "error", message: "This share link has expired" });
          return;
        }

        if (!cancelled) {
          setState({ type: "content", data: decodedData, format });
        }
      } catch (error) {
        console.error("Failed to decode share URL:", error);
        if (!cancelled) {
          if (error instanceof PayloadDecodeError) {
            setState({ type: "error", message: error.message });
          } else {
            setState({ type: "error", message: "Failed to load shared tabs" });
          }
        }
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  const openAllTabs = useCallback(() => {
    if (state.type !== "content") return;
    state.data.items.forEach(([url]) => {
      window.open(url, "_blank");
    });
  }, [state]);

  const copyUrls = useCallback(async () => {
    if (state.type !== "content") return;

    const lines = state.data.items.map(([url, title]) => {
      const escaped = title.replace(/]/g, "\\]").replace(/\[/g, "\\[");
      return `[${escaped}](${url})`;
    });
    const text = lines.join("\n");

    try {
      await navigator.clipboard.writeText(text);
      // Could show a toast here if we had one
    } catch (error) {
      console.error("Failed to copy URLs:", error);
    }
  }, [state]);

  if (state.type === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-3">
        <p className="text-lg font-medium text-foreground">Loading...</p>
      </div>
    );
  }

  if (state.type === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-3">
        <p className="text-lg font-medium text-foreground">{state.message}</p>
      </div>
    );
  }

  const { data, format } = state;
  const count = data.items.length;

  if (format === "json") {
    return (
      <div className="min-h-screen bg-background p-0">
        <JsonOutput data={data} />
      </div>
    );
  }

  if (format === "md") {
    return (
      <div className="min-h-screen bg-background p-0">
        <MdOutput data={data} />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-background p-3 pt-6 sm:pt-8">
      <Card className="flex w-full max-w-[640px] flex-col rounded-[2rem] border border-border bg-card shadow-xl shadow-black/[0.04] sm:max-h-[75vh]">
        <CardHeader className="shrink-0 items-center gap-1 pb-2 pt-6 text-center sm:pt-8">
          <CardTitle className="text-xl font-semibold tracking-tight text-card-foreground sm:text-2xl">
            Shared Tabs
          </CardTitle>
          <CardDescription className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {buildCaption(count, data.expiry)}
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col overflow-hidden px-3 pb-3 sm:px-5 sm:pb-5">
          <div
            className="custom-scrollbar overflow-y-auto rounded-xl border border-border"
            style={{ maxHeight: "400px" }}
          >
            {data.items.map(([url, title], index) => (
              <React.Fragment key={url + index}>
                {index > 0 && <div className="h-px bg-border" />}
                <TabListItem url={url} title={title} />
              </React.Fragment>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="mt-4 flex w-full max-w-[640px] flex-col gap-3">
        <Button
          onClick={openAllTabs}
          className="h-14 w-full rounded-2xl bg-primary text-base font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Open All Tabs
        </Button>
        <Button
          variant="outline"
          onClick={copyUrls}
          className="h-14 w-full rounded-2xl border-border bg-card text-base font-semibold text-foreground hover:bg-secondary"
        >
          Copy URLs
        </Button>
      </div>
    </div>
  );
}
