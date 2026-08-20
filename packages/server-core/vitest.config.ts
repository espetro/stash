import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: [
      // @stash/shared loads brotli-wasm at module top level (wasm fetch in
      // node); tests use node-native brotli via __tests__/brotli.ts instead.
      { find: "brotli-wasm", replacement: path.resolve(__dirname, "__tests__/brotli-wasm-stub.ts") },
    ],
  },
  test: {
    environment: "node",
  },
});
