import type { BrotliFunctions } from "@stash/codec";
import brotliWasm from "brotli-wasm";

let _brotli: BrotliFunctions | null = null;
let _initPromise: Promise<BrotliFunctions> | null = null;

export async function getBrotliFunctions(): Promise<BrotliFunctions> {
  if (_brotli) return _brotli;

  if (!_initPromise) {
    _initPromise = (async () => {
      const raw = await brotliWasm;
      const brotliModule =
        "compress" in raw ? raw : (raw as { default: typeof raw }).default;
      _brotli = {
        compress: (data, opts) => brotliModule.compress(data, opts),
        decompress: (data) => brotliModule.decompress(data),
      };
      return _brotli;
    })();
  }

  return _initPromise;
}
