interface ImportMetaEnv {
  readonly VITE_VIEWER_ORIGIN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "brotli-wasm/pkg.web/brotli_wasm.js" {
  export type InitInput =
    | RequestInfo
    | URL
    | Response
    | BufferSource
    | WebAssembly.Module;
  export default function init(
    input?: InitInput | Promise<InitInput>
  ): Promise<unknown>;
  export function compress(
    buf: Uint8Array,
    options?: { quality?: number }
  ): Uint8Array;
  export function decompress(buf: Uint8Array): Uint8Array;
}
