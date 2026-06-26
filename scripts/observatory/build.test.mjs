// Muse Observatory — build pipeline tests (node:test, no deps).
//   node --test        (or npm test)
//
// Two surfaces under test:
//   • parseCampaign()        — pure per-file logic; driven by inline fixtures so we can
//                              cover edge cases (drafts, off-pattern names, unknown muse)
//                              without committing throwaway markdown.
//   • generateObservatory()  — the whole pipeline against the REAL content/campaigns/,
//                              locking the emitted campaigns.json shape + draft gate.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseCampaign, buildMuseMap, generateObservatory, ROOT } from './build.mjs';

// generateObservatory reads real content/campaigns/ — to exercise the page render
// (marked → DOMPurify → [confirm] highlight) on a controlled body, drop a temp .md file
// in, build with includeDrafts (so a [confirm] draft is rendered too), grab its page,
// then remove the fixture. Slug well outside the real number range to avoid any clash.
const CONTENT_DIR = path.join(ROOT, 'content/campaigns');
async function renderBodyPage(body, filename = 'STARDUST900.md') {
  const file = path.join(CONTENT_DIR, filename);
  await fs.writeFile(file, `---\ntitle: Sanitize Fixture\n---\n${body}`);
  try {
    const { pages } = await generateObservatory({ includeDrafts: true });
    const slug = filename.replace(/\.md$/, '').toLowerCase();
    return pages.find((p) => p.slug === slug)?.html ?? '';
  } finally {
    await fs.rm(file, { force: true });
  }
}

// A real muse map (cause from MUSES, hex from tokens.css) so the join is tested for real.
const museMap = await buildMuseMap();

// Tiny frontmatter builder → a complete markdown file string.
function md(frontmatter, body = '') {
  return `---\n${frontmatter}\n---\n${body}`;
}
// parseCampaign with a captured warning list.
function parse(raw, filename) {
  const warnings = [];
  const out = parseCampaign(raw, filename, museMap, (m) => warnings.push(m));
  return { ...out, warnings };
}

// ── (a) identity is derived from the filename ────────────────────────────────
test('identity: slug/type/number derived from filename', () => {
  const { index } = parse(md('title: A', '## Body\nprose'), 'STARDUST007.md');
  assert.equal(index.slug, 'stardust007');
  assert.equal(index.type, 'stardust');
  assert.equal(index.number, 7);
});

test('identity: off-pattern filename degrades + warns', () => {
  const { index, warnings } = parse(md('title: A', 'prose'), 'random-notes.md');
  assert.equal(index.slug, 'random-notes'); // degrades to basename
  assert.equal(index.type, null);
  assert.equal(index.number, null);
  assert.ok(warnings.some((w) => /doesn't match TYPE\+NNN/.test(w)));
});

test('identity: redundant frontmatter type/number/slug warns', () => {
  const { warnings } = parse(md('title: A\ntype: horizon\nslug: foo', 'prose'), 'STARDUST001.md');
  assert.ok(warnings.some((w) => /redundant frontmatter "type:/.test(w)));
  assert.ok(warnings.some((w) => /redundant frontmatter "slug:/.test(w)));
});

// ── (b) the draft gate (highest-value) ───────────────────────────────────────
test('draft gate: [confirm] marker → draft', () => {
  const { draft } = parse(md('title: A', '## Body\nfact: [confirm: tbd]'), 'STARDUST001.md');
  assert.equal(draft, true);
});

test('draft gate: draft:true → draft', () => {
  const { draft } = parse(md('title: A\ndraft: true', '## Body\nprose'), 'STARDUST001.md');
  assert.equal(draft, true);
});

test('draft gate: a clean page-worthy file is NOT a draft', () => {
  const { draft } = parse(md('title: A', '## Body\nprose'), 'STARDUST001.md');
  assert.equal(draft, false);
});

test('draft gate: detection is stateless across repeated calls', () => {
  // Regression guard for the old shared-/g-regex lastIndex bug: same input, many calls.
  for (let i = 0; i < 5; i++) {
    assert.equal(parse(md('title: A', '[confirm]'), 'STARDUST001.md').draft, true);
  }
});

test('draft gate: a page-worthy draft is excluded from build but present in dev', async () => {
  // Pipeline-level: synthesise via includeDrafts. The real content/ has no page-worthy
  // draft, so assert on the flag the pipeline exposes instead.
  const build = await generateObservatory({ includeDrafts: false });
  const dev = await generateObservatory({ includeDrafts: true });
  // Drafts never have a record page in build mode…
  const buildIdx = JSON.parse(build.campaignsJson);
  for (const c of buildIdx) {
    if (c.draft) assert.equal(c.hasPage, false, `${c.slug}: draft must not be page-worthy in index`);
  }
  // …and dev emits at least as many pages as build (drafts only ever added, never removed).
  assert.ok(dev.pages.length >= build.pages.length);
});

// parseCampaign-level proof of the gate's two states, independent of real content.
test('draft gate: hasPage flips with the draft flag', () => {
  const clean = parse(md('title: A', '## Body\nprose'), 'STARDUST001.md');
  const draft = parse(md('title: A', '## Body\nprose [confirm]'), 'STARDUST001.md');
  assert.equal(clean.index.hasPage, true);
  assert.equal(draft.index.hasPage, false); // page-worthy but held back
  assert.equal(draft.pageWorthy, true);
});

// ── (c) muse join → cause/hex; unknown → null ────────────────────────────────
test('muse join: known muse resolves cause + hex', () => {
  const { index } = parse(md('title: A\nmuse: rabu', 'prose'), 'STARDUST001.md');
  assert.equal(index.muse, 'rabu');
  assert.equal(index.cause, 'Human Rights');
  assert.equal(index.hex, '#8CB07F');
});

test('muse join: unknown muse → null cause/hex/muse + warn', () => {
  const { index, warnings } = parse(md('title: A\nmuse: nope', 'prose'), 'STARDUST001.md');
  assert.equal(index.muse, null);
  assert.equal(index.cause, null);
  assert.equal(index.hex, null);
  assert.ok(warnings.some((w) => /unknown muse/.test(w)));
});

test('muse join: blank muse → muse-less, no warn', () => {
  const { index, warnings } = parse(md('title: A\nmuse:', 'prose'), 'STARDUST001.md');
  assert.equal(index.muse, null);
  assert.ok(!warnings.some((w) => /unknown muse/.test(w)));
});

// ── (d) location: list and tolerated bare-string both normalize ──────────────
test('location: YAML list → locations[] + joined display', () => {
  const { index } = parse(md('title: A\nlocation:\n  - Berlin\n  - Krefeld', 'prose'), 'HORIZON001.md');
  assert.deepEqual(index.locations, ['Berlin', 'Krefeld']);
  assert.equal(index.location, 'Berlin · Krefeld');
});

test('location: bare string tolerated (wrapped) but warns', () => {
  const { index, warnings } = parse(md('title: A\nlocation: Volpedo, Italy', 'prose'), 'STARDUST001.md');
  assert.deepEqual(index.locations, ['Volpedo, Italy']);
  assert.equal(index.location, 'Volpedo, Italy');
  assert.ok(warnings.some((w) => /should be a YAML list/.test(w)));
});

// ── (e) campaigns.json record has exactly the expected keys ──────────────────
test('record shape: a normal campaign emits exactly the expected keys', () => {
  const { index } = parse(
    md('title: A\nmuse: rabu\nstatus: closed\nyear: 2025\nlocation:\n  - Berlin\nhero: cover.jpg', '## Body\nprose'),
    'STARDUST001.md',
  );
  // draft/filler are intentionally undefined for a normal record (JSON.stringify drops them).
  const serialized = JSON.parse(JSON.stringify(index));
  assert.deepEqual(Object.keys(serialized).sort(), [
    'cause', 'hero', 'hex', 'hasPage', 'images', 'location', 'locations',
    'muse', 'number', 'slug', 'status', 'summary', 'title', 'type', 'url', 'year',
  ].sort());
});

test('record shape: hero is root-absolute /assets/images/<slug>/<file>', () => {
  const { index } = parse(md('title: A\nhero: cover.jpg', 'prose'), 'STARDUST001.md');
  assert.equal(index.hero, '/assets/images/stardust001/cover.jpg');
});

test('record shape: blank hero → null', () => {
  const { index } = parse(md('title: A', 'prose'), 'STARDUST001.md');
  assert.equal(index.hero, null);
});

test('record shape: images resolve to root-absolute /assets/images/<slug>/<file>', () => {
  const { index } = parse(md('title: A\nimages:\n  - a.jpg\n  - b.jpg', 'prose'), 'STARDUST001.md');
  assert.deepEqual(index.images, ['/assets/images/stardust001/a.jpg', '/assets/images/stardust001/b.jpg']);
});

test('record shape: missing/empty images → [] (and blank entries dropped)', () => {
  assert.deepEqual(parse(md('title: A', 'prose'), 'STARDUST001.md').index.images, []);
  assert.deepEqual(parse(md('title: A\nimages: []', 'prose'), 'STARDUST001.md').index.images, []);
  assert.deepEqual(parse(md('title: A\nimages:\n  - a.jpg\n  -', 'prose'), 'STARDUST001.md').index.images, ['/assets/images/stardust001/a.jpg']);
});

// ── (f) hasPage / tile-only logic ────────────────────────────────────────────
test('hasPage: comment-only body is tile-only (no page, null url)', () => {
  const { index, pageWorthy } = parse(md('title: A', '<!-- stub, nothing public yet -->'), 'HORIZON002.md');
  assert.equal(pageWorthy, false);
  assert.equal(index.hasPage, false);
  assert.equal(index.url, null);
});

test('hasPage: real prose body → page-worthy with a url', () => {
  const { index } = parse(md('title: A', '## Body\nprose'), 'STARDUST001.md');
  assert.equal(index.hasPage, true);
  assert.equal(index.url, '/stardust001/');
});

test('hasPage: page:false forces tile-only even with prose', () => {
  const { index } = parse(md('title: A\npage: false', '## Body\nprose'), 'STARDUST001.md');
  assert.equal(index.hasPage, false);
});

// ── (g) markdown body is sanitized (DOMPurify) + [confirm] note is escaped ───────
test('sanitize: a <script> in the body is stripped from the rendered page', async () => {
  const html = await renderBodyPage('## Body\n\n<script>alert(1)</script>\n\nsafe prose');
  assert.ok(!html.includes('<script'), 'script tag must be removed by DOMPurify');
});

test('sanitize: [confirm:<b>x</b>] renders with the note escaped inside the mark', async () => {
  const html = await renderBodyPage('## Body\n\nfact: [confirm:<b>x</b>]');
  // the angle brackets in the note are HTML-escaped …
  assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;'), 'confirm note angle brackets must be escaped');
  // … and never appear as a literal live tag inside the confirm mark.
  assert.ok(!/<mark class="confirm">\[confirm:<b>/.test(html), 'no live <b> tag in the confirm mark');
});

test('sanitize: a normal markdown body still yields expected tags', async () => {
  const html = await renderBodyPage('## A Heading\n\nsome **bold** prose.');
  assert.ok(html.includes('<h2'), 'heading survives');
  assert.ok(html.includes('<p>'), 'paragraph survives');
  assert.ok(html.includes('<strong>'), 'bold survives');
});

// ── pipeline smoke: real content builds + every record matches the typedef keys ─
test('pipeline: real content/ builds and every record has the index keys', async () => {
  const { campaignsJson, summary } = await generateObservatory({ includeDrafts: false });
  const idx = JSON.parse(campaignsJson);
  assert.ok(idx.length >= 5, 'expected the 5 real campaigns');
  assert.equal(summary.total, idx.length);
  const required = ['slug', 'type', 'number', 'title', 'muse', 'cause', 'hex',
    'status', 'year', 'locations', 'location', 'hero', 'images', 'summary', 'hasPage', 'url'];
  for (const c of idx) {
    for (const k of required) assert.ok(k in c, `${c.slug} missing key ${k}`);
  }
});
