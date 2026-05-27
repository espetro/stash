import * as React from "react";
import { useState, useEffect, useRef } from "react";
import { MAX_QR_CAPACITY } from "@stash/codec";
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { OutlineButton } from "@/components/shared";
import { generate as generateQr } from "lean-qr";
import { toSvgDataURL } from "lean-qr/extras/svg";
import { makeSyncComponent } from "lean-qr/extras/react";
import QrEncoderWorker from "@/lib/qr-encoder.worker?worker";

const QrCode = makeSyncComponent(React, generateQr, toSvgDataURL, {
  on: "#000000",
  off: "#ffffff",
  pad: 4,
});

export interface TabItem {
  url: string;
  title: string;
}

interface Props {
  tabs: TabItem[];
  title?: string;
  onClose: () => void;
}

export function QrDialogContent({ tabs, title, onClose }: Props) {
  const workerRef = useRef<Worker | null>(null);
  const encodingIdRef = useRef(0);
  const [isEncoding, setIsEncoding] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  useEffect(() => {
    const worker = new QrEncoderWorker();
    workerRef.current = worker;

    worker.onmessage = (event) => {
      const msg = event.data;

      if (msg.type === "result") {
        if (msg.encodingId !== encodingIdRef.current) {
          return;
        }

        if (msg.estimatedBits > MAX_QR_CAPACITY) {
          setError("This stash is too large to fit in a QR code.");
          setIsEncoding(false);
          return;
        }

        setQrUrl(msg.qrUrl);
        setIsEncoding(false);
      } else if (msg.type === "error") {
        if (msg.encodingId !== encodingIdRef.current) {
          return;
        }

        setError(msg.message);
        setIsEncoding(false);
      }
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const worker = workerRef.current;
    if (!worker) return;

    setIsEncoding(true);
    setError(null);
    setQrUrl(null);
    encodingIdRef.current += 1;

    worker.postMessage({
      type: "encode",
      tabs,
      title,
      encodingId: encodingIdRef.current,
    });
  }, [tabs, title]);

  return (
    <DialogContent className="sm:max-w-160">
      <DialogHeader>
        <DialogTitle className="text-foreground">Share this stash</DialogTitle>
        <DialogDescription>Scan this QR code to import the tabs</DialogDescription>
      </DialogHeader>
      {error ? (
        <p className="text-center text-sm text-muted-foreground">{error}</p>
      ) : isEncoding ? (
        <div className="flex items-center justify-center w-full h-60">
          <p className="text-sm text-muted-foreground">Generating QR code...</p>
        </div>
      ) : qrUrl ? (
        <div className="mx-auto flex justify-center">
          <QrCode
            content={qrUrl}
            className="rounded-lg"
          />
        </div>
      ) : null}
      <div className="flex justify-center">
        <OutlineButton onClick={onClose} className="w-full">
          Close
        </OutlineButton>
      </div>
    </DialogContent>
  );
}
