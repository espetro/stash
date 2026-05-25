import * as React from "react";
import { useState, useCallback } from "react";
import { encodeTabsToShareUrl, EXPIRY_HOURS_MAP } from "@stash/codec";
import { getBrotliFunctions } from "@/lib/brotli";
import { Button } from "@/components/ui/button";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import {
  SharedCard,
  SharedCardHeader,
  SharedCardContent,
  SharedButtonArea,
  PrimaryButton,
  OutlineButton,
} from "@/components/shared";

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

export default function NewStashForm() {
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
    saveState === "generating" ? "Generating..." : saveState === "error" ? "Error" : "Save";

  return (
    <div className="flex min-h-screen flex-col items-center bg-background p-3 pt-6 sm:pt-8">
      <SharedCard>
        <SharedCardHeader title="Create Stash" />

        <SharedCardContent>
          <input
            type="text"
            value={stashTitle}
            onChange={(e) => setStashTitle(e.target.value)}
            placeholder="Stash title"
            className="w-full rounded-xl border border-border bg-secondary px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
          />

          <textarea
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
            placeholder="Paste URLs (one per line)..."
            className="min-h-[200px] w-full resize-y rounded-xl border border-border bg-muted p-3 font-mono text-sm leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
          />

          <select
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            className="w-full appearance-none rounded-xl border border-border bg-secondary px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236c727e' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 12px center",
              paddingRight: "36px",
            }}
          >
            {EXPIRY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {resultUrl && (
            <div className="mt-2 rounded-xl border border-border bg-muted p-4">
              <a
                href={resultUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mb-3 block break-all font-mono text-xs text-primary underline"
              >
                {resultUrl}
              </a>
              <Button
                variant="outline"
                onClick={handleCopy}
                className="h-12 w-full rounded-xl border-border bg-card text-sm font-semibold text-foreground hover:bg-secondary"
              >
                {copyState === "copied" ? "Copied!" : "Copy to clipboard"}
              </Button>
            </div>
          )}
          <ThemeSwitcher />
        </SharedCardContent>
      </SharedCard>

      <SharedButtonArea>
        <PrimaryButton onClick={handleSave} disabled={saveState === "generating"}>
          {saveLabel}
        </PrimaryButton>
        <OutlineButton onClick={handleClear}>Clear</OutlineButton>
      </SharedButtonArea>
    </div>
  );
}
