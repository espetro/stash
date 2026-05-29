import "dotenv/config";
import { defineConfig } from "wxt";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const pkg = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "package.json"), "utf-8"),
);

export default defineConfig({
  publicDir: "public/",
  modulesDir: "modules",
  modules: ["@wxt-dev/module-react", "./modules/brotli-wasm.ts"],
  manifest: {
    name: "Stash",
    description:
      "Stash lets you save open tabs as a shareable snapshot link. No accounts. No servers. No tracking.",
    version: pkg.version,
    permissions: ["contextMenus", "tabs", "clipboardWrite", "notifications", "storage"],
    action: { default_popup: "popup/index.html" },
    icons: {
      16: "icon-16.png",
      48: "icon-48.png",
      128: "icon-128.png",
    },
    web_accessible_resources: [
      {
        resources: ["fonts/*.woff2"],
        matches: ["<all_urls>"],
      },
    ],
    browser_specific_settings: {
      gecko: {
        id: "stash@stash-extension",
        strict_min_version: "109.0",
        // @ts-ignore - WXT doesn't support this field yet (https://github.com/wxt-dev/wxt/issues/1975)
        data_collection_permissions: {
          required: ["none"],
        },
      },
    },
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
  },
  imports: {
    // @ts-ignore this fixes the issues with 'wxt/storage' and vite
    exclude: [/[\\/]node_modules[\\/]/, /[\\/]\.git[\\/]/, /[\\/]packages[\\/]/],
  },
  vite: () => {
    return {
      envDir: "../../", // Load .env from monorepo root
      define: {
        "import.meta.env.APP_VERSION": JSON.stringify(pkg.version),
      },
      optimizeDeps: {
        exclude: ["brotli-wasm"],
      },
      resolve: {
        alias: {
          "@lib": "lib",
        },
      },
    };
  },
});
