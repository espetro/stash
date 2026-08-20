import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    alias: {
      "brotli-wasm": path.resolve(__dirname, "../../node_modules/.pnpm/brotli-wasm@3.0.1/node_modules/brotli-wasm/index.node.js"),
    },
  },
});
