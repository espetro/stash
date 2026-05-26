import { useState, useEffect } from "react";
import { encodeTabsToQrUrl, getQrSegments, estimateQrBitLength } from "@stash/codec";
import { getBrotliFunctions } from "@/lib/brotli";
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { OutlineButton } from "@/components/shared";

interface TabItem {
  url: string;
  title: string;
}

export function QrDialogContent({
  tabs,
  title,
  onClose,
}: {
  tabs: TabItem[];
  title?: string;
  onClose: () => void;
}) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);

    if (!canvas) return;

    async function generateQr() {
      try {
        if (!canvas) return;
        const brotli = await getBrotliFunctions();
        const { qrUrl } = await encodeTabsToQrUrl(tabs, brotli, 24, undefined, title);

        const estimatedBits = estimateQrBitLength(qrUrl);
        if (estimatedBits > 23648) {
          setError("This stash is too large to fit in a QR code.");
          return;
        }

        const { prefix, payload } = getQrSegments(qrUrl);
        const leanQr = await import("lean-qr");
        const qr = leanQr.generate(
          leanQr.mode.multi(
            leanQr.mode.bytes(new TextEncoder().encode(prefix)),
            leanQr.mode.alphaNumeric(payload),
          ),
        );
        qr.toCanvas(canvas, { pad: 2, off: [255, 255, 255, 255] });
      } catch (err) {
        console.error("Failed to generate QR code:", err);
        if (err instanceof Error && err.message.includes("too large")) {
          setError("This stash is too large to fit in a QR code.");
        } else {
          setError("Failed to generate QR code. Please try again.");
        }
      }
    }

    generateQr();
  }, [tabs, title, canvas]);

  return (
    <DialogContent className="sm:max-w-160">
      <DialogHeader>
        <DialogTitle className="text-foreground">Share this stash</DialogTitle>
        <DialogDescription>Scan this QR code to import the tabs</DialogDescription>
      </DialogHeader>
      {error ? (
        <p className="text-center text-sm text-muted-foreground">{error}</p>
      ) : (
        <canvas
          ref={setCanvas}
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
