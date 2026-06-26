// Muse Observatory — selection layer tests (node:test, no deps).
//   node --test src/observatory/selection.test.mjs   (or npm test)
//
// The layer-3 analogue of build.test.mjs: pure array-in/array-out logic, driven by tiny
// inline CampaignIndex-shaped fixtures so we never depend on real content/.
//
// Surfaces under test:
//   • sample()          — seeded shuffle: stability, cap, no-mutation, no-loss.
//   • filterCampaigns() — ANDed facets, geo regex over all geo fields, no-mutation.
//   • applySparseGuard() — threshold detection + pass-through items.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMPAIGN_CAP,
  sample,
  filterCampaigns,
  applySparseGuard,
  expandToLeaves,
  arrangeOnGraph,
  GLOBE_LEAVES_PER_CAMPAIGN,
} from './selection.js';
import { IcosahedronGeometry } from './globe-geometry.js';

// The REAL globe adjacency (42-vertex spherised icosahedron) so the arrangement is tested
// against the graph it actually runs on, not a toy.
function icoAdjacency() {
  const ico = new IcosahedronGeometry();
  ico.subdivide(1).spherize(2);
  const adj = Array.from({ length: ico.vertices.length }, () => new Set());
  for (const f of ico.faces) {
    adj[f.a].add(f.b); adj[f.a].add(f.c);
    adj[f.b].add(f.a); adj[f.b].add(f.c);
    adj[f.c].add(f.a); adj[f.c].add(f.b);
  }
  return { adj, count: ico.vertices.length };
}
function edges(adj) {
  const e = [];
  for (let v = 0; v < adj.length; v++) for (const nb of adj[v]) if (v < nb) e.push([v, nb]);
  return e;
}

// Minimal-but-realistic CampaignIndex fixtures (muse/type/status/locations populated).
// `location` is the build's joined display of `locations[]` — mirror that here so the
// geo matcher (which searches BOTH) sees consistent data, exactly like real campaigns.json.
function rec(slug, over = {}) {
  const base = {
    slug,
    type: 'stardust',
    number: 1,
    title: slug,
    muse: 'rabu',
    cause: 'Human Rights',
    hex: '#8CB07F',
    status: 'closed',
    year: 2025,
    locations: ['Berlin'],
    hero: null,
    summary: null,
    hasPage: true,
    url: `/${slug}/`,
    ...over,
  };
  base.location = (base.locations || []).join(' · ');
  return base;
}

const FIXTURES = [
  rec('a', { muse: 'rabu', type: 'stardust', status: 'closed', locations: ['Berlin', 'Germany'] }),
  rec('b', { muse: 'volpe', type: 'horizon', status: 'ongoing', locations: ['Volpedo, Italy'] }),
  rec('c', { muse: 'rabu', type: 'horizon', status: 'upcoming', locations: ['Krefeld'] }),
  rec('d', { muse: 'volpe', type: 'stardust', status: 'closed', locations: [] }),
  rec('e', { muse: 'rabu', type: 'stardust', status: 'ongoing', locations: ['BERLIN'] }),
];

const slugs = (arr) => arr.map((c) => c.slug);

// ── the pinned cap ────────────────────────────────────────────────────────────
test('cap: CAMPAIGN_CAP is 42 (full icosahedron — muses left the globe)', () => {
  assert.equal(CAMPAIGN_CAP, 42);
});

// ── sample: seed stability ──────────────────────────────────────────────────────
test('sample: same (campaigns, seed) → identical items in identical order', () => {
  const one = sample(FIXTURES, 5, 12345);
  const two = sample(FIXTURES, 5, 12345);
  assert.deepEqual(slugs(one), slugs(two));
});

test('sample: different seeds generally differ', () => {
  // Across a spread of seeds at least one ordering must differ from seed 1.
  const base = slugs(sample(FIXTURES, 5, 1));
  const differs = [2, 3, 7, 99, 4242].some(
    (s) => JSON.stringify(slugs(sample(FIXTURES, 5, s))) !== JSON.stringify(base),
  );
  assert.ok(differs, 'expected at least one different seed to reorder');
});

// ── sample: cap enforcement + no loss ────────────────────────────────────────────
test('sample: never returns more than n', () => {
  assert.equal(sample(FIXTURES, 3, 1).length, 3);
  assert.equal(sample(FIXTURES, 0, 1).length, 0);
});

test('sample: fewer campaigns than n → all returned, no dupes, no loss', () => {
  const out = sample(FIXTURES, 100, 7);
  assert.equal(out.length, FIXTURES.length);
  assert.deepEqual(slugs(out).sort(), slugs(FIXTURES).sort()); // same set, possibly reordered
  assert.equal(new Set(slugs(out)).size, out.length); // no dupes
});

test('sample: negative/fractional n clamps to a valid count', () => {
  assert.equal(sample(FIXTURES, -5, 1).length, 0);
  assert.equal(sample(FIXTURES, 2.9, 1).length, 2);
});

// ── sample: purity ───────────────────────────────────────────────────────────────
test('sample: does not mutate its input array', () => {
  const input = FIXTURES.slice();
  const before = slugs(input);
  sample(input, 3, 999);
  assert.deepEqual(slugs(input), before);
});

// ── filter: AND-logic across facets ──────────────────────────────────────────────
test('filter: empty options returns all (new array, order preserved)', () => {
  const out = filterCampaigns(FIXTURES, {});
  assert.deepEqual(slugs(out), slugs(FIXTURES));
  assert.notEqual(out, FIXTURES); // new array
});

test('filter: muse alone (case-insensitive exact)', () => {
  assert.deepEqual(slugs(filterCampaigns(FIXTURES, { muse: 'RABU' })), ['a', 'c', 'e']);
});

test('filter: type alone', () => {
  assert.deepEqual(slugs(filterCampaigns(FIXTURES, { type: 'horizon' })), ['b', 'c']);
});

test('filter: status alone', () => {
  assert.deepEqual(slugs(filterCampaigns(FIXTURES, { status: 'ongoing' })), ['b', 'e']);
});

test('filter: two facets combined are ANDed', () => {
  assert.deepEqual(slugs(filterCampaigns(FIXTURES, { muse: 'rabu', type: 'stardust' })), ['a', 'e']);
});

test('filter: an absent/empty facet does not constrain', () => {
  // muse set, geo empty-string → geo ignored, same as muse alone.
  assert.deepEqual(
    slugs(filterCampaigns(FIXTURES, { muse: 'rabu', geo: '' })),
    slugs(filterCampaigns(FIXTURES, { muse: 'rabu' })),
  );
});

// ── filter: geo is a case-insensitive REGEX over all geo fields ───────────────────
test('filter: geo is a case-insensitive regex against any geo field', () => {
  // "berlin" matches 'Berlin' (a) and 'BERLIN' (e); 'volp' matches Volpedo (b).
  assert.deepEqual(slugs(filterCampaigns(FIXTURES, { geo: 'berlin' })), ['a', 'e']);
  assert.deepEqual(slugs(filterCampaigns(FIXTURES, { geo: 'VOLP' })), ['b']);
});

test('filter: geo regex alternation matches multiple places', () => {
  // 'berlin|krefeld' → a, c, e (regex OR across fields).
  assert.deepEqual(slugs(filterCampaigns(FIXTURES, { geo: 'berlin|krefeld' })), ['a', 'c', 'e']);
});

test('filter: an invalid regex falls back to literal substring (never throws)', () => {
  // a half-typed '(' is not valid regex — must degrade to substring, not throw.
  assert.doesNotThrow(() => filterCampaigns(FIXTURES, { geo: 'berlin(' }));
  // literal '(' appears in no field → no matches, rather than an exception.
  assert.deepEqual(filterCampaigns(FIXTURES, { geo: 'berlin(' }), []);
});

test('filter: a record with empty locations never matches a non-empty geo', () => {
  // 'd' has locations: [] — must be excluded by any geo.
  assert.ok(!slugs(filterCampaigns(FIXTURES, { geo: 'berlin' })).includes('d'));
  assert.ok(!slugs(filterCampaigns(FIXTURES, { geo: 'anything' })).includes('d'));
});

// ── filter: empty / single result ────────────────────────────────────────────────
test('filter: no match → empty array', () => {
  assert.deepEqual(filterCampaigns(FIXTURES, { muse: 'nobody' }), []);
});

test('filter: single match', () => {
  assert.deepEqual(slugs(filterCampaigns(FIXTURES, { geo: 'krefeld' })), ['c']);
});

// ── filter: purity ───────────────────────────────────────────────────────────────
test('filter: does not mutate its input array', () => {
  const input = FIXTURES.slice();
  const before = slugs(input);
  filterCampaigns(input, { muse: 'rabu', geo: 'berlin' });
  assert.deepEqual(slugs(input), before);
});

// ── sparse guard ─────────────────────────────────────────────────────────────────
test('sparse guard: below threshold → sparse:true, items pass through', () => {
  const matches = FIXTURES.slice(0, 3); // 3 < 6
  const out = applySparseGuard(matches);
  assert.equal(out.sparse, true);
  assert.equal(out.threshold, 6);
  assert.equal(out.items, matches);
});

test('sparse guard: at threshold → sparse:false', () => {
  const six = [rec('1'), rec('2'), rec('3'), rec('4'), rec('5'), rec('6')];
  assert.equal(applySparseGuard(six).sparse, false);
});

test('sparse guard: above threshold → sparse:false', () => {
  const seven = Array.from({ length: 7 }, (_, i) => rec(`x${i}`));
  assert.equal(applySparseGuard(seven).sparse, false);
});

test('sparse guard: custom threshold is honoured and returned', () => {
  const out = applySparseGuard(FIXTURES.slice(0, 2), 3); // 2 < 3
  assert.equal(out.sparse, true);
  assert.equal(out.threshold, 3);
});

// ── expandToLeaves() — campaigns → per-photo globe leaves (Memo's "leaves & root") ──
test('leaves: one leaf per photo (hero + images), hero first, all keep the campaign url', () => {
  const c = { slug: 's1', url: '/s1/', hero: '/h.jpg', images: ['/a.jpg', '/b.jpg'] };
  const leaves = expandToLeaves([c]);
  assert.equal(leaves.length, 3);
  assert.deepEqual(leaves.map((l) => l.hero), ['/h.jpg', '/a.jpg', '/b.jpg']);
  assert.ok(leaves.every((l) => l.url === '/s1/' && l.slug === 's1'), 'every leaf links to the same root');
});

test('leaves: a campaign with no photo still yields ONE placeholder leaf (hero:null)', () => {
  const leaves = expandToLeaves([{ slug: 's1', url: '/s1/', hero: null, images: [] }]);
  assert.equal(leaves.length, 1);
  assert.equal(leaves[0].hero, null);
});

test('leaves: hero duplicated in images is de-duped', () => {
  const leaves = expandToLeaves([{ slug: 's1', hero: '/h.jpg', images: ['/h.jpg', '/a.jpg'] }]);
  assert.deepEqual(leaves.map((l) => l.hero), ['/h.jpg', '/a.jpg']);
});

test('leaves: emitted ROUND-ROBIN so each campaign contributes before any repeats', () => {
  const a = { slug: 'a', hero: '/a1', images: ['/a2', '/a3'] };
  const b = { slug: 'b', hero: '/b1', images: [] };
  // round 0: a1, b1 ; round 1: a2 ; round 2: a3
  const leaves = expandToLeaves([a, b]);
  assert.deepEqual(leaves.map((l) => `${l.slug}:${l.hero}`), ['a:/a1', 'b:/b1', 'a:/a2', 'a:/a3']);
});

test('leaves: capped to `cap`, never exceeding it', () => {
  const a = { slug: 'a', hero: '/a1', images: ['/a2', '/a3', '/a4'] };
  assert.equal(expandToLeaves([a], 2).length, 2);
  assert.equal(expandToLeaves([a, a, a], CAMPAIGN_CAP).length <= CAMPAIGN_CAP, true);
});

test('leaves: per-campaign cap stops one photo-heavy campaign dominating', () => {
  const big = { slug: 'big', url: '/big/', hero: '/b0', images: Array.from({ length: 20 }, (_, i) => `/b${i + 1}`) };
  const small = { slug: 'sm', url: '/sm/', hero: '/s0', images: ['/s1'] };
  const leaves = expandToLeaves([big, small]); // default per-campaign cap
  const bigCount = leaves.filter((l) => l.slug === 'big').length;
  const smallCount = leaves.filter((l) => l.slug === 'sm').length;
  assert.equal(bigCount, GLOBE_LEAVES_PER_CAMPAIGN, 'big campaign capped to the per-campaign limit');
  assert.equal(smallCount, 2, 'small campaign keeps its full (sub-cap) set');
  // the cap uses the hero + the first (cap−1) gallery photos, hero included
  assert.ok(leaves.some((l) => l.slug === 'big' && l.hero === '/b0'), 'hero leaf is kept');
});

test('leaves: per-campaign cap is overridable', () => {
  const big = { slug: 'big', hero: '/b0', images: Array.from({ length: 20 }, (_, i) => `/b${i + 1}`) };
  assert.equal(expandToLeaves([big], 42, 3).filter((l) => l.slug === 'big').length, 3);
});

test('leaves: does not mutate input campaigns', () => {
  const c = { slug: 's1', hero: '/h.jpg', images: ['/a.jpg'] };
  const snapshot = JSON.stringify(c);
  expandToLeaves([c]);
  assert.equal(JSON.stringify(c), snapshot);
});

// ── arrangeOnGraph() — no "same background next to each other" on the globe ──────────
test('arrange: fills every vertex (length === count, no holes)', () => {
  const { adj, count } = icoAdjacency();
  const pool = expandToLeaves([{ slug: 'a', url: '/a/', hero: '/a1', images: ['/a2', '/a3'] }]);
  const out = arrangeOnGraph(pool, adj, count);
  assert.equal(out.length, count);
  assert.ok(out.every((x) => x != null), 'no empty vertices');
});

test('arrange: NO two adjacent vertices share the same photo (realistic pool)', () => {
  const { adj, count } = icoAdjacency();
  // a realistic spread: a dominant campaign + several smaller ones (mirrors the real archive)
  const campaigns = [
    { slug: 'h1', url: '/h1/', hex: '#D48348', hero: '/h1/0', images: Array.from({ length: 14 }, (_, i) => `/h1/${i + 1}`) },
    { slug: 's1', url: '/s1/', hex: '#8CB07F', hero: '/s1/0', images: Array.from({ length: 8 }, (_, i) => `/s1/${i + 1}`) },
    { slug: 's2', url: '/s2/', hex: '#D48348', hero: '/s2/0', images: ['/s2/1', '/s2/2'] },
    { slug: 's3', url: '/s3/', hex: '#7F49A2', hero: '/s3/0', images: [] },
  ];
  const out = arrangeOnGraph(expandToLeaves(campaigns, 42), adj, count);
  let clashes = 0;
  for (const [u, v] of edges(adj)) {
    if (out[u].hero && out[v].hero && out[u].hero === out[v].hero) clashes++;
  }
  assert.equal(clashes, 0, 'no edge connects two identical photos');
});

test('arrange: empty pool → [], single-photo pool fills without throwing', () => {
  const { adj, count } = icoAdjacency();
  assert.deepEqual(arrangeOnGraph([], adj, count), []);
  const one = arrangeOnGraph([{ slug: 'x', url: '/x/', hero: '/x/0' }], adj, count);
  assert.equal(one.length, count);
});
