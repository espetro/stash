import * as React from "react";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  decodeShareUrl,
  PayloadDecodeError,
  encodeTabsToQrUrl,
  getQrSegments,
  estimateQrBitLength,
} from "@stash/codec";
import { getBrotliFunctions } from "@/lib/brotli";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import { ShareDrawer } from "./ShareDrawer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  SharedCard,
  SharedCardHeader,
  SharedCardContent,
  SharedButtonArea,
  SplitButtonGroup,
  OutlineButton,
} from "@/components/shared";

interface TabItem {
  url: string;
  title: string;
}

interface DecodedData {
  expiry: number;
  isExpired: boolean;
  items: [string, string][];
  title?: string;
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

function QrDialogContent({ tabs, title }: { tabs: TabItem[]; title?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);

    if (!canvasRef.current) return;

    async function generateQr() {
      try {
        const brotli = await getBrotliFunctions();
        const { qrUrl } = await encodeTabsToQrUrl(tabs, brotli, 24, undefined, title);

        const estimatedBits = estimateQrBitLength(qrUrl);
        if (estimatedBits > 23648) {
          setError("This stash is too large to fit in a QR code.");
          return;
        }

        const { prefix, payload } = getQrSegments(qrUrl);
        const leanQr = await import("lean-qr");
        const qr = leanQr.generate(
          leanQr.mode.multi(
            leanQr.mode.bytes(new TextEncoder().encode(prefix)),
            leanQr.mode.alphaNumeric(payload),
          ),
        );
        qr.toCanvas(canvasRef.current!, { pad: 2 });
      } catch (err) {
        console.error("Failed to generate QR code:", err);
        setError("This stash URL is too long to fit in a QR code.");
      }
    }

    generateQr();
  }, [tabs, title]);

  return (
    <DialogContent className="sm:max-w-160">
      <DialogHeader>
        <DialogTitle className="text-foreground">Share this stash</DialogTitle>
        <DialogDescription>Scan this QR code to import the tabs</DialogDescription>
      </DialogHeader>
      {error ? (
        <p className="text-center text-sm text-muted-foreground">{error}</p>
      ) : (
        <canvas
          ref={canvasRef}
          className="rounded-lg bg-white"
          style={{ width: 240, height: 240, imageRendering: "pixelated" }}
        />
      )}
      <DialogFooter>
        <Button className="w-full rounded-xl">Close</Button>
      </DialogFooter>
    </DialogContent>
  );
}

export default function TabViewer() {
  const [state, setState] = useState<
    | { type: "loading" }
    | { type: "error"; message: string }
    | { type: "content"; data: DecodedData; format: string | null }
  >({ type: "loading" });

  const [qrOpen, setQrOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

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

  const handleNew = useCallback(() => {
    window.location.href = "/s/new";
  }, []);

  const handleShareQr = useCallback(() => {
    setQrOpen(true);
  }, []);

  const handleOpenDrawer = useCallback(() => {
    setQrOpen(false);
    setDrawerOpen(true);
  }, []);

  const handleDrawerClose = useCallback(() => {
    setDrawerOpen(false);
  }, []);

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
      <SharedCard className="sm:max-h-[75vh]">
        <SharedCardHeader
          title={data.title ?? "Shared Tabs"}
          caption={buildCaption(count, data.expiry)}
        />

        <SharedCardContent className="overflow-hidden px-3 pb-3 sm:px-5 sm:pb-5">
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="custom-scrollbar overflow-y-auto" style={{ maxHeight: "400px" }}>
              {data.items.map(([url, title], index) => (
                <React.Fragment key={url + index}>
                  {index > 0 && <div className="h-px bg-border" />}
                  <TabListItem url={url} title={title} />
                </React.Fragment>
              ))}
            </div>
          </div>
          <ThemeSwitcher />
        </SharedCardContent>
      </SharedCard>

      <SharedButtonArea>
        <SplitButtonGroup
          mainLabel="Share as QR"
          onMainClick={handleShareQr}
          onDropdownClick={handleOpenDrawer}
        />
        <OutlineButton onClick={handleNew}>New</OutlineButton>
      </SharedButtonArea>

      <Dialog
        open={qrOpen}
        onOpenChange={(open) => {
          setQrOpen(open);
          if (open) setDrawerOpen(false);
        }}
      >
        <QrDialogContent
          tabs={data.items.map(([url, title]) => ({ url, title }))}
          title={data.title}
        />
      </Dialog>

      <ShareDrawer
        open={drawerOpen}
        onClose={handleDrawerClose}
        data={{
          expiry: data.expiry,
          isExpired: data.isExpired,
          items: data.items,
          title: data.title,
        }}
      />
    </div>
  );
}
