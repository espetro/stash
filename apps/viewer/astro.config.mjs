import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

const viewerOrigin = (process.env.VITE_VIEWER_ORIGIN || 'http://localhost:4321').replace(/\/$/, '');

export default defineConfig({
  site: viewerOrigin,
  output: 'static',
  build: {
    format: 'file'
  },
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      exclude: ['brotli-wasm']
    }
  }
});
