import { useState, useCallback, useRef } from "react";
import { encodeTabsToShareUrl, EXPIRY_HOURS_MAP } from "@stash/codec";
import { getBrotliFunctions, parseStashLine, validateStashLines } from "@stash/shared";
import { createStash } from "@/lib/stash-store";
import { createShortLink, getShortenerOrigin } from "@/lib/shortener";
import { recordEvent } from "@/lib/telemetry";

export interface UseStashFormState {
  urls: string;
  stashTitle: string;
  expiry: string;
  resultUrl: string | null;
  saveState: "idle" | "generating" | "error";
  copyState: "idle" | "copied";
  localSaveState: "idle" | "saving" | "saved" | "error";
  shortenState: "idle" | "shortening" | "error";
  isShortUrl: boolean;
  lineErrors: Record<number, string>;
}

export interface UseStashFormActions {
  setUrls: (urls: string) => void;
  setStashTitle: (title: string) => void;
  setExpiry: (expiry: string) => void;
  handleSave: () => Promise<void>;
  handleCopy: () => Promise<void>;
  handleClear: () => void;
  handleSaveLocally: () => Promise<void>;
  handleGetShortLink: () => Promise<void>;
}

/** Parses "URL | Title" lines and resolves bare-URL titles via /api/title
 * (best-effort, each lookup independently timed out). Shared by the
 * share-link flow and the "save to My Stashes" flow so both produce
 * identically-titled items. */
async function resolveTabs(lines: string[]): Promise<Array<{ url: string; title: string }>> {
  const tabs = lines.map((line) => ({
    ...parseStashLine(line),
    explicit: line.includes("|"),
  }));
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
  return tabs.map(({ url, title }) => ({ url, title }));
}

export function useStashForm(): UseStashFormState & UseStashFormActions {
  const [urls, setUrls] = useState("");
  const [stashTitle, setStashTitle] = useState("Shared Tabs");
  const [expiry, setExpiry] = useState<string>("never");
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "generating" | "error">("idle");
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [localSaveState, setLocalSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [shortenState, setShortenState] = useState<"idle" | "shortening" | "error">("idle");
  const [isShortUrl, setIsShortUrl] = useState(false);
  const hasRecordedUrlsPasted = useRef(false);

  const handleSetUrls = useCallback((value: string) => {
    if (value.trim() && !hasRecordedUrlsPasted.current) {
      hasRecordedUrlsPasted.current = true;
      recordEvent("urls_pasted");
    }
    setUrls(value);
  }, []);

  const handleClear = useCallback(() => {
    setUrls("");
    setStashTitle("Shared Tabs");
    setResultUrl(null);
    setSaveState("idle");
    setShortenState("idle");
    setIsShortUrl(false);
    hasRecordedUrlsPasted.current = false;
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
    setShortenState("idle");
    setIsShortUrl(false);

    try {
      const finalTabs = await resolveTabs(lines);
      const expiryKey = expiry as keyof typeof EXPIRY_HOURS_MAP;
      const expiryHours = EXPIRY_HOURS_MAP[expiryKey];
      const brotli = await getBrotliFunctions();
      const title = stashTitle.trim() || "Shared Tabs";
      const result = await encodeTabsToShareUrl(finalTabs, brotli, expiryHours, undefined, title);
      setResultUrl(result.url);
      setSaveState("idle");
      recordEvent("generation_success", { itemCount: result.itemCount });
    } catch (error) {
      console.error("Failed to encode:", error);
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 2000);
      recordEvent("generation_failure");
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

  const handleSaveLocally = useCallback(async () => {
    const lines = urls
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      setLocalSaveState("error");
      setTimeout(() => setLocalSaveState("idle"), 2000);
      return;
    }

    setLocalSaveState("saving");
    try {
      const finalTabs = await resolveTabs(lines);
      createStash({ title: stashTitle.trim() || undefined, items: finalTabs });
      recordEvent("stash_saved");
      setLocalSaveState("saved");
      setTimeout(() => setLocalSaveState("idle"), 2000);
    } catch (error) {
      console.error("Failed to save locally:", error);
      setLocalSaveState("error");
      setTimeout(() => setLocalSaveState("idle"), 2000);
    }
  }, [urls, stashTitle]);

  const handleGetShortLink = useCallback(async () => {
    if (!resultUrl) return;
    const fragmentIdx = resultUrl.indexOf("#p=");
    if (fragmentIdx === -1) return;
    const payload = resultUrl.slice(fragmentIdx + "#p=".length);

    setShortenState("shortening");
    const result = await createShortLink({
      payload,
      ttlDays: 7,
      shortenerOrigin: getShortenerOrigin(),
    });
    if ("url" in result) {
      setResultUrl(result.url);
      setIsShortUrl(true);
      setShortenState("idle");
      recordEvent("shortener_used");
    } else {
      // Silent fallback: keep showing the existing payload URL unchanged.
      setShortenState("error");
      setTimeout(() => setShortenState("idle"), 2000);
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
    localSaveState,
    shortenState,
    isShortUrl,
    lineErrors: computedErrors,
    setUrls: handleSetUrls,
    setStashTitle,
    setExpiry,
    handleSave,
    handleCopy,
    handleClear,
    handleSaveLocally,
    handleGetShortLink,
  };
}
