import { useState, useEffect } from "react";
import {
  encodeTabsToQrUrl,
  getQrSegments,
  estimateQrBitLength,
  MAX_QR_CAPACITY,
} from "@stash/codec";
import { getBrotliFunctions } from "@/lib/brotli";
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { OutlineButton } from "@/components/shared";
import { err, ok } from "neverthrow";
import { generate as generateQr, mode as qrMode } from "lean-qr";

interface TabItem {
  url: string;
  title: string;
}

interface QrProps {
  tabs: TabItem[];
  title?: string;
}

const doGenerateQr = async ({ tabs, title }: QrProps) => {
  try {
    const brotli = await getBrotliFunctions();
    const { qrUrl } = await encodeTabsToQrUrl(tabs, brotli, 24, undefined, title);

    const estimatedBits = estimateQrBitLength(qrUrl);

    if (estimatedBits > MAX_QR_CAPACITY) {
      return err("This stash is too large to fit in a QR code.");
    }

    const { prefix, payload } = getQrSegments(qrUrl);

    const qr = generateQr(
      qrMode.multi(
        //
        qrMode.bytes(new TextEncoder().encode(prefix)),
        qrMode.alphaNumeric(payload),
      ),
    );

    return ok(qr);
  } catch (error) {
    if (error instanceof Error && error.message.includes("too large")) {
      return err("Failed to generate QR code. This stash is too large to fit in a QR code.");
    }

    return err("Failed to generate QR code. Please try again.");
  }
};

interface Props extends QrProps {
  onClose: () => void;
}

export function QrDialogContent({ tabs, title, onClose }: Props) {
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);

    if (!canvas) return;

    const generateQrFromTabs = async () => {
      const qr = await doGenerateQr({ tabs, title });

      qr.match(
        (qrCode) => qrCode.toCanvas(canvas, { pad: 2, off: [255, 255, 255, 255] }),
        (error) => setError(error),
      );
    };

    generateQrFromTabs();
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
