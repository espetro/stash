import { defineConfig } from "vitest/config";
import path from "path";
import fs from "fs";

// Post-build contract config for dist-alternates.test.ts. Runs AFTER
// `astro build` (see package.json test:dist); the default vitest.config.ts
// excludes this file so the pre-build unit run stays green.
// Mirrors wasmBytes() from vitest.config.ts.
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
    exclude: ["node_modules", "dist"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
