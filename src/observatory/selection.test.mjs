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
} from './selection.js';

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
