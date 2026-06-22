import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import observatory from './vite-plugin-observatory.mjs';

export default defineConfig({
  root: '.',
  // Hosted at the domain root (muse-observatory.xyz). The observatory IS the site.
  base: '/',
  plugins: [observatory()],
  build: {
    target: 'es2018',
    outDir: 'dist',
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },
  server: {
    port: 5173,
    open: true,
    headers: { 'Cache-Control': 'no-store' },
  },
});
