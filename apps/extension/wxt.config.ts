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
      "Stash saves your open tabs as a shareable snapshot link, inline or short. Local-first. No accounts. Anonymous aggregate usage counters only, opt-out in Settings.",
    version: pkg.version,
    permissions: ["contextMenus", "tabs", "clipboardWrite", "notifications", "storage"],
    action: { default_popup: "popup/index.html" },
    // @ts-ignore - WXT doesn't expose externally_connectable in its manifest types yet
    externally_connectable: {
      ids: ["*"],
      // PR5: `stash-mcp-relay` dials the extension over a loopback
      // TCP socket which the extension opens. The relay process lives
      // at one of these origins so we list both. `ids` stays `["*"]`
      // so PR4 (or any other extension consumer) can attach without
      // further manifest edits.
      matches: [
        "https://stash.illo.fyi/*",
        "http://127.0.0.1/*",
        "http://localhost/*",
      ],
    },
    icons: {
      16: "icon-16.png",
      48: "icon-48.png",
      128: "icon-128.png",
    },
    web_accessible_resources: [
      {
        resources: ["fonts/*.woff2"],
        matches: ["https://stash.illo.fyi/*"],
      },
    ],
    browser_specific_settings: {
      gecko: {
        id: "stash@stash-extension",
        strict_min_version: "140.0",
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
    exclude: [/[\\/]node_modules[\\/]/, /[\\/]?\.[\\/]/, /[\\/]packages[\\/]/],
  },
  zip: {
    // Sources zip is built by scripts/create-sources-zip.sh (WXT's includeSources
    // emits ../.. path prefixes, which AMO rejects).
    zipSources: false,
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
