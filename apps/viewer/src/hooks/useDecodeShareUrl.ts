import { useState, useEffect } from "react";
import { decodeShareUrl, decodeEncodedPayload, PayloadDecodeError } from "@stash/codec";
import { decryptFromRelay } from "@stash/shared/crypto";
import { getBrotliFunctions } from "@stash/shared";
import { getShortenerOrigin } from "@/lib/shortener";

export interface DecodedData {
  expiry: number;
  isExpired: boolean;
  version: number;
  items: [string, string, ("url" | "note")?][];
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

        const fragment = window.location.hash;
        let scopedFragment = fragment;

        // Zero-trust relayed link (F14): /s/<id>#<key> redirects here as
        // /s?id=<id>#<key>. The key stays in the fragment (never sent to
        // any server); the ciphertext is fetched and decrypted locally.
        const relayId = params.get("id");
        if (relayId && /^[A-Za-z2-7]{6}$/.test(relayId)) {
          const key = fragment.slice(1);
          if (!key) {
            if (!cancelled) {
              setState({
                type: "error",
                message:
                  "Link incomplete: the decryption key is missing from this link. Ask for a fresh link; the stored copy cannot be read without it.",
              });
            }
            return;
          }
          const res = await fetch(`${getShortenerOrigin()}/s/${relayId.toUpperCase()}?format=json`);
          if (!res.ok) {
            if (!cancelled) {
              setState({
                type: "error",
                message:
                  res.status === 404 || res.status === 410
                    ? "This share link has expired or was revoked"
                    : "Failed to fetch the encrypted stash",
              });
            }
            return;
          }
          const envelope = (await res.json()) as { ciphertext?: string };
          if (typeof envelope.ciphertext !== "string") {
            if (!cancelled) setState({ type: "error", message: "Invalid ciphertext envelope" });
            return;
          }
          const brotli = await getBrotliFunctions();
          let plaintext: string;
          try {
            plaintext = await decryptFromRelay(envelope.ciphertext, key);
          } catch {
            if (!cancelled) {
              setState({
                type: "error",
                message: "Decryption failed: this link is invalid or was altered",
              });
            }
            return;
          }
          const decodedData = await decodeEncodedPayload(plaintext, brotli);
          if (decodedData.isExpired) {
            if (!cancelled) setState({ type: "error", message: "This share link has expired" });
            return;
          }
          if (!cancelled) setState({ type: "content", data: decodedData, format });
          return;
        }

        // Self-contained link: the payload lives in the fragment (or ?p=
        // fallback, used by agent-facing format negotiation).
        if (!fragment) {
          const pParam = params.get("p");
          if (pParam) {
            scopedFragment = `#p=${pParam}`;
          }
        }

        if (!scopedFragment) {
          if (!cancelled) setState({ type: "error", message: "No share data found in URL" });
          return;
        }

        const brotli = await getBrotliFunctions();
        const decodedData = await decodeShareUrl(scopedFragment, brotli);

        if (decodedData.isExpired) {
          if (!cancelled) setState({ type: "error", message: "This share link has expired" });
          return;
        }

        if (!cancelled) {
          setState({ type: "content", data: decodedData, format });
        }

        // Update alternate link tags with the API endpoint
        const encoded = scopedFragment.slice("#p=".length);
        const jsonLink = document.querySelector('link[type="application/json"]');
        if (jsonLink) {
          jsonLink.setAttribute("href", `/s?p=${encoded}&format=json`);
        }

        const mdLink = document.querySelector('link[type="text/markdown"]');
        if (mdLink) {
          mdLink.setAttribute("href", `/s?p=${encoded}&format=md`);
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
