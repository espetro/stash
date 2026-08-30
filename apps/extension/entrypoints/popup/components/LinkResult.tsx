import * as React from "react";
import { useState } from "react";
import { exportToJSON, exportToMarkdown } from "../../../lib/export";
import { shortenShareUrl } from "../../../lib/shortener";
import { recordEvent } from "../../../lib/telemetry";
import { generate as generateQr } from "lean-qr";
import { toSvgDataURL } from "lean-qr/extras/svg";
import { makeSyncComponent } from "lean-qr/extras/react";
import { LuChevronDown } from "react-icons/lu";

const QrCode = makeSyncComponent(React, generateQr, toSvgDataURL, {
  on: "#1A1A1A",
  off: "#FAFAF9",
  pad: 4,
});

type ShortenState = "payload" | "short" | "failed" | "busy";

interface LinkResultProps {
  url: string;
  onCopy: () => void;
  isCopied: boolean;
  itemCount: number;
  tabs: Array<{ url: string; title: string }>;
  truncated?: boolean;
  totalCount?: number;
  /** Human readable expiry, e.g. "7 days". Omit to hide. */
  expiresLabel?: string;
  /** Master opt-out for the shortener. When false the shorten button is hidden. */
  shortenerEnabled?: boolean;
  shortenerOrigin?: string;
  /** Called when the displayed URL is replaced by a short link. */
  onShortened?: (shortUrl: string) => void;
}

export function LinkResult({
  url,
  onCopy,
  isCopied,
  itemCount,
  tabs,
  truncated,
  totalCount,
  expiresLabel,
  shortenerEnabled = false,
  shortenerOrigin,
  onShortened,
}: LinkResultProps) {
  const [displayUrl, setDisplayUrl] = useState(url);
  const [shortenState, setShortenState] = useState<ShortenState>("payload");
  const [copyAsOpen, setCopyAsOpen] = useState(false);
  const [copyAsCopied, setCopyAsCopied] = useState<"json" | "markdown" | null>(null);

  const isPayloadLink = displayUrl.includes("#p=");

  async function handleShorten() {
    if (!shortenerOrigin || shortenState === "busy") return;
    setShortenState("busy");
    const result = await shortenShareUrl(displayUrl, shortenerOrigin);
    if ("url" in result) {
      setDisplayUrl(result.url);
      setShortenState("short");
      recordEvent("shortener_used");
      onShortened?.(result.url);
    } else {
      setShortenState("failed");
    }
  }

  async function handleCopyAs(format: "json" | "markdown") {
    try {
      const text = format === "json" ? exportToJSON(tabs) : exportToMarkdown(tabs);
      await navigator.clipboard.writeText(text);
      setCopyAsCopied(format);
      setTimeout(() => setCopyAsCopied(null), 2000);
    } catch {
      setCopyAsCopied(null);
    }
  }

  const hint =
    shortenState === "short"
      ? "Encrypted short link. Only the key in the link can read it; a copy is stored on the shortener for up to 7 days."
      : shortenState === "failed"
        ? "Couldn't shorten, using self-contained link."
        : isPayloadLink
          ? `Self-contained link. Tab data lives in the URL.${
              expiresLabel ? ` Expires in ${expiresLabel}.` : ""
            }`
          : undefined;

  return (
    <div className="link-result">
      <div className="link-result-header">
        {truncated && totalCount ? (
          <span className="budget-message" style={{ display: "inline" }}>
            {itemCount} of {totalCount} tabs (URL budget limit)
          </span>
        ) : (
          <span>
            {itemCount} item{itemCount !== 1 ? "s" : ""}
            {expiresLabel ? ` · expires in ${expiresLabel}` : ""}
          </span>
        )}
      </div>
      <input
        type="text"
        className="link-input"
        value={displayUrl}
        readOnly
        title={displayUrl}
        onClick={(e) => (e.target as HTMLInputElement).select()}
      />
      {hint && <p className="link-hint">{hint}</p>}
      {(() => {
        try {
          generateQr(displayUrl);
        } catch {
          return <p className="qr-error">URL too large for QR code</p>;
        }
        return (
          <div className="qr-wrapper">
            <QrCode content={displayUrl} className="qr-code" />
          </div>
        );
      })()}
      <div className="link-actions">
        <button className={`btn ${isCopied ? "btn-secondary" : "btn-primary"}`} onClick={onCopy}>
          {isCopied ? "Copied!" : "Copy link"}
        </button>
        {shortenerEnabled && shortenState === "short" && (
          <span className="link-hint">Shortened</span>
        )}
        {shortenerEnabled && isPayloadLink && shortenState !== "short" && (
          <button
            className="btn btn-secondary"
            onClick={handleShorten}
            disabled={shortenState === "busy" || shortenState === "failed"}
          >
            {shortenState === "busy" ? "Shortening..." : "Shorten link"}
          </button>
        )}
      </div>
      <div className="copy-as-wrapper">
        <button
          className="btn btn-secondary copy-as-btn"
          onClick={() => setCopyAsOpen((open) => !open)}
          aria-expanded={copyAsOpen}
          disabled={tabs.length === 0}
          title={tabs.length === 0 ? "Tab data unavailable for this link" : undefined}
        >
          Copy as... <LuChevronDown />
        </button>
        {copyAsOpen && tabs.length > 0 && (
          <div className="copy-as-menu">
            <button className="copy-as-item" onClick={() => handleCopyAs("json")} type="button">
              {copyAsCopied === "json" ? "Copied!" : "JSON"}
            </button>
            <button className="copy-as-item" onClick={() => handleCopyAs("markdown")} type="button">
              {copyAsCopied === "markdown" ? "Copied!" : "Markdown"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
