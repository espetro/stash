import { encodeTabsToQrUrl, getQrSegments, estimateQrBitLength } from "@stash/codec";
import { getBrotliFunctions } from "./brotli";
import type { TabItem } from "../components/QrDialog";

interface EncodeRequest {
  type: "encode";
  tabs: TabItem[];
  title?: string;
  encodingId: number;
}

interface EncodeSuccess {
  type: "result";
  qrUrl: string;
  prefix: string;
  payload: string;
  estimatedBits: number;
  itemCount: number;
  truncated: boolean;
  encodingId: number;
}

interface EncodeError {
  type: "error";
  message: string;
  encodingId: number;
}

type WorkerResponse = EncodeSuccess | EncodeError;

let brotliInitPromise: ReturnType<typeof getBrotliFunctions> | null = null;

function getBrotli() {
  if (!brotliInitPromise) {
    brotliInitPromise = getBrotliFunctions();
  }
  return brotliInitPromise;
}

self.onmessage = async (event: MessageEvent<EncodeRequest>) => {
  const { type, tabs, title, encodingId } = event.data;

  if (type !== "encode") {
    return;
  }

  try {
    const brotli = await getBrotli();
    const { qrUrl, itemCount, truncated } = await encodeTabsToQrUrl(
      tabs,
      brotli,
      24,
      undefined,
      title,
    );

    const estimatedBits = estimateQrBitLength(qrUrl);
    const { prefix, payload } = getQrSegments(qrUrl);

    const response: EncodeSuccess = {
      type: "result",
      qrUrl,
      prefix,
      payload,
      estimatedBits,
      itemCount,
      truncated,
      encodingId,
    };

    self.postMessage(response);
  } catch (error) {
    let message = "Failed to generate QR code. Please try again.";

    if (error instanceof Error) {
      if (error.message.includes("too large")) {
        message = "Failed to generate QR code. This stash is too large to fit in a QR code.";
      }
    }

    const response: EncodeError = {
      type: "error",
      message,
      encodingId,
    };

    self.postMessage(response);
  }
};
