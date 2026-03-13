import type { BrotliFunctions } from "@stash/codec";
import brotliWasm from "brotli-wasm";

let _brotli: BrotliFunctions | null = null;
let _initPromise: Promise<BrotliFunctions> | null = null;

export async function getBrotliFunctions(): Promise<BrotliFunctions> {
  if (_brotli) return _brotli;

  if (!_initPromise) {
    _initPromise = (async () => {
      const brotliModule = await brotliWasm;
      _brotli = {
        compress: (data, opts) => brotliModule.compress(data, opts),
        decompress: (data) => brotliModule.decompress(data),
      };
      return _brotli;
    })();
  }

  return _initPromise;
}
