// Muse Observatory — build-time content pipeline (Phase 1).
//
// One source of truth: content/campaigns/*.md  →
//   • campaigns.json        (index for the globe / filters / homepage ticker)
//   • observatory/<slug>/    (one static record page per *page-worthy* campaign)
//
// Markdown is parsed HERE, at build time — the parser is NEVER shipped to the
// client (pre-rendered static HTML). gray-matter + marked are devDeps only.
//
// Muse → cause is joined from MUSES (src/data.js, single source for the cause).
// Muse → hex  is resolved from tokens.css (single source for the 7 brand hexes;
// MUSES itself only carries CSS-var references, not literal hexes).

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { marked } from 'marked';
import { MUSES } from '../../src/data.js';
import { renderRecordPage } from './record-template.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../..');
const CONTENT_DIR = path.join(ROOT, 'content/campaigns');
const TOKENS_CSS = path.join(ROOT, 'src/styles/tokens.css');

const MUSE_SLUGS = MUSES.map((m) => m.name.toLowerCase());

// ── muse join (cause from MUSES, hex from tokens.css) ───────────────────────
async function buildMuseMap() {
  const css = await fs.readFile(TOKENS_CSS, 'utf8');
  const map = {};
  for (const muse of MUSES) {
    const slug = muse.name.toLowerCase();
    const m = css.match(new RegExp(`--${slug}:\\s*(#[0-9a-fA-F]{3,8})`));
    map[slug] = { cause: muse.cause, hex: m ? m[1] : null };
  }
  return map;
}

// ── frontmatter normalisation ───────────────────────────────────────────────
// js-yaml turns `date: 2025-12-11` into a Date; coerce it back to YYYY-MM-DD so
// the JSON is stable + human-readable. Walks nested maps (transferred, event …).
function normalize(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalize(v)]));
  }
  return value;
}

// Empty-ish? (blank string, null, or an object/array whose values are all empty)
function isBlank(v) {
  if (v == null || v === '') return true;
  if (Array.isArray(v)) return v.every(isBlank);
  if (typeof v === 'object') return Object.values(v).every(isBlank);
  return false;
}

// A body counts as "real content" once the HTML comments are stripped and
// something remains (the upcoming stubs are comment-only → tile-only).
function hasRealBody(markdownBody) {
  return markdownBody.replace(/<!--[\s\S]*?-->/g, '').trim().length > 0;
}

// First real prose paragraph → a short plain-text summary for the globe flip-card
// (capped to a clean length at a word boundary). Skips comments + headings.
function summarize(markdownBody, maxLen = 220) {
  const stripped = markdownBody.replace(/<!--[\s\S]*?-->/g, '');
  for (const block of stripped.split(/\n\s*\n/)) {
    const t = block.trim();
    if (!t || t.startsWith('#') || t.startsWith('<')) continue;
    const plain = t
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links → text
      .replace(/[*_`>]/g, '')                  // emphasis/quote marks
      .replace(/\s+/g, ' ')
      .trim();
    if (!plain) continue;
    if (plain.length <= maxLen) return plain;
    return `${plain.slice(0, maxLen).replace(/\s+\S*$/, '')}…`;
  }
  return null;
}

const CONFIRM_RE = /\[confirm:?([^\]]*)\]/gi;

// ── parse one campaign file ─────────────────────────────────────────────────
function parseCampaign(raw, filename, museMap) {
  const { data: fm, content: body } = matter(raw);
  const meta = normalize(fm);

  const museSlug = meta.muse ? String(meta.muse).toLowerCase() : null;
  if (museSlug && !MUSE_SLUGS.includes(museSlug)) {
    console.warn(`[observatory] ${filename}: unknown muse "${meta.muse}" — treated as muse-less.`);
  }
  const joined = museSlug && MUSE_SLUGS.includes(museSlug) ? museMap[museSlug] : null;

  const pageWorthy = meta.page !== false && hasRealBody(body);
  // C1: a record carrying unresolved [confirm] markers is a DRAFT — previewable
  // in dev, but never written to dist and never linked from the index.
  const draft = meta.draft === true || CONFIRM_RE.test(raw);
  CONFIRM_RE.lastIndex = 0;

  const slug = meta.slug || filename.replace(/\.md$/, '');
  const hasPage = pageWorthy && !draft;

  // Index record (campaigns.json) — the lean subset every surface needs.
  const index = {
    slug,
    type: meta.type || null,
    number: typeof meta.number === 'number' ? meta.number : null,
    title: meta.title || null,
    muse: museSlug && MUSE_SLUGS.includes(museSlug) ? museSlug : null,
    cause: joined ? joined.cause : null,
    hex: joined ? joined.hex : null,
    status: meta.status || null,
    year: isBlank(meta.year) ? null : meta.year,
    location: isBlank(meta.location) ? null : meta.location,
    // hero: a bare filename resolves under assets/images/campaigns/; a value containing a
    // "/" is treated as a path under assets/images/ (so footage can live in its own folder,
    // e.g. comet-collabs/campaign-footage/Horizon001/DJI_0537-1024x768.jpg).
    hero: isBlank(meta.hero)
      ? null
      : (meta.hero.includes('/') ? `assets/images/${meta.hero}` : `assets/images/campaigns/${meta.hero}`),
    summary: summarize(body),
    hasPage,
    draft: pageWorthy && draft ? true : undefined,
    // filler: a globe-only density tile (the homepage gave extra footage to "fill the globe").
    // Shown as a globe tile, but skipped in the accessible list (observatory.js renderList) so the
    // archive's source-of-truth list stays honest. Always tile-only (no body → no record page).
    filler: meta.filler === true ? true : undefined,
    url: hasPage ? `/${slug}/` : null,
  };

  return { slug, meta, body, pageWorthy, draft, joined, index };
}

// Sort: ongoing → upcoming → closed, then type, then number.
const STATUS_ORDER = { ongoing: 0, upcoming: 1, closed: 2 };
function sortCampaigns(a, b) {
  const s = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
  if (s) return s;
  if (a.type !== b.type) return String(a.type).localeCompare(String(b.type));
  return (a.number ?? 99) - (b.number ?? 99);
}

/**
 * Generate the observatory artifacts in memory.
 * @param {{ includeDrafts?: boolean }} opts  includeDrafts=true (dev) emits draft
 *        record pages for preview; false (build) skips them so they stay unpublished.
 * @returns {{ campaignsJson: string, pages: {slug,html}[], summary: object }}
 */
export async function generateObservatory({ includeDrafts = false } = {}) {
  const museMap = await buildMuseMap();
  const files = (await fs.readdir(CONTENT_DIR))
    .filter((f) => f.endsWith('.md') && f !== 'TEMPLATE.md')
    .sort();

  const parsed = [];
  for (const file of files) {
    const raw = await fs.readFile(path.join(CONTENT_DIR, file), 'utf8');
    parsed.push(parseCampaign(raw, file, museMap));
  }

  const index = parsed.map((p) => p.index).sort(sortCampaigns);
  const campaignsJson = JSON.stringify(index, null, 2);

  // Record pages: page-worthy, and (in dev) drafts too.
  const pages = [];
  for (const p of parsed) {
    if (!p.pageWorthy) continue;
    if (p.draft && !includeDrafts) continue;
    const bodyHtml = String(marked.parse(p.body))
      .replace(CONFIRM_RE, (_, t) => `<mark class="confirm">[confirm:${t}]</mark>`);
    pages.push({ slug: p.slug, html: renderRecordPage({ meta: p.meta, joined: p.joined, bodyHtml, draft: p.draft }) });
  }

  const summary = {
    total: parsed.length,
    pages: pages.length,
    drafts: parsed.filter((p) => p.pageWorthy && p.draft).length,
    tileOnly: parsed.filter((p) => !p.pageWorthy).length,
  };
  return { campaignsJson, pages, summary };
}
