import { PayloadDecodeError } from "@stash/codec";
import type { BrotliFunctions } from "@stash/codec";
import brotliWasm from "brotli-wasm";

let _brotli: BrotliFunctions | null = null;

export async function getBrotli(): Promise<BrotliFunctions> {
  if (_brotli) return _brotli;
  const raw = (await brotliWasm) as any;
  const mod = "compress" in raw ? raw : raw.default;
  _brotli = {
    compress: (data, opts) => mod.compress(data, opts),
    decompress: (data) => mod.decompress(data),
  };
  return _brotli;
}

export { PayloadDecodeError };
