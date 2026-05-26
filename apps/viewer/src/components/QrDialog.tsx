import { useState, useEffect, useRef } from "react";
import { MAX_QR_CAPACITY } from "@stash/codec";
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { OutlineButton } from "@/components/shared";
import { generate as generateQr, mode as qrMode } from "lean-qr";
import QrEncoderWorker from "@/lib/qr-encoder.worker?worker";

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const encodingIdRef = useRef(0);
  const [isEncoding, setIsEncoding] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

        const qr = generateQr(
          qrMode.multi(
            qrMode.bytes(new TextEncoder().encode(msg.prefix)),
            qrMode.alphaNumeric(msg.payload),
          ),
        );

        const canvas = canvasRef.current;
        if (canvas) {
          qr.toCanvas(canvas, {
            on: [0, 0, 0, 255],
            off: [255, 255, 255, 255],
            pad: 4,
          });
        }

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
      ) : (
        <canvas
          ref={canvasRef}
          width={240}
          height={240}
          className="mx-auto block rounded-lg bg-white"
          style={{ width: 240, height: 240, imageRendering: "pixelated" }}
        />
      )}
      <div className="flex justify-center">
        <OutlineButton onClick={onClose} className="w-full">
          Close
        </OutlineButton>
      </div>
    </DialogContent>
  );
}
