import { defineConfig } from "vitest/config";
import { createRequire } from "node:module";
import path from "node:path";

// brotli-wasm's package.json "exports" hides the pkg.web deep paths;
// alias the entry that conditions DO allow, resolved pnpm-safely.
const require = createRequire(import.meta.url);
const real = require.resolve("brotli-wasm");
const brotliDir = path.dirname(require.resolve(path.join(path.dirname(real), "package.json")));

export default defineConfig({
  resolve: {
    alias: {
      "brotli-wasm-web": path.join(brotliDir, "pkg.web", "brotli_wasm.js"),
    },
  },
  test: {
    environment: "node",
  },
});
