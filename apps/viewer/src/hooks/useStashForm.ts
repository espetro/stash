import { useState, useCallback } from "react";
import { encodeTabsToShareUrl, EXPIRY_HOURS_MAP } from "@stash/codec";
import { getBrotliFunctions, parseStashLine, validateStashLines } from "@stash/shared";

export interface UseStashFormState {
  urls: string;
  stashTitle: string;
  expiry: string;
  resultUrl: string | null;
  saveState: "idle" | "generating" | "error";
  copyState: "idle" | "copied";
  lineErrors: Record<number, string>;
}

export interface UseStashFormActions {
  setUrls: (urls: string) => void;
  setStashTitle: (title: string) => void;
  setExpiry: (expiry: string) => void;
  handleSave: () => Promise<void>;
  handleCopy: () => Promise<void>;
  handleClear: () => void;
}

export function useStashForm(): UseStashFormState & UseStashFormActions {
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
      const tabs = lines.map((line) => ({
        ...parseStashLine(line),
        explicit: line.includes("|"),
      }));
      // Best-effort auto-title for bare URLs: user-provided "URL | Title" wins;
      // each lookup has its own timeout so generation never blocks long.
      await Promise.allSettled(
        tabs.map(async (tab) => {
          if (tab.explicit) return;
          try {
            const res = await fetch(`/api/title?url=${encodeURIComponent(tab.url)}`, {
              signal: AbortSignal.timeout(4000),
            });
            if (!res.ok) return;
            const data = (await res.json()) as { title?: string };
            if (data.title) tab.title = data.title;
          } catch {
            // keep hostname fallback
          }
        }),
      );
      const finalTabs = tabs.map(({ url, title: itemTitle }) => ({
        url,
        title: itemTitle,
      }));
      const expiryKey = expiry as keyof typeof EXPIRY_HOURS_MAP;
      const expiryHours = EXPIRY_HOURS_MAP[expiryKey];
      const brotli = await getBrotliFunctions();
      const title = stashTitle.trim() || "Shared Tabs";
      const result = await encodeTabsToShareUrl(finalTabs, brotli, expiryHours, undefined, title);
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

  // Live per-line validation (recomputed on every input change)
  const computedErrors: Record<number, string> = {};
  for (const v of validateStashLines(urls)) {
    if (!v.ok && v.error) computedErrors[v.line] = v.error;
  }

  return {
    urls,
    stashTitle,
    expiry,
    resultUrl,
    saveState,
    copyState,
    lineErrors: computedErrors,
    setUrls,
    setStashTitle,
    setExpiry,
    handleSave,
    handleCopy,
    handleClear,
  };
}
