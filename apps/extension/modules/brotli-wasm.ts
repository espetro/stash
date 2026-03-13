import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { defineWxtModule } from "wxt/modules";

export default defineWxtModule((wxt) => {
  wxt.hook("build:publicAssets", (_, assets) => {
    const possiblePaths = [
      "node_modules/brotli-wasm/pkg.web/brotli_wasm_bg.wasm",
      "node_modules/.pnpm/brotli-wasm@3.0.1/node_modules/brotli-wasm/pkg.web/brotli_wasm_bg.wasm",
    ];

    let wasmPath = null;
    for (const relPath of possiblePaths) {
      const fullPath = resolve(wxt.config.root, relPath);
      if (existsSync(fullPath)) {
        wasmPath = fullPath;
        break;
      }
    }

    if (!wasmPath) {
      throw new Error("Could not find brotli_wasm_bg.wasm in node_modules");
    }

    assets.push({
      absoluteSrc: wasmPath,
      relativeDest: "chunks/brotli_wasm_bg.wasm",
    });
  });
});
