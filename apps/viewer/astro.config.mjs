import { defineConfig } from 'astro/config';

const viewerOrigin = (process.env.VITE_VIEWER_ORIGIN || 'http://localhost:4321').replace(/\/$/, '');

export default defineConfig({
  site: viewerOrigin,
  output: 'static',
  build: {
    format: 'file'
  }
});
