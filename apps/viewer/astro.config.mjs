import { defineConfig } from "astro/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import starlight from "@astrojs/starlight";
import starlightDocsPrefix from "./src/integrations/starlight-docs-prefix/index.ts";
import IntlAi from "@intl-ai/unplugin/vite";

const viewerOrigin = (process.env.VITE_VIEWER_ORIGIN ?? "http://localhost:4321").replace(/\/$/, "");

const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, "package.json"), "utf-8"));

// Only fill translations on explicit opt-in (pnpm i18n:fill). Never during normal builds.
const vitePlugins = process.env.INTL_AI_FILL === "1" ? [IntlAi()] : [];

export default defineConfig({
  site: viewerOrigin,
  output: "static",
  // Hide the Astro dev toolbar so it doesn't inject dev-only anchors
  // that bleed into querySelectorAll-backed selectors. E2E harnesses
  // run against `astro preview` (production bundle) where the toolbar
  // isn't even present, so this is belt-and-braces for anyone running
  // `astro dev` while exploring e2e selectors.
  devToolbar: {
    enabled: false,
  },
  i18n: {
    defaultLocale: "en",
    locales: ["en", "es", "ru", "fr"],
    routing: {
      prefixDefaultLocale: false,
    },
  },
  integrations: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler", {}]],
      },
    }),
    sitemap({
      i18n: {
        defaultLocale: "en",
        locales: {
          en: "en",
          es: "es",
          ru: "ru",
          fr: "fr",
        },
      },
      filter: (page) => !page.includes("/docs/"),
    }),
    starlight({
      title: "Stash Documentation",
      customCss: ["./src/styles/custom.css"],
      head: [
        {
          tag: "script",
          content: `(function(){var l=document.querySelector('.site-title a, [data-pagefind-ignore] a[href="/"]');if(l)l.setAttribute('href','/docs');})();`,
        },
      ],
      sidebar: [
        { label: "Getting Started", slug: "getting-started" },
        {
          label: "User Guide",
          items: [
            { label: "Using the Extension", slug: "using-extension" },
            { label: "Sharing Tabs", slug: "sharing-tabs" },
            { label: "Customization", slug: "customization" },
          ],
        },
        {
          label: "About",
          items: [
            { label: "Privacy & Data", slug: "privacy-and-data" },
            { label: "Agents & MCP", slug: "agent-server" },
            { label: "FAQ", slug: "faq" },
            { label: "Self-Hosting", slug: "self-hosting" },
          ],
        },
      ],
    }),
    starlightDocsPrefix({
      prefix: "/docs",
      siteOrigin: viewerOrigin,
    }),
  ],
  vite: {
    build: {
      chunkSizeWarningLimit: 25,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules/react-dom") || id.includes("node_modules/react/")) {
              return "vendor-react";
            }
            if (
              id.includes("node_modules/radix-ui") ||
              id.includes("node_modules/@radix-ui") ||
              id.includes("node_modules/vaul")
            ) {
              return "vendor-radix";
            }
            if (
              id.includes("node_modules/lucide-react") ||
              id.includes("node_modules/react-icons") ||
              id.includes("node_modules/@lucide")
            ) {
              return "vendor-icons";
            }
            if (id.includes("node_modules/@msgpack") || id.includes("node_modules/pako")) {
              return "vendor-codec";
            }
          },
        },
      },
    },
    define: {
      "import.meta.env.APP_VERSION": JSON.stringify(pkg.version),
    },
    plugins: vitePlugins,
    optimizeDeps: {
      exclude: ["brotli-wasm"],
    },
  },
});
