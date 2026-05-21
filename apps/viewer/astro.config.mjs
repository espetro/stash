import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import starlight from '@astrojs/starlight';
import starlightDocsPrefix from './src/integrations/starlight-docs-prefix/index.ts';

const viewerOrigin = (process.env.VITE_VIEWER_ORIGIN || 'http://localhost:4321').replace(/\/$/, '');

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
    plugins: [],
    optimizeDeps: {
      exclude: ['brotli-wasm']
    },
  },
});
