import { useState, useCallback } from "react";
import { encodeTabsToShareUrl, EXPIRY_HOURS_MAP } from "@stash/codec";
import { getBrotliFunctions, extractTitle } from "@stash/shared";

export interface UseStashFormState {
  urls: string;
  stashTitle: string;
  expiry: string;
  resultUrl: string | null;
  saveState: "idle" | "generating" | "error";
  copyState: "idle" | "copied";
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

  return {
    urls,
    stashTitle,
    expiry,
    resultUrl,
    saveState,
    copyState,
    setUrls,
    setStashTitle,
    setExpiry,
    handleSave,
    handleCopy,
    handleClear,
  };
}
