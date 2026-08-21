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
    alias: [
      { find: "brotli-wasm-web", replacement: path.join(brotliDir, "pkg.web", "brotli_wasm.js") },
      // Node/vite can't consume the CompiledWasm-style .wasm import that
      // wrangler substitutes; tests use the base64 fallback stub instead.
      { find: /\.\/vendor\/brotli_wasm_bg\.wasm$/, replacement: path.resolve(__dirname, "src/__tests__/wasm-null-stub.ts") },
    ],
  },
  test: {
    environment: "node",
    alias: {
      // transitive imports (via @stash/shared) hit index.web.js, whose
      // top-level init() fetch tries a network load under Node; use the
      // Node entry instead (codec's vitest config does the same).
      "brotli-wasm": path.join(brotliDir, "index.node.js"),
    },
  },
});
