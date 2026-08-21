declare module "brotli-wasm-web" {
  export default function init(
    module_or_path?: WebAssembly.Module | Promise<WebAssembly.Module>,
  ): Promise<unknown>;
  export function compress(buf: Uint8Array, options?: { quality?: number }): Uint8Array;
  export function decompress(buf: Uint8Array): Uint8Array;
}
