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
import DOMPurify from 'isomorphic-dompurify';
import { MUSES } from '../../src/data.js';
import { renderRecordPage, esc } from './record-template.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../..');
const CONTENT_DIR = path.join(ROOT, 'content/campaigns');
const TOKENS_CSS = path.join(ROOT, 'src/styles/tokens.css');
// Vite serves public/ at the domain root, so assets live under public/assets/images/
// and are referenced at runtime as root-absolute /assets/images/<slug>/<file> (D-4).
const PUBLIC_DIR = path.join(ROOT, 'public');
const ASSETS_DIR = path.join(PUBLIC_DIR, 'assets/images');

const MUSE_SLUGS = MUSES.map((m) => m.name.toLowerCase());

// ── muse join (cause from MUSES, hex from tokens.css) ───────────────────────
// Exported for tests (lets a test build the same muse map the pipeline uses).
export async function buildMuseMap() {
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

// location is authored as a YAML list (one entry per place). Normalise to a clean
// array + a " · "-joined display string. Tolerates a legacy single string (wraps it)
// so old files don't break — warned about elsewhere if we want to nudge migration.
const LOCATION_SEP = ' · ';
function normalizeLocations(value) {
  if (isBlank(value)) return { locations: [], display: null };
  const list = (Array.isArray(value) ? value : [value])
    .map((v) => (v == null ? '' : String(v).trim()))
    .filter(Boolean);
  if (!list.length) return { locations: [], display: null };
  return { locations: list, display: list.join(LOCATION_SEP) };
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

// `[confirm]` / `[confirm: note]` markers flag an unfinished record (draft gate, C1).
// Two regexes, deliberately separate:
//   • CONFIRM_RE (/g) is for the marked highlight-replacement, which iterates matches and
//     legitimately depends on the global flag (and mutates lastIndex while doing so).
//   • hasConfirmMarker() is the DETECTION path: a fresh non-global regex per call so draft
//     detection never reads or mutates shared regex state (stateless, can't drift).
const CONFIRM_RE = /\[confirm:?([^\]]*)\]/gi;
function hasConfirmMarker(text) {
  return /\[confirm:?[^\]]*\]/i.test(text);
}

// ── filename is the authority for identity ──────────────────────────────────
// Convention: TYPE + zero-padded number, e.g. STARDUST001.md, HORIZON002.md.
// From the filename we derive type, number, and slug (the URL). type/number/slug
// in frontmatter are redundant — warned about and ignored (filename always wins).
const FILENAME_RE = /^(STARDUST|HORIZON)(\d{3})\.md$/;

// → { type, number, slug } or null when the filename doesn't match the convention.
function identityFromFilename(filename) {
  const m = filename.match(FILENAME_RE);
  if (!m) return null;
  return {
    type: m[1].toLowerCase(),          // STARDUST → stardust
    number: parseInt(m[2], 10),        // "001" → 1
    slug: filename.replace(/\.md$/, '').toLowerCase(), // STARDUST001 → stardust001 (the URL)
  };
}

// ── validation (warn-only; never fails the build — D-3) ──────────────────────
// All the per-campaign checks live here so the warning surface is in one place. The
// build always completes; warnings are a to-fix checklist for the author, not a gate.
// (Drafts are the one hard gate and are handled in parseCampaign, not here.)
// `id` is identityFromFilename()'s result (null when off-pattern); `pageWorthy`/`museSlug`
// are already-derived values so this never re-derives identity.
function validateCampaign({ filename, meta, id, pageWorthy, museSlug }, warn) {
  // Off-pattern filename → identity degraded to the basename.
  if (!id) {
    warn(`${filename}: filename doesn't match TYPE+NNN (e.g. STARDUST001.md) — identity degraded.`);
  }
  // Redundant identity fields in frontmatter: filename wins, nudge to remove.
  for (const field of ['type', 'number', 'slug']) {
    if (meta[field] != null && meta[field] !== '') {
      warn(`${filename}: redundant frontmatter "${field}: ${meta[field]}" — derived from filename now, remove it.`);
    }
  }
  // Unknown muse → treated as muse-less (neutral tile).
  if (museSlug && !MUSE_SLUGS.includes(museSlug)) {
    warn(`${filename}: unknown muse "${meta.muse}" — treated as muse-less.`);
  }
  // Page-worthy record with no title.
  if (pageWorthy && isBlank(meta.title)) {
    warn(`${filename}: page-worthy but missing "title".`);
  }
  // Unknown status.
  if (!isBlank(meta.status) && !(meta.status in STATUS_ORDER)) {
    warn(`${filename}: unknown status "${meta.status}" — expected ongoing | upcoming | closed.`);
  }
  // location authored as a bare string (tolerated, wrapped) instead of a YAML list (D-5).
  if (meta.location != null && !Array.isArray(meta.location) && !isBlank(meta.location)) {
    warn(`${filename}: "location" should be a YAML list (one entry per place) — got a string.`);
  }
}

/**
 * One record in `campaigns.json` — the lean index every surface (globe / grid /
 * record pages / future ticker) consumes. Built by parseCampaign; emitted verbatim.
 * @typedef {Object} CampaignIndex
 * @property {string}   slug      Lowercased filename, also the URL path (D-1/D-2). e.g. "stardust001".
 * @property {string|null} type   "stardust" | "horizon" (from filename); null if off-pattern.
 * @property {number|null} number Parsed campaign number (from filename); null if off-pattern.
 * @property {string|null} title  Frontmatter title.
 * @property {string|null} muse   Muse slug if known, else null (unknown/blank → muse-less).
 * @property {string|null} cause  Cause derived from the muse (MUSES map); null if muse-less.
 * @property {string|null} hex    Brand hex derived from the muse (tokens.css); null if muse-less.
 * @property {string|null} status "ongoing" | "upcoming" | "closed".
 * @property {(number|string|null)} year Campaign year.
 * @property {string[]}  locations The real place list (for filter/count later); [] if none.
 * @property {string|null} location " · "-joined display string of `locations`; null if none.
 * @property {string|null} hero    Root-absolute /assets/images/<slug>/<file>; null → muse-colour placeholder.
 * @property {string|null} summary First prose paragraph, capped; null if no prose.
 * @property {boolean}   hasPage   true → a record page exists at `url`; false → tile-only.
 * @property {(true|undefined)} draft    true only when a page-worthy record is a held-back draft.
 * @property {(true|undefined)} filler   true → globe-only density tile, skipped in the accessible list.
 * @property {string|null} url     "/<slug>/" when hasPage; null otherwise.
 */

// ── parse one campaign file ─────────────────────────────────────────────────
// Exported for tests; the pipeline (generateObservatory) is the normal caller.
export function parseCampaign(raw, filename, museMap, warn) {
  const { data: fm, content: body } = matter(raw);
  const meta = normalize(fm);

  // Identity comes from the filename, never frontmatter. A non-matching filename
  // still parses (warn, don't fail) by falling back to the basename as the slug.
  const id = identityFromFilename(filename);
  const type = id ? id.type : (meta.type || null);
  const number = id ? id.number : (typeof meta.number === 'number' ? meta.number : null);
  const slug = id ? id.slug : filename.replace(/\.md$/, '').toLowerCase();

  const museSlug = meta.muse ? String(meta.muse).toLowerCase() : null;
  const joined = museSlug && MUSE_SLUGS.includes(museSlug) ? museMap[museSlug] : null;

  const pageWorthy = meta.page !== false && hasRealBody(body);
  // C1: a record carrying unresolved [confirm] markers is a DRAFT — previewable
  // in dev, but never written to dist and never linked from the index.
  const draft = meta.draft === true || hasConfirmMarker(raw);

  const hasPage = pageWorthy && !draft;

  // All per-campaign warnings funnel through one place (warn-only — D-3).
  validateCampaign({ filename, meta, id, pageWorthy, museSlug }, warn);

  const { locations, display: locationDisplay } = normalizeLocations(meta.location);

  /** @type {CampaignIndex} — the lean subset every surface needs. */
  const index = {
    slug,
    type,
    number,
    title: meta.title || null,
    muse: museSlug && MUSE_SLUGS.includes(museSlug) ? museSlug : null,
    cause: joined ? joined.cause : null,
    hex: joined ? joined.hex : null,
    status: meta.status || null,
    year: isBlank(meta.year) ? null : meta.year,
    // locations = the real list (filter/count later); location = " · "-joined display
    // string so views drop it in directly without re-implementing the join.
    locations,
    location: locationDisplay,
    // hero: a bare filename, resolved into the campaign's own folder (named the slug).
    // Emitted root-absolute (/assets/images/<slug>/<hero>) — public/ is served at the
    // domain root by Vite, matching how logowhite.png/muse symbols are referenced (D-4).
    hero: isBlank(meta.hero) ? null : `/assets/images/${slug}/${meta.hero}`,
    summary: summarize(body),
    hasPage,
    draft: pageWorthy && draft ? true : undefined,
    // filler: a globe-only density tile (the homepage gave extra footage to "fill the globe").
    // Shown as a globe tile, but skipped in the accessible list (observatory.js renderList) so the
    // archive's source-of-truth list stays honest. Always tile-only (no body → no record page).
    filler: meta.filler === true ? true : undefined,
    url: hasPage ? `/${slug}/` : null,
  };

  return { filename, slug, meta, body, pageWorthy, draft, joined, index };
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
 * @param {{ includeDrafts?: boolean, base?: string }} opts  includeDrafts=true (dev) emits
 *        draft record pages for preview; false (build) skips them. base is Vite's base path
 *        ('/' dev, '/museobservatory/' on the Pages subpath build) for record-page links.
 * @returns {{ campaignsJson: string, pages: {slug,html}[], summary: object }}
 */
export async function generateObservatory({ includeDrafts = false, base = '/' } = {}) {
  const museMap = await buildMuseMap();
  const files = (await fs.readdir(CONTENT_DIR))
    .filter((f) => f.endsWith('.md') && f !== 'TEMPLATE.md')
    .sort();

  const warnings = [];
  const warn = (msg) => warnings.push(msg);

  const parsed = [];
  for (const file of files) {
    const raw = await fs.readFile(path.join(CONTENT_DIR, file), 'utf8');
    parsed.push(parseCampaign(raw, file, museMap, warn));
  }

  // Cross-campaign + filesystem checks (warn-only — D-3). Per-file checks already
  // ran in validateCampaign(); these need the whole set or disk access.

  // Duplicate-slug guard: two files producing the same slug would collide in the
  // index + on disk (one record page overwrites the other) — silent data loss.
  const seen = new Map();
  for (const p of parsed) {
    if (seen.has(p.slug)) {
      warn(`${p.slug}: duplicate slug — "${p.filename}" and "${seen.get(p.slug)}" both resolve to /${p.slug}/.`);
    } else {
      seen.set(p.slug, p.filename);
    }
  }

  // Hero existence check: a set hero pointing at a missing file would render a
  // broken <img> at runtime with no other signal. Resolved under public/assets/images/
  // <slug>/ (D-4) — the same folder the emitted /assets/images/<slug>/<file> URL maps to.
  for (const p of parsed) {
    if (isBlank(p.meta.hero)) continue;
    const rel = `${p.slug}/${p.meta.hero}`;
    try {
      await fs.access(path.join(ASSETS_DIR, rel));
    } catch {
      warn(`${p.slug}: hero "${p.meta.hero}" not found at public/assets/images/${rel}.`);
    }
  }

  if (warnings.length) {
    console.warn(`\n[observatory] ${warnings.length} warning(s):`);
    for (const w of warnings) console.warn(`  • ${w}`);
  }

  const index = parsed.map((p) => p.index).sort(sortCampaigns);
  const campaignsJson = JSON.stringify(index, null, 2);

  // Record pages: page-worthy, and (in dev) drafts too.
  const pages = [];
  for (const p of parsed) {
    if (!p.pageWorthy) continue;
    if (p.draft && !includeDrafts) continue;
    // Sanitize the markdown-rendered HTML (build-time, never shipped) so an authored
    // body can't smuggle <script>/onclick/etc. into a static record page. DOMPurify's
    // default profile already allows standard marked output (p, a, h1-6, lists, code,
    // blockquote, …). THEN inject the [confirm] highlight with the note text ESCAPED.
    const bodyHtml = DOMPurify.sanitize(String(marked.parse(p.body)))
      .replace(CONFIRM_RE, (_, t) => `<mark class="confirm">[confirm:${esc(t)}]</mark>`);
    pages.push({ slug: p.slug, html: renderRecordPage({ meta: p.meta, joined: p.joined, bodyHtml, draft: p.draft, base }) });
  }

  const summary = {
    total: parsed.length,
    pages: pages.length,
    drafts: parsed.filter((p) => p.pageWorthy && p.draft).length,
    tileOnly: parsed.filter((p) => !p.pageWorthy).length,
  };
  return { campaignsJson, pages, summary };
}
