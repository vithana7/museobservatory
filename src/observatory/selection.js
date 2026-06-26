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

/**
 * Max globe "leaves" (circles) any ONE campaign contributes, so a photo-heavy campaign doesn't
 * dominate the sphere (Memo: horizon001's 21 photos filled ~half the globe). The campaign's FULL
 * photo set still appears on its record page — this caps the GLOBE only. The hero + first
 * (cap−1) gallery photos are used (round-robin from photos[0]). @type {number}
 */
export const GLOBE_LEAVES_PER_CAMPAIGN = 8;

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
 * Expand campaigns into globe "leaves" — one tile per PHOTO, so the duplicate circles a
 * campaign occupies (the globe has 42 vertices but few campaigns, so each repeats) each show
 * a DIFFERENT photo while all link back to the same campaign page. Memo's "leaves & root":
 * many leaves (varied circles) → one root (the record page with the full gallery).
 *
 * Each campaign's photo list is [hero, ...images] (deduped, hero first); a campaign with no
 * photo still yields ONE placeholder leaf (hero:null → muse-colour disc) so it stays on the
 * globe. Leaves are emitted ROUND-ROBIN across campaigns (one photo each per round) so the cap
 * draws variety from every campaign before exhausting any one, and a campaign's own leaves are
 * spread through the array rather than clustered. Each leaf is a shallow copy of its campaign
 * with `hero` set to that photo — every other field (url, hex, type, number, title…) is the
 * campaign's, so a click on any leaf opens the same root page. Pure; does not mutate input.
 *
 * A per-campaign cap keeps a photo-heavy campaign from dominating the sphere (the FULL set still
 * shows on the record page — this caps the GLOBE only): each campaign contributes at most
 * `perCampaignCap` leaves (its hero + the first cap−1 gallery photos).
 * @param {object[]} campaigns Campaigns to place on the globe (already sampled/filtered).
 * @param {number} [cap=CAMPAIGN_CAP] Max total leaves on the globe.
 * @param {number} [perCampaignCap=GLOBE_LEAVES_PER_CAMPAIGN] Max leaves any one campaign contributes.
 * @returns {object[]} New array of leaf records ({ ...campaign, hero: <photo|null> }), length <= cap.
 */
export function expandToLeaves(campaigns, cap = CAMPAIGN_CAP, perCampaignCap = GLOBE_LEAVES_PER_CAMPAIGN) {
  const list = Array.isArray(campaigns) ? campaigns : [];
  const max = Math.max(0, Math.floor(cap));
  const perC = Math.max(1, Math.floor(perCampaignCap)); // always at least the hero/placeholder leaf
  const perCampaign = list.map((c) => {
    const photos = [c.hero, ...(Array.isArray(c.images) ? c.images : [])]
      .filter((p) => p != null && p !== '');
    const uniq = [...new Set(photos)];
    return { c, photos: uniq.length ? uniq : [null] }; // [null] = one placeholder leaf
  });
  // rounds = the most any campaign contributes, bounded by the per-campaign cap.
  const rounds = Math.min(perC, perCampaign.reduce((m, p) => Math.max(m, p.photos.length), 0));
  const leaves = [];
  for (let r = 0; r < rounds && leaves.length < max; r++) {
    for (const { c, photos } of perCampaign) {
      if (r >= photos.length) continue; // this campaign has no more photos
      leaves.push({ ...c, hero: photos[r] });
      if (leaves.length >= max) break;
    }
  }
  return leaves;
}

/**
 * Place a pool of leaf items onto the vertices of a graph so that NEIGHBOURING vertices don't
 * share a background (Memo: no "same background next to each other" on the globe). Returns an
 * array of length `count` (one item per vertex). The pool is cycled to fill every vertex (each
 * leaf used ~evenly); for each vertex we choose the remaining item with the lowest clash score
 * against its already-placed neighbours — a same-PHOTO neighbour is heavily penalised (avoided
 * whenever possible) and a same-CAMPAIGN neighbour mildly (so a dominant campaign still spreads
 * its varied photos rather than clustering). Two phases: a greedy fill (hardest-vertices-first,
 * lowest clash score), then a SWAP repair that eliminates any remaining same-photo adjacency —
 * each accepted swap is proven to add no new clash, so it converges to zero whenever the photo
 * set allows it (with few distinct photos the greedy alone can paint itself into a corner). Pure.
 * @param {object[]} pool Leaf items (from expandToLeaves).
 * @param {Array<Set<number>|number[]>} adjacency adjacency[v] = the vertices sharing an edge with v.
 * @param {number} count Vertex count (globe instanceCount).
 * @returns {object[]} Arrangement of length `count` (empty if pool is empty).
 */
export function arrangeOnGraph(pool, adjacency, count) {
  if (!Array.isArray(pool) || pool.length === 0) return [];
  const n = Math.max(0, Math.floor(count));
  const bag = [];
  for (let k = 0; k < n; k++) bag.push(pool[k % pool.length]);
  const photoKey = (it) => (it && it.hero ? `p:${it.hero}` : null);
  const campKey = (it) => (it && (it.url || it.slug)) || `c:${(it && it.hex) || 'x'}`;
  const adj = adjacency || [];
  const degree = (v) => (adj[v] ? (adj[v].size ?? adj[v].length ?? 0) : 0);
  const result = new Array(n).fill(null);

  // ── phase 1: greedy fill ──
  const order = [...Array(n).keys()].sort((a, b) => degree(b) - degree(a));
  for (const v of order) {
    const nbCamp = new Map();
    const nbPhoto = new Set();
    for (const nb of adj[v] || []) {
      const it = result[nb];
      if (!it) continue;
      nbCamp.set(campKey(it), (nbCamp.get(campKey(it)) || 0) + 1);
      const pk = photoKey(it);
      if (pk) nbPhoto.add(pk);
    }
    const rem = new Map();
    for (const it of bag) { const ck = campKey(it); rem.set(ck, (rem.get(ck) || 0) + 1); }
    let best = 0, bestScore = Infinity;
    for (let i = 0; i < bag.length; i++) {
      const it = bag[i];
      const pk = photoKey(it);
      let score = 0;
      if (pk && nbPhoto.has(pk)) score += 1000;          // same photo touching = worst
      score += (nbCamp.get(campKey(it)) || 0) * 10;      // same campaign touching = mild
      score -= (rem.get(campKey(it)) || 0) * 0.01;       // prefer abundant → even spread
      if (score < bestScore) { bestScore = score; best = i; }
    }
    result[v] = bag.splice(best, 1)[0];
  }

  // ── phase 2: swap-repair same-PHOTO adjacencies ──
  // photoClashes(v, item) = how many of v's neighbours show the same photo as `item`. A swap of
  // result[v] and result[w] is accepted only if BOTH land clash-free; since `item` leaving a
  // vertex can only REMOVE clashes elsewhere, an accepted swap strictly lowers the total → the
  // loop converges (to zero when the photo multiset permits a proper placement).
  const photoClashes = (v, item) => {
    const pk = photoKey(item);
    if (!pk) return 0; // placeholder discs (no photo) aren't a "same background" violation
    let c = 0;
    for (const nb of adj[v] || []) { const it = result[nb]; if (it && photoKey(it) === pk) c++; }
    return c;
  };
  for (let pass = 0; pass < n; pass++) {
    let progress = false;
    for (let v = 0; v < n; v++) {
      if (photoClashes(v, result[v]) === 0) continue;
      for (let w = 0; w < n; w++) {
        if (w === v) continue;
        const a = result[v], b = result[w];
        if (photoKey(a) === photoKey(b)) continue; // same photo → swap is pointless
        result[v] = b; result[w] = a;              // try it
        if (photoClashes(v, b) === 0 && photoClashes(w, a) === 0) { progress = true; break; }
        result[v] = a; result[w] = b;              // revert — didn't help
      }
    }
    if (!progress) break;
  }
  return result;
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
