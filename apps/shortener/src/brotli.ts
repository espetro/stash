import type { BrotliFunctions } from "@stash/codec";
// brotli-wasm's "exports" hides its pkg.web deep paths, and workerd bundlers
// can't resolve the wasm via import.meta.url. We inline the wasm bytes
// (base64, generated) and hand the compiled WebAssembly.Module to init().
// resolved via vite/wrangler alias to the vendored pkg.web js
import init, { compress, decompress } from "brotli-wasm-web"; // esbuild (wrangler) substitutes this with a build-time compiled module;
// other bundlers fall back to decoding the inlined base64.
// @ts-expect-error wasm import is handled by wrangler's CompiledWasm rule
import wasmModule from "./vendor/brotli_wasm_bg.wasm";
import { BROTLI_WASM_B64 } from "./generated/brotli-wasm-b64";

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
    // Test stub (null) and missing module both fall back to the base64 bytes.
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
