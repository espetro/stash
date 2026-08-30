/**
 * Brotli loader for the mirror (F13 W1/W2).
 *
 * Runtime notes (per plan W1 decision gate):
 * - `import "brotli-wasm"` works on runtimes that can fetch the wasm
 *   asset relative to import.meta.url (Deno Deploy with the wasm shipped
 *   as an asset, Node, Vercel/Netlify with asset tracing). Prefer it there
 *   when the deploy target guarantees asset resolution.
 * - workerd-style runtimes without runtime wasm compilation must keep the
 *   vendored CompiledWasm path (apps/shortener/src/brotli.ts); the mirror
 *   does NOT target workerd — the primary stays on Cloudflare.
 * - The base64-inlined module is the universal fallback used here: zero
 *   asset resolution at runtime, works on any ES2022 + WebAssembly host,
 *   so the same bundle deploys to any provider without per-provider asset
 *   config. Cost: ~1.3MB of base64 in the bundle.
 */
import type { BrotliFunctions } from "@stash/codec";
import init, { compress, decompress } from "brotli-wasm-web";
// Base64-encoded pkg.web brotli_wasm_bg.wasm (see src/generated/).
import { BROTLI_WASM_B64 } from "./generated/brotli-wasm-b64.js";
// @ts-expect-error wasm import substituted by bundlers that support it;
// other bundlers fall back to decoding the inlined base64 below.
import wasmModule from "./vendor/brotli_wasm_bg.wasm";

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

let _brotli: BrotliFunctions | null = null;
let _initPromise: Promise<BrotliFunctions> | null = null;

export async function getBrotli(): Promise<BrotliFunctions> {
  if (_brotli) return _brotli;
  if (!_initPromise) {
    // Compiled module (bundler-substituted) wins; else decode the inlined base64.
    const mod =
      wasmModule instanceof WebAssembly.Module
        ? wasmModule
        : new (WebAssembly.Module as unknown as new (b: Uint8Array) => WebAssembly.Module)(
            decodeBase64(BROTLI_WASM_B64),
          );
    const p: Promise<BrotliFunctions> = init(mod).then(() => ({
      compress: (data: Uint8Array, opts: { quality: number }) => compress(data, opts),
      decompress: (data: Uint8Array) => decompress(data),
    }));
    _initPromise = p;
    p.then((b) => {
      _brotli = b;
    });
  }
  return _initPromise;
}
