import { useState, useEffect, useRef } from "react";
import {
  encodePayloadToUrl,
  encodePayloadToQr,
  createPayload,
  estimateQrBitLength,
  BUDGET_CHARS,
  type BrotliFunctions,
} from "@stash/codec";
import { getBrotliFunctions, extractTitle } from "@stash/shared";

export interface BudgetStatus {
  /** Estimated share-URL character count (origin + /s/#p= + payload) */
  urlChars: number;
  /** Hard budget for URL length */
  budgetChars: number;
  itemCount: number;
  /** Estimated QR bit length of the base32 form (mixed-mode) */
  qrBits: number;
  /** Whether the payload still fits a practical QR (version 15, ECC L) */
  qrPossible: boolean;
}

const EMPTY: BudgetStatus = {
  urlChars: 0,
  budgetChars: BUDGET_CHARS,
  itemCount: 0,
  qrBits: 0,
  qrPossible: true,
};

/** Practical QR bound: version 15 at ECC L (3706 bits). Beyond this most
 *  phone cameras struggle even though the spec allows up to version 40. */
const PRACTICAL_QR_BITS = 3706;

/** Rough origin allowance when we can't know the deployed origin exactly. */
const ORIGIN_ALLOWANCE = 32;

function parseLines(urls: string): Array<{ url: string; title: string }> {
  return urls
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((line) => {
      const pipeIdx = line.indexOf("|");
      if (pipeIdx > 0) {
        const url = line.slice(0, pipeIdx).trim();
        const title = line.slice(pipeIdx + 1).trim();
        if (title) return { url, title };
      }
      return { url: line, title: extractTitle(line) };
    });
}

/**
 * Live budget meter for the /s/new form. Debounced (300ms) encode of the
 * current input via the codec, reporting URL chars against BUDGET_CHARS,
 * item count, and QR feasibility (base32 QR capacity is the tighter bound).
 */
export function useBudgetMeter(urls: string, stashTitle: string): BudgetStatus {
  const [status, setStatus] = useState<BudgetStatus>(EMPTY);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);

    const tabs = parseLines(urls);
    if (tabs.length === 0) {
      setStatus(EMPTY);
      return;
    }

    timer.current = setTimeout(async () => {
      const id = ++seq.current;
      try {
        const brotli = await getBrotliFunctions();
        const title = stashTitle.trim() || undefined;
        const next = await estimate(tabs, title, brotli);
        if (seq.current === id) setStatus(next);
      } catch {
        // keep last known status on transient encode failure
      }
    }, 300);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [urls, stashTitle]);

  return status;
}

async function estimate(
  tabs: Array<{ url: string; title: string }>,
  title: string | undefined,
  brotli: BrotliFunctions,
): Promise<BudgetStatus> {
  const payload = createPayload(tabs, 24, title);

  const urlEncoded = await encodePayloadToUrl(payload, brotli);
  const urlChars = ORIGIN_ALLOWANCE + "/s/#p=".length + urlEncoded.length;

  const qrEncoded = await encodePayloadToQr(payload, brotli);
  const qrBits = estimateQrBitLength(`https://s/#q=${qrEncoded}`);

  return {
    urlChars,
    budgetChars: BUDGET_CHARS,
    itemCount: tabs.length,
    qrBits,
    qrPossible: qrBits <= PRACTICAL_QR_BITS,
  };
}
