import brotliPromise from "brotli-wasm";
let _brotli = null;
/**
 * Returns the initialized brotli-wasm module.
 * Lazy singleton — safe to call multiple times.
 */
export async function getBrotli() {
    if (!_brotli) {
        _brotli = await brotliPromise;
    }
    return _brotli;
}
