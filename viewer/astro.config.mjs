import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'http://localhost:4321', // Update before production
  output: 'static',
  build: {
    format: 'file'
  }
});
