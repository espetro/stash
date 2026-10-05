import * as React from "react";
import { useEffect, useRef } from "react";
import { LuX } from "react-icons/lu";
import { generate as generateQr } from "lean-qr";
import { toSvgDataURL } from "lean-qr/extras/svg";
import { makeSyncComponent } from "lean-qr/extras/react";

const QrCode = makeSyncComponent(React, generateQr, toSvgDataURL, {
  on: "#000000",
  off: "#ffffff",
  pad: 4,
});

interface QrDialogProps {
  url: string;
  onClose: () => void;
}

/** Native-<dialog> QR share surface for a ready-made share URL (PR E §3). */
export function QrDialog({ url, onClose }: QrDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    dialog.addEventListener("cancel", onCancel);
    return () => dialog.removeEventListener("cancel", onCancel);
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      className="qr-dialog"
      aria-label="Share QR code"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="qr-dialog-body">
        <QrCode content={url} className="qr-code" />
        <span className="qr-dialog-url">{url}</span>
        <button type="button" className="stash-row-action" onClick={onClose}>
          <LuX aria-hidden /> Close
        </button>
      </div>
    </dialog>
  );
}
