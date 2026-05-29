import * as React from "react";
import { useState } from "react";
import { exportToJSON, exportToMarkdown } from "../../../lib/export";
import { generate as generateQr } from "lean-qr";
import { toSvgDataURL } from "lean-qr/extras/svg";
import { makeSyncComponent } from "lean-qr/extras/react";

const QrCode = makeSyncComponent(React, generateQr, toSvgDataURL, {
  on: "var(--foreground)",
  off: "var(--background)",
  pad: 4,
});

interface LinkResultProps {
  url: string;
  onCopy: () => void;
  isCopied: boolean;
  itemCount: number;
  tabs: Array<{ url: string; title: string }>;
  truncated?: boolean;
  totalCount?: number;
}

export function LinkResult({
  url,
  onCopy,
  isCopied,
  itemCount,
  tabs,
  truncated,
  totalCount,
}: LinkResultProps) {
  const [jsonCopied, setJsonCopied] = useState(false);
  const [mdCopied, setMdCopied] = useState(false);
  const [jsonError, setJsonError] = useState(false);
  const [mdError, setMdError] = useState(false);

  async function handleCopyJSON() {
    try {
      await navigator.clipboard.writeText(exportToJSON(tabs));
      setJsonCopied(true);
      setJsonError(false);
      setTimeout(() => setJsonCopied(false), 2000);
    } catch {
      setJsonError(true);
      setTimeout(() => setJsonError(false), 2000);
    }
  }

  async function handleCopyMarkdown() {
    try {
      await navigator.clipboard.writeText(exportToMarkdown(tabs));
      setMdCopied(true);
      setMdError(false);
      setTimeout(() => setMdCopied(false), 2000);
    } catch {
      setMdError(true);
      setTimeout(() => setMdError(false), 2000);
    }
  }

  return (
    <div className="link-result">
      <div className="link-result-header">
        Share link created!{" "}
        {truncated && totalCount ? (
          <span className="budget-message" style={{ display: "inline" }}>
            ({itemCount} of {totalCount} tabs — URL budget limit)
          </span>
        ) : (
          <span style={{ color: "#6b7280", fontSize: "0.875rem" }}>
            ({itemCount} tab{itemCount !== 1 ? "s" : ""})
          </span>
        )}
      </div>
      <input
        type="text"
        className="link-input"
        value={url}
        readOnly
        onClick={(e) => (e.target as HTMLInputElement).select()}
      />
      {(() => {
        try {
          generateQr(url);
        } catch {
          return <p className="qr-error">URL too large for QR code</p>;
        }
        return (
          <div className="qr-wrapper">
            <QrCode content={url} className="qr-code" />
          </div>
        );
      })()}
      <div className="link-actions">
        <button className={`btn ${isCopied ? "btn-secondary" : "btn-primary"}`} onClick={onCopy}>
          {isCopied ? "Copied!" : "Copy Link"}
        </button>
      </div>
      <div className="link-export-actions">
        <button
          className="btn btn-secondary export-btn"
          onClick={handleCopyJSON}
        >
          {jsonError ? "Error" : jsonCopied ? "Copied!" : "Copy as JSON"}
        </button>
        <button
          className="btn btn-secondary export-btn"
          onClick={handleCopyMarkdown}
        >
          {mdError ? "Error" : mdCopied ? "Copied!" : "Copy as Markdown"}
        </button>
      </div>
    </div>
  );
}
