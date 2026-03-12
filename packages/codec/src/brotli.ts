import brotliPromise from "brotli-wasm";

type BrotliModule = Awaited<typeof brotliPromise>;

let _brotli: BrotliModule | null = null;

/**
 * Returns the initialized brotli-wasm module.
 * Lazy singleton — safe to call multiple times.
 */
export async function getBrotli(): Promise<BrotliModule> {
  if (!_brotli) {
    _brotli = await brotliPromise;
  }
  return _brotli;
}
