import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    alias: {
      "brotli-wasm": path.resolve(__dirname, "node_modules/brotli-wasm/index.node.js"),
    },
  },
});
