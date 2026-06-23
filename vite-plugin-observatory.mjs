// Vite plugin — Muse Observatory pipeline glue (Phase 1).
//
//   dev   : serve /campaigns.json + /<slug>/ from memory
//           (drafts included for preview); reload when content/ or record.css change.
//   build : emit dist/campaigns.json + dist/<slug>/index.html
//           (non-draft pages only — drafts stay unpublished).
//
// The markdown parser lives only here / in the build script — never in the client bundle.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateObservatory } from './scripts/observatory/build.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.join(HERE, 'content/campaigns');
const RECORD_CSS = path.join(HERE, 'src/observatory/record.css');

export default function observatory() {
  let outDir = path.join(HERE, 'dist');
  let isBuild = false;
  let base = '/';

  return {
    name: 'observatory',

    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
      isBuild = config.command === 'build';
      base = config.base; // '/' in dev, '/museobservatory/' on the Pages subpath build
    },

    // ── dev: serve generated artifacts + live-reload on content edits ────────
    configureServer(server) {
      server.watcher.add([CONTENT_DIR, RECORD_CSS]);
      const reload = (file) => {
        if (file.startsWith(CONTENT_DIR) || file === RECORD_CSS) {
          server.ws.send({ type: 'full-reload' });
        }
      };
      server.watcher.on('change', reload);
      server.watcher.on('add', reload);
      server.watcher.on('unlink', reload);

      server.middlewares.use(async (req, res, next) => {
        const url = (req.url || '').split('?')[0];
        // Only campaigns.json or a /<slug>(/) path is ours. Anything Vite owns
        // (/, /src/…, /assets/…, /@vite/…, /node_modules/…) must pass through.
        const slugMatch = url.match(/^\/([^/]+)\/?(?:index\.html)?$/);
        const wantsJson = url === '/campaigns.json';
        if (!wantsJson && !slugMatch) return next();

        let out;
        try {
          out = await generateObservatory({ includeDrafts: true, base });
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'text/plain');
          res.end(`Observatory build error:\n${err.stack || err}`);
          return;
        }

        if (wantsJson) {
          res.setHeader('Content-Type', 'application/json');
          res.end(out.campaignsJson);
          return;
        }

        // /<slug>(/)(index.html) — only if it's a real campaign slug, else pass through.
        const page = slugMatch && out.pages.find((p) => p.slug === slugMatch[1]);
        if (page) {
          res.setHeader('Content-Type', 'text/html');
          res.end(page.html);
          return;
        }
        return next();
      });
    },

    // ── build: write artifacts into dist/ ───────────────────────────────────
    async closeBundle() {
      if (!isBuild) return; // dev server also fires this hook — skip there
      const out = await generateObservatory({ includeDrafts: false, base });
      await fs.mkdir(outDir, { recursive: true });
      await fs.writeFile(path.join(outDir, 'campaigns.json'), out.campaignsJson);
      for (const page of out.pages) {
        const dir = path.join(outDir, page.slug);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, 'index.html'), page.html);
      }
      const { total, pages, drafts, tileOnly } = out.summary;
      // eslint-disable-next-line no-console
      console.log(
        `\n[observatory] ${total} campaigns → ${pages} page(s) written, ` +
          `${drafts} draft(s) held back, ${tileOnly} tile-only.`,
      );
    },
  };
}
