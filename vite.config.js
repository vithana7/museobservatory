import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import observatory from './vite-plugin-observatory.mjs';

export default defineConfig({
  root: '.',
  // Root '/' for the custom domain (muse-observatory.xyz) and local dev; the GitHub Pages
  // workflow sets GITHUB_PAGES=1 to serve under the project subpath instead.
  base: process.env.GITHUB_PAGES ? '/museobservatory/' : '/',
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
