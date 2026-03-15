import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';

const viewerOrigin = (process.env.VITE_VIEWER_ORIGIN || 'http://localhost:4321').replace(/\/$/, '');

export default defineConfig({
  site: viewerOrigin,
  output: 'static',
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      exclude: ['brotli-wasm']
    }
  }
});
