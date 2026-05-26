import { defineConfig } from 'astro/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import react from '@astrojs/react';
import starlight from '@astrojs/starlight';
import starlightDocsPrefix from './src/integrations/starlight-docs-prefix/index.ts';

const viewerOrigin = (process.env.VITE_VIEWER_ORIGIN || 'http://localhost:4321').replace(/\/$/, '');

const pkg = JSON.parse(
  readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf-8'),
);

export default defineConfig({
  site: viewerOrigin,
  output: 'static',
  integrations: [
    react({
      babel: {
        plugins: [
          ['babel-plugin-react-compiler', {}],
        ],
      },
    }),
    starlight({
      title: 'Stash Documentation',
      customCss: ['./src/styles/custom.css'],
      head: [
        {
          tag: 'script',
          content: `(function(){var l=document.querySelector('.site-title a, [data-pagefind-ignore] a[href="/"]');if(l)l.setAttribute('href','/docs');})();`,
        },
      ],
      sidebar: [
        { label: 'Getting Started', slug: 'getting-started' },
        {
          label: 'User Guide',
          items: [
            { label: 'Using the Extension', slug: 'using-extension' },
            { label: 'Sharing Tabs', slug: 'sharing-tabs' },
            { label: 'Customization', slug: 'customization' },
          ],
        },
        {
          label: 'About',
          items: [
            { label: 'Privacy & Data', slug: 'privacy-and-data' },
            { label: 'FAQ', slug: 'faq' },
          ],
        },
      ],
    }),
    starlightDocsPrefix({
      prefix: '/docs',
      siteOrigin: viewerOrigin,
    }),
  ],
  vite: {
    build: {
      chunkSizeWarningLimit: 25,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
              return 'vendor-react';
            }
            if (
              id.includes('node_modules/radix-ui') ||
              id.includes('node_modules/@radix-ui') ||
              id.includes('node_modules/vaul')
            ) {
              return 'vendor-radix';
            }
            if (
              id.includes('node_modules/lucide-react') ||
              id.includes('node_modules/react-icons') ||
              id.includes('node_modules/@lucide')
            ) {
              return 'vendor-icons';
            }
            if (
              id.includes('node_modules/@msgpack') ||
              id.includes('node_modules/pako')
            ) {
              return 'vendor-codec';
            }
          },
        },
      },
    },
    define: {
      'import.meta.env.APP_VERSION': JSON.stringify(pkg.version),
    },
    plugins: [],
    optimizeDeps: {
      exclude: ['brotli-wasm']
    },
  },
});
