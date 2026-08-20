import type { BrotliFunctions } from "@stash/codec";
// brotli-wasm's "exports" hides its pkg.web deep paths, and workerd bundlers
// can't resolve the wasm via import.meta.url. We inline the wasm bytes
// (base64, generated) and hand the compiled WebAssembly.Module to init().
// @ts-expect-error resolved via vite/wrangler alias to the vendored pkg.web js
import init, { compress, decompress } from "brotli-wasm-web";
// esbuild (wrangler) substitutes this with a build-time compiled module;
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
    const mod =
      wasmModule instanceof WebAssembly.Module
        ? wasmModule
        : new WebAssembly.Module(decodeBase64(BROTLI_WASM_B64));
    _initPromise = init(mod).then(() => ({
      compress: (data, opts) => compress(data, opts),
      decompress: (data) => decompress(data),
    }));
    _initPromise.then((b) => {
      _brotli = b;
    });
  }
  return _initPromise;
}
