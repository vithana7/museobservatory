// Muse Observatory — selection layer (layer 3). Pure logic, no DOM, no WebGL.
//
// Turns the full campaigns.json index into the bounded subset the views consume:
//   • sample()          — session-stable random landing subset (seeded shuffle).
//   • filterCampaigns() — the TRUE ANDed matching set (never a re-sample).
//   • applySparseGuard() — detects too-few-matches; fallback policy still open (A-4).
//
// Array-in / array-out only — testable in node:test exactly like build.mjs, with no
// device or browser. The single impure touch (sessionStorage for the seed) is isolated
// in makeSeed() so the rest stays pure. Consumed LATER by the globe/grid via Globe
// .setItems(subset) and renderList(subset) — wiring is a separate milestone, NOT here.
//
// Records are CampaignIndex objects (see build.mjs typedef): { slug, type, number,
// title, muse, cause, hex, status, year, locations[], location, hero, summary,
// hasPage, url }.

/**
 * The globe is a fixed 42-vertex icosahedron. Muses no longer ride the globe (they live in
 * the filter instead, decision S-1 revised 2026-06-22), so all 42 vertices hold campaigns.
 * @type {number}
 */
export const CAMPAIGN_CAP = 42;

const SEED_KEY = 'mo.seed';

/**
 * Derive the per-session seed (ONCE per session). Reads/writes sessionStorage so the
 * landing sample stays stable across re-renders within a visit and is fresh next visit.
 * Guarded: if sessionStorage is unavailable (e.g. Node, private mode), returns a fresh
 * random integer instead of throwing — keeping this module testable. This is the only
 * impure function in the module.
 * @returns {number} A 32-bit-ish positive integer seed.
 */
export function makeSeed() {
  const fresh = () => Math.floor(Math.random() * 0xffffffff) >>> 0;
  try {
    const store = typeof sessionStorage !== 'undefined' ? sessionStorage : null;
    if (!store) return fresh();
    const existing = store.getItem(SEED_KEY);
    if (existing != null && existing !== '') {
      const n = Number(existing);
      if (Number.isFinite(n)) return n >>> 0;
    }
    const seed = fresh();
    store.setItem(SEED_KEY, String(seed));
    return seed;
  } catch {
    // sessionStorage can throw (disabled cookies, sandboxed iframe) — degrade to random.
    return fresh();
  }
}

/**
 * mulberry32 — a tiny deterministic PRNG. Same seed → same sequence. Inline, no deps.
 * @param {number} seed 32-bit seed.
 * @returns {() => number} Generator returning floats in [0, 1).
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A session-stable random subset of up to `n` campaigns, chosen by a SEEDED shuffle:
 * the same (campaigns, seed) always yields the same items in the same order. Does NOT
 * mutate the input. If there are `<= n` campaigns, returns a seeded-shuffled copy of all
 * of them (still deterministic). This is the INITIAL unfiltered landing state only —
 * filtering uses filterCampaigns(), which returns the true set, not a re-sample.
 * @param {object[]} campaigns The full campaign list.
 * @param {number} [n=CAMPAIGN_CAP] Max items to return; clamped to >= 0.
 * @param {number} [seed] PRNG seed (use makeSeed()); defaults to 0 for a stable order.
 * @returns {object[]} A new array of up to `n` campaigns.
 */
export function sample(campaigns, n = CAMPAIGN_CAP, seed = 0) {
  const list = Array.isArray(campaigns) ? campaigns.slice() : [];
  const cap = Math.max(0, Math.floor(n));
  // Fisher–Yates driven by the seeded PRNG → deterministic for a given (list, seed).
  const rand = mulberry32(seed >>> 0);
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
  }
  return list.slice(0, cap);
}

/**
 * Exact case-insensitive string equality on a record field.
 * @param {*} value
 * @param {string} want
 * @returns {boolean}
 */
function eqInsensitive(value, want) {
  return value != null && String(value).toLowerCase() === want;
}

/**
 * Every geo string a record exposes, in one flat array. Today that's the `locations[]`
 * list plus the joined `location` display string. When structured geo (A-1) lands —
 * `{ city, region, country }` per place — those fields fold in here too, so the geo
 * matcher automatically searches them with no caller change.
 * @param {object} c A campaign record.
 * @returns {string[]} All non-empty geo strings for the record.
 */
function geoFields(c) {
  const out = [];
  if (Array.isArray(c.locations)) out.push(...c.locations);
  if (c.location) out.push(c.location);
  // A-1 (not built yet): structured per-place facets fold in here when present.
  for (const place of Array.isArray(c.locations) ? c.locations : []) {
    if (place && typeof place === 'object') out.push(place.city, place.region, place.country, place.display);
  }
  return out.filter((s) => s != null && s !== '').map(String);
}

/**
 * Compile a user geo query into a case-insensitive matcher. The query is treated as a
 * REGEX pattern; if it isn't valid regex (e.g. a half-typed `(`), we fall back to a
 * literal substring match so the filter never throws on intermediate keystrokes.
 * @param {string} query
 * @returns {(s: string) => boolean}
 */
function geoMatcher(query) {
  const q = String(query).trim();
  try {
    const re = new RegExp(q, 'i');
    return (s) => re.test(s);
  } catch {
    const lit = q.toLowerCase();
    return (s) => s.toLowerCase().includes(lit);
  }
}

/**
 * The campaigns matching ALL provided facets (ANDed). An absent/empty/null facet is
 * ignored (does not constrain); an empty options object returns everything. `muse`,
 * `type` and `status` are exact case-insensitive matches on the record field. `geo` is a
 * case-insensitive REGEX (substring fallback) tested against ANY of the record's geo
 * fields (`locations[]` + `location`, plus structured city/region/country when A-1 lands).
 * A record with no geo strings never matches a non-empty geo. Returns a NEW array with
 * input order preserved, and is NOT capped here — capping is the caller's job (feed the
 * result through sample() or slice to CAMPAIGN_CAP for the globe). Pure.
 * @param {object[]} campaigns The full campaign list.
 * @param {{muse?:string, type?:string, geo?:string, status?:string}} [facets]
 * @returns {object[]} New filtered array, uncapped, original order.
 */
export function filterCampaigns(campaigns, { muse, type, geo, status } = {}) {
  const list = Array.isArray(campaigns) ? campaigns : [];
  const wantMuse = muse ? String(muse).toLowerCase() : null;
  const wantType = type ? String(type).toLowerCase() : null;
  const wantStatus = status ? String(status).toLowerCase() : null;
  const geoQuery = geo != null && String(geo).trim() !== '' ? String(geo) : null;
  const matchGeo = geoQuery ? geoMatcher(geoQuery) : null;

  return list.filter((c) => {
    if (wantMuse && !eqInsensitive(c.muse, wantMuse)) return false;
    if (wantType && !eqInsensitive(c.type, wantType)) return false;
    if (wantStatus && !eqInsensitive(c.status, wantStatus)) return false;
    if (matchGeo && !geoFields(c).some(matchGeo)) return false;
    return true;
  });
}

/**
 * Sparse-set detection for the A-4 guard. Below `threshold` matches the globe repeats
 * tiles and looks broken, so callers need to know. ONLY the detection lives here for now;
 * the FALLBACK BEHAVIOUR (show the grid instead, or pad with muse anchors) is an open
 * question tracked in docs/questions.md (A-4). Wrapping it behind this one function lets
 * the policy be finalised later without touching any caller.
 * @param {object[]} matches The (already filtered) match set.
 * @param {number} [threshold=6] Below this count is considered sparse.
 * @returns {{items: object[], sparse: boolean, threshold: number}}
 */
export function applySparseGuard(matches, threshold = 6) {
  const items = Array.isArray(matches) ? matches : [];
  return { items, sparse: items.length < threshold, threshold };
}
