import { defineConfig } from "vitest/config";
import path from "node:path";
import fs from "node:fs";

// Mirrors apps/viewer/vitest.config.ts: Cloudflare's bundler gives Pages
// Functions a WebAssembly.Module for .wasm imports; in vitest there is no
// such rule, so serve the raw bytes (decode.ts compiles them itself).
function wasmBytes() {
  return {
    name: "wasm-bytes",
    enforce: "pre" as const,
    load(id: string) {
      if (!id.endsWith(".wasm")) return undefined;
      const b64 = fs.readFileSync(id).toString("base64");
      return `const bin = atob(${JSON.stringify(b64)});
export default Uint8Array.from(bin, (c) => c.charCodeAt(0));`;
    },
  };
}

const viewerRoot = path.resolve(__dirname, "../../apps/viewer");

export default defineConfig({
  plugins: [wasmBytes()],
  resolve: {
    alias: {
      "brotli-wasm": path.join(viewerRoot, "node_modules/brotli-wasm/index.node.js"),
    },
  },
  test: {
    include: ["src/__tests__/**/*.test.ts"],
    testTimeout: 90_000,
    hookTimeout: 90_000,
  },
});
