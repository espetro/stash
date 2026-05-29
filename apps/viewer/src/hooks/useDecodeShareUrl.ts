import { useState, useEffect } from "react";
import { decodeShareUrl, PayloadDecodeError } from "@stash/codec";
import { getBrotliFunctions } from "@stash/shared";

export interface DecodedData {
  expiry: number;
  isExpired: boolean;
  items: [string, string][];
  title?: string;
}

export type DecodeState =
  | { type: "loading" }
  | { type: "error"; message: string }
  | { type: "content"; data: DecodedData; format: string | null };

function getFormatParam(): string | null {
  const raw = new URLSearchParams(window.location.search).get("format");
  return raw ? raw.toLowerCase() : null;
}

export function useDecodeShareUrl(): DecodeState {
  const [state, setState] = useState<DecodeState>({ type: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const format = getFormatParam();
        const params = new URLSearchParams(window.location.search);

        let fragment = window.location.hash;

        // Fallback: if no fragment, check for ?p= query param
        if (!fragment) {
          const pParam = params.get("p");
          if (pParam) {
            fragment = `#p=${pParam}`;
          }
        }

        if (!fragment) {
          if (!cancelled) setState({ type: "error", message: "No share data found in URL" });
          return;
        }

        const brotli = await getBrotliFunctions();
        const decodedData = await decodeShareUrl(fragment, brotli);

        if (decodedData.isExpired) {
          if (!cancelled) setState({ type: "error", message: "This share link has expired" });
          return;
        }

        if (!cancelled) {
          setState({ type: "content", data: decodedData, format });
        }

        // Update alternate link tags with the API endpoint
        const encoded = fragment.slice("#p=".length);
        const jsonLink = document.querySelector('link[type="application/json"]');
        if (jsonLink) {
          jsonLink.setAttribute("href", `/json?p=${encoded}`);
        }

        const mdLink = document.querySelector('link[type="text/markdown"]');
        if (mdLink) {
          mdLink.setAttribute("href", `/md?p=${encoded}`);
        }
      } catch (error) {
        console.error("Failed to decode share URL:", error);
        if (!cancelled) {
          if (error instanceof PayloadDecodeError) {
            setState({ type: "error", message: error.message });
          } else {
            setState({ type: "error", message: "Failed to load shared tabs" });
          }
        }
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
