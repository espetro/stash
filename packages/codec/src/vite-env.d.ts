/// <reference types="vite/client" />

// Note: This package is consumed by two different builders:
// 1. Vite (viewer/extension) - injects import.meta.env at build-time
// 2. Wrangler/esbuild (CF Pages Functions) - does NOT inject import.meta.env
//
// VITE_VIEWER_ORIGIN is marked optional here to reflect that it may be undefined
// in Wrangler builds. The constants.ts uses optional chaining to handle this gracefully.
interface ImportMetaEnv {
  readonly VITE_VIEWER_ORIGIN?: string;
}

interface ImportMeta {
  readonly env?: ImportMetaEnv;
}
