import * as React from "react";
import { useState, useCallback } from "react";
import { encodeTabsToShareUrl, EXPIRY_HOURS_MAP } from "@stash/codec";
import { getBrotliFunctions } from "@/lib/brotli";

const EXPIRY_OPTIONS = [
  { value: "never", label: "Never expires" },
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
] as const;

function extractTitle(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url.slice(0, 30);
  }
}

export default function HeroStashPopup() {
  const [urls, setUrls] = useState("");
  const [stashTitle, setStashTitle] = useState("Shared Tabs");
  const [expiry, setExpiry] = useState<string>("never");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "generating" | "error">("idle");
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");

  const handleClear = useCallback(() => {
    setUrls("");
    setStashTitle("Shared Tabs");
    setResultUrl(null);
    setSaveState("idle");
  }, []);

  const handleSave = useCallback(async () => {
    const lines = urls
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 2000);
      return;
    }

    setSaveState("generating");
    setResultUrl(null);

    try {
      const tabs = lines.map((url) => ({ url, title: extractTitle(url) }));
      const expiryKey = expiry as keyof typeof EXPIRY_HOURS_MAP;
      const expiryHours = EXPIRY_HOURS_MAP[expiryKey];
      const brotli = await getBrotliFunctions();
      const title = stashTitle.trim() || "Shared Tabs";
      const result = await encodeTabsToShareUrl(tabs, brotli, expiryHours, undefined, title);
      setResultUrl(result.url);
      setSaveState("idle");
    } catch (error) {
      console.error("Failed to encode:", error);
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 2000);
    }
  }, [urls, expiry, stashTitle]);

  const handleCopy = useCallback(async () => {
    if (!resultUrl) return;
    try {
      await navigator.clipboard.writeText(resultUrl);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  }, [resultUrl]);

  const saveLabel =
    saveState === "generating"
      ? "Generating..."
      : saveState === "error"
        ? "Error"
        : "Create Stash →";

  return (
    <div
      style={
        {
          "--background": "#141414",
          "--card": "#1C1C1C",
          "--foreground": "#F0F0F0",
          "--muted-foreground": "#A3A3A3",
          "--border": "#2C2C2C",
          "--primary": "#F0F0F0",
          "--primary-foreground": "#000000",
          "--secondary": "#252525",
          "--muted": "#252525",
          "--radius": "0.25rem",
        } as React.CSSProperties
      }
      className="max-w-[360px]"
    >
      {/* Dark card container */}
      <div
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
          color: "var(--foreground)",
        }}
        className="rounded-lg border overflow-hidden shadow-lg"
      >
        {/* Header */}
        <div
          style={{
            backgroundColor: "var(--secondary)",
            borderBottomColor: "var(--border)",
          }}
          className="flex items-center justify-between px-4 py-3 border-b"
        >
          <div className="flex items-center gap-2">
            <img
              src="/icon-48.png"
              alt=""
              width="20"
              height="20"
              className="block shrink-0"
              aria-hidden="true"
            />
            <span className="text-sm font-semibold">Stash</span>
          </div>
          <a
            href="/s/new"
            style={{
              color: "var(--muted-foreground)",
            }}
            className="text-lg hover:text-foreground transition-colors"
            aria-label="Expand to full form"
          >
            ↗
          </a>
        </div>

        {/* Content */}
        <div className="flex flex-col gap-3 p-4">
          {/* Title input */}
          <input
            type="text"
            value={stashTitle}
            onChange={(e) => setStashTitle(e.target.value)}
            placeholder="Stash title"
            style={{
              backgroundColor: "var(--muted)",
              borderColor: "var(--border)",
              color: "var(--foreground)",
            }}
            className="w-full px-3 py-2 rounded border text-sm outline-none transition-colors focus:border-primary placeholder:text-muted-foreground"
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--primary)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
            }}
          />

          {/* URL textarea */}
          <textarea
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
            placeholder="Paste URLs (one per line)"
            style={{
              backgroundColor: "var(--muted)",
              borderColor: "var(--border)",
              color: "var(--foreground)",
              minHeight: "100px",
            }}
            className="w-full px-3 py-2 rounded border font-mono text-xs leading-relaxed outline-none transition-colors resize-y focus:border-primary placeholder:text-muted-foreground"
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--primary)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
            }}
          />

          {/* Expiry select */}
          <select
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            style={{
              backgroundColor: "var(--muted)",
              borderColor: "var(--border)",
              color: "var(--foreground)",
            }}
            className="w-full px-3 py-2 rounded border text-sm outline-none transition-colors focus:border-primary appearance-none cursor-pointer"
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--primary)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
            }}
          >
            {EXPIRY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Result URL display */}
          {resultUrl && (
            <div
              style={{
                backgroundColor: "var(--background)",
                borderColor: "var(--border)",
              }}
              className="rounded border p-3 mt-2"
            >
              <a
                href={resultUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: "var(--primary)",
                }}
                className="block break-all font-mono text-[11px] underline mb-3"
              >
                {resultUrl}
              </a>
              <button
                onClick={handleCopy}
                style={{
                  backgroundColor: "var(--primary)",
                  color: "var(--primary-foreground)",
                }}
                className="w-full px-3 py-2 rounded font-semibold text-xs transition-opacity hover:opacity-90"
              >
                {copyState === "copied" ? "Copied!" : "Copy link"}
              </button>
            </div>
          )}
        </div>

        {/* Primary button */}
        <div className="px-4 pb-4">
          <button
            onClick={handleSave}
            disabled={saveState === "generating"}
            style={{
              backgroundColor: "var(--primary)",
              color: "var(--primary-foreground)",
            }}
            className="w-full px-4 py-3 rounded font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {saveLabel}
          </button>

          {/* Clear link */}
          <button
            onClick={handleClear}
            style={{
              color: "var(--muted-foreground)",
            }}
            className="w-full mt-2 text-xs hover:text-foreground transition-colors text-center py-1"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
