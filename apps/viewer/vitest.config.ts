import { defineConfig } from "vitest/config";
import path from "path";
import fs from "fs";

// Cloudflare's bundler gives Pages Functions a WebAssembly.Module for
// .wasm imports; in vitest there is no such rule, so serve the raw bytes
// (decode.ts compiles them itself as its fallback branch).
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

export default defineConfig({
  plugins: [wasmBytes()],
  test: {
    alias: {
      "brotli-wasm": path.resolve(__dirname, "node_modules/brotli-wasm/index.node.js"),
      "@": path.resolve(__dirname, "src"),
    },
    // dist-alternates is a post-build contract test, run explicitly via
    // `pnpm run test:dist` after `astro build` (matches CI ordering);
    // excluded from the pre-build unit run so it can't fail spuriously.
    exclude: ["node_modules", "dist", "src/__tests__/dist-alternates.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
