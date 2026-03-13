import brotliPromise from "brotli-wasm";

type BrotliModule = Awaited<typeof brotliPromise>;

let _brotli: BrotliModule | null = null;
let _initPromise: Promise<BrotliModule> | null = null;

export async function getBrotli(): Promise<BrotliModule> {
  if (_brotli) return _brotli;
  
  if (!_initPromise) {
    _initPromise = (async () => {
      const hasExtensionRuntime = typeof globalThis !== 'undefined' &&
        (globalThis as any).chrome !== 'undefined' &&
        typeof (globalThis as any).chrome.runtime !== 'undefined' &&
        typeof (globalThis as any).chrome.runtime.getURL === 'function';

      if (hasExtensionRuntime) {
        const wasmUrl = (globalThis as any).chrome.runtime.getURL('chunks/brotli_wasm_bg.wasm');
        const response = await fetch(wasmUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch WASM: ${response.status} ${response.statusText}`);
        }
        const wasmBuffer = await response.arrayBuffer();
        
        const brotliModule = await import('brotli-wasm/pkg.web/brotli_wasm.js');
        await brotliModule.default(wasmBuffer);
        return brotliModule as unknown as BrotliModule;
      } else {
        return await brotliPromise;
      }
    })();
  }

  const result = await _initPromise;
  _brotli = result
  return _brotli
}
