/// <reference types="vite/client" />

declare global {
  const browser: typeof chrome | undefined;
}

declare module "brotli-wasm/pkg.web/brotli_wasm.js" {
  const init: (url?: string) => Promise<void>;
  export default init;
  export * from "brotli-wasm";
}

export {};
