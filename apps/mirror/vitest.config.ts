import { defineConfig } from "vitest/config";
import { createRequire } from "node:module";
import path from "node:path";

// brotli-wasm's package.json "exports" hides the pkg.web deep paths;
// alias the entry that conditions DO allow, resolved pnpm-safely.
// (Same approach as apps/shortener's vitest config.)
const require = createRequire(import.meta.url);
const real = require.resolve("brotli-wasm");
const brotliDir = path.dirname(require.resolve(path.join(path.dirname(real), "package.json")));

export default defineConfig({
  resolve: {
    alias: [
      { find: "brotli-wasm-web", replacement: path.join(brotliDir, "pkg.web", "brotli_wasm.js") },
      {
        find: /\.\/vendor\/brotli_wasm_bg\.wasm$/,
        replacement: path.resolve(__dirname, "src/__tests__/wasm-null-stub.ts"),
      },
    ],
  },
  test: {
    environment: "node",
    alias: {
      "brotli-wasm": path.join(brotliDir, "index.node.js"),
    },
    exclude: ["node_modules", "dist"],
  },
});
