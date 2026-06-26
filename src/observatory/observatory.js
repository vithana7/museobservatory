// Muse Observatory — index page entry.
//
// Single data source: /campaigns.json (emitted by the build pipeline,
// served from memory in dev). It feeds BOTH the globe (decorative) and the
// accessible list fallback (the real, semantic source of truth).
//
// The list renders ALWAYS. The globe is layered on top only when motion is allowed
// AND WebGL2 is available — otherwise the list IS the experience (reduced-motion /
// low-power / screen-reader path). When the globe is active the list is hidden
// visually but kept in the accessibility tree (the canvas is aria-hidden).

import '../styles/tokens.css';
import './observatory.css';
import { Globe } from './globe.js';
import { createStarfield } from '../webgl/starfield.js';
import { createIntroStarfield } from '../webgl/intro-starfield.js';
import { CAMPAIGN_CAP, makeSeed, sample, filterCampaigns, applySparseGuard, expandToLeaves } from './selection.js';

// BASE_URL is '/' in dev and '/museobservatory/' on the GitHub Pages subpath build (always
// trailing-slashed). campaigns.json bakes root-absolute paths (/campaigns.json, /<slug>/,
// /assets/...) which Vite's base can't rewrite (they live in JSON/JS, not HTML) — so we
// re-root them at runtime against BASE_URL.
const BASE = import.meta.env.BASE_URL;
const withBase = (p) => (p ? BASE + p.replace(/^\//, '') : p);
const CAMPAIGNS_URL = withBase('/campaigns.json');

// Canonical muse hexes (from tokens.css). Hardcoded so the globe never depends on
// getComputedStyle('--<muse>') resolving in time — on Safari the imported CSS var
// reads back as '' during boot, which painted every muse disc grey (#888 fallback).
const MUSE_HEX = {
  lunes: '#5783A6', ares: '#D54D2E', rabu: '#8CB07F', thunor: '#F8D86A',
  shukra: '#7F49A2', dosei: '#5E47A1', solis: '#D48348',
};

// Halo radius = geometric-equator projection × this. <1 pulls the ring in from the
// radius-2 equator onto the PERCEIVED tile-cloud edge (round 6 — halo was oversized).
const HALO_FIT = 0.70;

let currentFocus = null; // the tile currently snapped to centre (drives tap → flip)

// Real archive entries only (no globe-only density fillers) — the set filters operate on.
const realCampaigns = (all) => all.filter((c) => !c.filler);

async function boot() {
  let campaigns = [];
  try {
    const res = await fetch(CAMPAIGNS_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    campaigns = await res.json();
    // Re-root the baked root-absolute paths onto BASE_URL (subpath-safe on GitHub Pages).
    campaigns = campaigns.map((c) => ({
      ...c,
      url: withBase(c.url),
      hero: withBase(c.hero),
      images: Array.isArray(c.images) ? c.images.map(withBase) : [],
    }));
  } catch (err) {
    console.error('[observatory] failed to load campaigns.json:', err);
    return; // the static list intro stays; nothing else to show
  }

  // The list is the complete, honest archive (layer 4 find/scan view).
  renderList(campaigns);
  // The globe is a BOUNDED view (decision G-A/S-1): a session-stable random sample of up to
  // 42 campaigns (the full icosahedron — muses left the globe, so no vertices are reserved).
  // makeSeed() keeps it stable within the visit, fresh next time. Filters replace this with
  // the true matching set (S-2).
  const seed = makeSeed();
  const landing = sample(realCampaigns(campaigns), CAMPAIGN_CAP, seed);
  maybeInitGlobe(landing, campaigns);
}

// ── globe items: campaign tiles ONLY ────────────────────────────────────────────
// Muses no longer ride the globe (decision S-1, revised 2026-06-22): they live solely in
// the filter as the "Muse" facet. The globe shows only Stardust/Horizon campaign tiles.
// Each campaign is expanded into "leaves" (one tile per photo) so the duplicate circles a
// campaign occupies show DIFFERENT photos but all open the same record page (selection
// .expandToLeaves — Memo's "leaves & root"). The list/filters stay campaign-based.
function buildItems(campaigns) {
  return expandToLeaves(campaigns).map((c) => ({
    kind: 'campaign',
    title: c.title,
    cause: c.cause,
    summary: c.summary,
    hex: c.hex,
    hero: c.hero || null, // the LEAF's photo (root-absolute /assets/images/<slug>/<file>, D-4)
    url: c.url,
    hasPage: c.hasPage,
    type: c.type,
    number: c.number,
    status: c.status,
    year: c.year,
  }));
}

function maybeInitGlobe(landing, allCampaigns) {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canWebGL2 = (() => {
    try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
  })();
  if (prefersReduced || !canWebGL2) { document.body.classList.add('list-only'); return; } // list IS the experience (inverse styling)

  const canvas = document.getElementById('observatory-globe');
  if (!canvas) return;

  // cosmic backdrop, both drawn on the globe's RAF (no second loop). Sized off
  // window.innerWidth, so they're fine to create before the canvas is visible.
  // The cloud (intro cosmic-noise nebula, pulse 0) sits UNDER the opaque starfield
  // and is composited up via `mix-blend-mode: screen` in CSS — the starfield writes
  // opaque black, so a cloud literally behind it would be occluded.
  const starfield = createStarfield('observatory-starfield', { intensity: 0.275 });
  starfield.init();
  const cloud = createIntroStarfield('observatory-cloud');
  cloud.init();
  const halo = document.getElementById('observatory-halo');

  // mobile sits closer (camera too far at the desktop default on a narrow viewport).
  // Round 8 — one default for all devices: the focused-tile screen size as a fraction of the
  // viewport's SMALLER dimension depends only on scale, not orientation (the projection math
  // cancels), so mobile + desktop share the zoom range. 1.6 sits mid-range (see initGlobeZoom).
  let defaultScale = 1.6;
  const scaleOverride = parseFloat(new URLSearchParams(location.search).get('scale'));
  if (Number.isFinite(scaleOverride)) defaultScale = scaleOverride; // dev: ?scale=X preview a zoom level

  let globe;
  let lastHaloR = 0;
  const items = buildItems(landing);
  try {
    globe = new Globe(canvas, items, {
      scale: defaultScale, // pull the camera back so the sphere of tiles reads as a globe
      onActiveItemChange: (item) => { currentFocus = item; }, // drives tap → flip
      onMovementChange: () => {}, // no overlay to toggle (the flip is the detail view)
      onFrame: (now) => {
        cloud.render(now); starfield.render(now);
        // keep the halo glued to the sphere's silhouette + scaling with zoom.
        // getSphereScreenRadius() projects the GEOMETRIC equator (radius 2), which renders
        // larger than the PERCEIVED tile-cloud (limb tiles are sparse + depth-shrunk), so
        // the ring sat outside the visible curvature. HALO_FIT pulls it onto the cloud.
        if (halo) {
          const r = globe.getSphereScreenRadius?.();
          const fit = r ? r * HALO_FIT : 0;
          if (fit && Math.abs(fit - lastHaloR) > 0.5) { halo.style.setProperty('--halo-r', Math.round(fit) + 'px'); lastHaloR = fit; }
        }
      },
    });
  } catch (err) {
    console.error('[observatory] globe init failed, keeping list:', err);
    return;
  }

  // Reveal the canvas FIRST, then re-measure: the canvas is display:none until
  // .globe-active, so the size read during construction was 0×0 (→ NaN aspect →
  // nothing rasterises). resize() after it's visible gives a real viewport.
  document.body.classList.add('globe-active');
  // Lock page scroll while the globe is the view. We do this on <html> (the viewport scroller)
  // rather than body overflow — toggling overflow on the propagating <body> didn't re-enable
  // scrolling on Safari when switching to list-view. setListView clears it for the list.
  document.documentElement.style.overflow = 'hidden';
  globe.resize();
  globe.start();
  globe.loadAtlas();
  initGlobeZoom(globe);
  initFlip(canvas, globe);
  initFilters(globe, allCampaigns);
  initViewToggle(globe);
  initPillColours();

  // dev-only: ?flipdemo=N auto-opens the flip for items[N] (or the first hero campaign) after
  // settle, with a synthetic source rect — lets headless Chrome screenshot the OPEN END state
  // (a real click isn't possible there). Inert without the query param.
  const params = new URLSearchParams(location.search);
  // dev: ?zoomprobe writes the focused-tile on-screen size into <title> + a corner div so
  // headless Chrome (--dump-dom) can read the metric at a given ?scale=. Inert otherwise.
  if (params.has('zoomprobe')) {
    setTimeout(() => {
      const r = globe.getActiveTileScreen?.();
      const vmin = Math.min(window.innerWidth, window.innerHeight);
      const kind = currentFocus?.kind || '?';
      const msg = r ? `ZP scale=${globe.scaleFactor.toFixed(2)} r=${r.r.toFixed(1)} dia=${(r.r * 2).toFixed(1)} vmin=${vmin} ratio=${(r.r * 2 / vmin).toFixed(3)} kind=${kind}` : 'ZP no-tile';
      document.title = msg;
      console.info('[observatory]', msg);
    }, 1800);
  }
  // dev: ?viewprobe overlays a LIVE corner readout of the canvas↔viewport↔halo metrics so the
  // Safari "tiles spill past the halo" misalignment can be diagnosed by comparison (Memo runs
  // it in Safari; Chrome is read headless). The key tells: sphere CENTRE vs viewport centre
  // (offset) and getSphereScreenRadius vs clientWidth (scale). Updates as the address bar /
  // window moves. Inert without the query param.
  if (params.has('viewprobe')) {
    const box = document.createElement('div');
    box.id = 'observatory-viewprobe';
    box.setAttribute('aria-hidden', 'true');
    box.style.cssText = 'position:fixed;right:8px;top:8px;z-index:9999;max-width:46vw;padding:8px 10px;'
      + 'font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre;color:#0f0;'
      + 'background:rgba(0,0,0,0.82);border:1px solid #0f0;border-radius:6px;pointer-events:none;';
    document.body.appendChild(box);
    const read = () => {
      const c = globe.gl.canvas;
      const rect = c.getBoundingClientRect();
      const vv = window.visualViewport;
      const ctr = globe.getSphereScreenCenter?.();
      const rad = globe.getSphereScreenRadius?.();
      const haloR = parseFloat(getComputedStyle(halo || document.body).getPropertyValue('--halo-r')) || 0;
      const lines = [
        `dpr            ${window.devicePixelRatio}`,
        `window.inner   ${window.innerWidth} x ${window.innerHeight}`,
        `visualViewport ${vv ? `${Math.round(vv.width)} x ${Math.round(vv.height)} off=${Math.round(vv.offsetLeft)},${Math.round(vv.offsetTop)} scale=${vv.scale.toFixed(2)}` : 'n/a'}`,
        `canvas.client  ${c.clientWidth} x ${c.clientHeight}`,
        `canvas.rect    ${rect.width.toFixed(0)} x ${rect.height.toFixed(0)} @ ${rect.left.toFixed(0)},${rect.top.toFixed(0)}`,
        `drawingBuffer  ${globe.gl.drawingBufferWidth} x ${globe.gl.drawingBufferHeight}`,
        `sphere centre  ${ctr ? `${ctr.cx.toFixed(0)},${ctr.cy.toFixed(0)}` : 'null'}`,
        `viewport ctr   ${(c.clientWidth / 2).toFixed(0)},${(c.clientHeight / 2).toFixed(0)}`,
        `centre offset  Δx=${ctr ? (ctr.cx - c.clientWidth / 2).toFixed(0) : '?'} Δy=${ctr ? (ctr.cy - c.clientHeight / 2).toFixed(0) : '?'}`,
        `sphere radius  ${rad ? rad.toFixed(0) : 'null'}  (halo-r=${haloR.toFixed(0)}, fit=${HALO_FIT})`,
        `scale          ${globe.scaleFactor.toFixed(2)}`,
      ];
      box.textContent = 'VIEWPROBE\n' + lines.join('\n');
    };
    setInterval(read, 400);
    read();
  }
  // homepage "Explore campaigns" deep-link: ?focus=stardust|horizon orients the globe so a campaign
  // of that programme is the centre tile (prefer one with a record page → a real "Explore" target).
  const focusType = params.get('focus');
  if (focusType === 'stardust' || focusType === 'horizon') {
    if (!globe.focusItem((it) => it.kind === 'campaign' && it.type === focusType && it.url)) {
      globe.focusItem((it) => it.kind === 'campaign' && it.type === focusType);
    }
  }

  const fd = params.get('flipdemo');
  if (fd !== null) {
    const idx = fd === '' ? items.findIndex((it) => it.kind === 'campaign' && it.hero) : (parseInt(fd, 10) || 0);
    const it = items[idx] || items[0];
    setTimeout(() => {
      const r = globe.getActiveTileScreen?.() || { cx: window.innerWidth / 2, cy: window.innerHeight * 0.62, r: 64 };
      openFlip(it, { cx: r.cx, cy: r.cy, r: Math.max(40, r.r) }, globe);
      // ?face=front holds the FRONT visible (skips the inner-shell flip) so the hero-matched
      // front face can be screenshotted (it's otherwise only seen during the <1s morph).
      if (params.get('face') === 'front') {
        setTimeout(() => document.getElementById('observatory-flip')?.classList.remove('is-open'), 60);
      }
    }, 700);
  }

  let t;
  window.addEventListener('resize', () => {
    clearTimeout(t);
    t = setTimeout(() => { globe.resize(); starfield.resize(); cloud.resize(); }, 150);
  });
}

// ── globe zoom: gesture-only (scroll-wheel + two-finger pinch → globe.setScale) ───────
// The visible zoom slider was retired (decision: zoom is a quiet convenience, not a control);
// these gestures stay because they're free + natural. `frac` (0 = most zoomed-in) maps to scale.
function initGlobeZoom(globe) {
  // Bounds clamp the focused tile's on-screen size: MIN = camera closest = tile looms biggest
  // (most zoomed IN); MAX = comfortable, not tiny. Orientation-independent, so one range fits all.
  const MIN = 1.3, MAX = 2.1;
  let frac = Math.max(0, Math.min(1, ((globe.scaleFactor || 2.0) - MIN) / (MAX - MIN)));
  const apply = () => { frac = Math.max(0, Math.min(1, frac)); globe.setScale(MIN + frac * (MAX - MIN)); };

  // scroll-to-zoom (Google-Maps style); deltaY > 0 (scroll down / trackpad pinch in) → zoom OUT.
  // Mac trackpad pinch arrives as wheel+ctrlKey, so it's handled for free.
  window.addEventListener('wheel', (e) => {
    // Only own the wheel on the live globe. In list-view the globe is hidden and the document
    // must scroll — bailing here lets the page scroll instead of the wheel being eaten by zoom.
    if (!document.body.classList.contains('globe-active')) return;
    if (document.body.classList.contains('list-view')) return;
    e.preventDefault();
    frac += Math.max(-0.1, Math.min(0.1, e.deltaY * 0.0015));
    apply();
  }, { passive: false });

  // pinch-to-zoom (touch): two fingers on the globe canvas drive the SAME frac as the wheel.
  // Suppresses Arcball rotate while two pointers are down (globe.control.paused). Round 8 / OBS-13.
  const canvas = globe.canvas;
  if (canvas) {
    const pts = new Map();
    let baseDist = 0;
    let baseFrac = 0;
    const spread = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) { baseDist = spread(); baseFrac = frac; if (globe.control) globe.control.paused = true; }
    }, { passive: true });
    canvas.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && baseDist > 0) {
        // fingers apart (ratio > 1) → zoom IN (frac → 0 = MIN); together → zoom OUT (frac → 1 = MAX)
        frac = Math.max(0, Math.min(1, baseFrac - Math.log2(spread() / baseDist) * 0.9));
        apply();
        e.preventDefault();
      }
    }, { passive: false });
    const drop = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size < 2) { baseDist = 0; if (globe.control) globe.control.paused = false; }
    };
    canvas.addEventListener('pointerup', drop);
    canvas.addEventListener('pointercancel', drop);
  }
}

// ── tile flip-card: tap the centred tile → a DOM card flips (front disc → black
//    detail face with name + cause + description). The WebGL tile can't flip itself,
//    so this stands in over it, in the orbit-card spirit. ───────────────────────────
function typeNumber(item) {
  const t = item.type === 'horizon' ? 'Horizon' : 'Stardust';
  const n = typeof item.number === 'number' ? ` ${String(item.number).padStart(3, '0')}` : '';
  return `${t}${n}`;
}

// Curved rim title (SVG textPath) along the inside TOP arc of the disc — seal-style. Frees the
// centre for the title + copy so nothing spills the circle (round 8 / OBS-11). Font-size (viewBox
// units) shrinks for long strings so they fit the arc; capped so short ones don't balloon.
function rimSvg(text) {
  const t = String(text).toUpperCase();
  const R = 43; // arc radius in viewBox units (card-relative; viewBox is 0 0 100 100)
  const fs = Math.max(3.0, Math.min(5.0, (Math.PI * R * 0.9) / (Math.max(1, t.length) * 0.62)));
  return `<svg class="tile-flip-rim" viewBox="0 0 100 100" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true">
    <path id="tile-rim-path" fill="none" d="M ${50 - R},50 A ${R},${R} 0 0 1 ${50 + R},50"/>
    <text text-anchor="middle" font-size="${fs.toFixed(2)}"><textPath href="#tile-rim-path" xlink:href="#tile-rim-path" startOffset="50%">${esc(t)}</textPath></text>
  </svg>`;
}

function fillFlip(item) {
  const front = document.querySelector('#observatory-flip .tile-flip-front');
  const back = document.querySelector('#observatory-flip .tile-flip-back');
  if (!front || !back) return;
  front.style.setProperty('--accent', item.hex || '#111');
  back.style.setProperty('--accent', item.hex || '#ffffff');
  front.classList.remove('has-hero');

  // campaign — the FRONT mirrors the WebGL tile (hero photo cover-fit + accent wash + label, or
  // the accent disc + label) so the morph grows from the SAME image the tile shows (round 8 / A).
  const typeWord = item.type === 'horizon' ? 'Horizon' : 'Stardust';
  const heroLayer = item.hero
    ? `<span class="tile-flip-hero" style="background-image:url('${esc(item.hero)}')"></span><span class="tile-flip-hero-wash"></span>`
    : '';
  front.innerHTML = `${heroLayer}<span class="tile-flip-front-label">${esc(typeNumber(item))}</span>`;
  if (item.hero) front.classList.add('has-hero');

  const action = item.url
    ? `<a class="tile-flip-action" href="${esc(item.url)}">Explore</a>`
    : '<span class="tile-flip-action tile-flip-action--inert">Soon</span>';
  const rim = [typeWord, item.cause, item.year].filter(Boolean).join(' · ');
  back.innerHTML = rimSvg(rim) + `
    <h2 class="tile-flip-name">${esc(item.title || '')}</h2>
    ${item.summary ? `<p class="tile-flip-desc">${esc(item.summary)}</p>` : ''}
    ${action}`;
}

let flipRect = null;   // the tile's on-screen circle at open — anchors the grow + the close
let flipGlobe = null;

// ROUND 8 — the card opens to a FIXED readable size (Memo: "always big enough to read"),
// DECOUPLED from the tile. The morph still ORIGINATES from the exact clicked tile (openFlip maps
// it onto {cx,cy,r}), so a tiny zoomed-out tile grows UP to this size with no jump. (Round 6 tied
// size to the tile → tiny cards when zoomed out + the "detached" feel. Round 8 splits the two:
// big final size, exact-tile origin.) Capped so it never exceeds a small viewport.
const FLIP_MAX_PX = 560;
// The WebGL disc renders LARGER than getActiveTileScreen()'s flat-quad radius: the shader spherises
// the quad and the centre tile bulges toward the camera (globe-shaders.js). This is the SAME
// magnification the tap hit-test compensates for (rect.r * 1.6 in initFlip). The flip morph must use
// the VISIBLE radius so the card grows from / lands ON the real disc — sizing to raw rect.r made the
// card ~half the tile, which read as two nested discs on close. Eyeball-tune (raise if a tile ring
// peeks at the end of close; lower if the card overshoots the disc).
const DISC_VISIBLE_K = 1.7;
function flipCardSize() {
  const vmin = Math.min(window.innerWidth, window.innerHeight);
  const target = vmin * 0.82;
  const floor = Math.min(300, vmin - 28);
  return Math.round(Math.max(floor, Math.min(target, FLIP_MAX_PX)));
}

// FLIP morph, flash-free: set the card's final (big) size, then in the SAME synchronous task set
// the INVERTED transform that maps it onto the clicked tile's screen circle AND unhide it, then
// force ONE reflow to commit that as the start state BEFORE any paint. So the browser never paints
// the un-inverted (centred, full-size) card — the old code unhid first and inverted a frame later,
// which painted one big centred frame = the "second card on top." The card centres in the viewport
// (the wrap is a fixed, symmetric flex box), so the centred rect's centre IS the viewport centre —
// no getBoundingClientRect (which needs a paint) required. The globe freezes + hides so the WebGL
// tile can't show beside the DOM card.
function openFlip(item, rect, globe) {
  const wrap = document.getElementById('observatory-flip');
  const card = wrap?.querySelector('.tile-flip-card');
  if (!wrap || !card || !item || !rect) return;
  flipRect = rect;
  flipGlobe = globe;
  fillFlip(item);

  const finalSize = flipCardSize();
  card.style.width = finalSize + 'px';

  // Hide the WebGL tile INSTANTLY (kill its 0.4s opacity fade) so it can't ghost under the growing
  // card — mirrors the instant reveal on close. Only the card paints during the grow.
  const g = document.getElementById('observatory-globe');
  if (g) g.style.transition = 'none';
  document.body.classList.add('flip-open');
  if (g) { void g.offsetWidth; g.style.transition = ''; }   // restore so close can reveal it instantly too
  if (globe) {
    globe.freeze();                                     // hold the tile still → close lands on it
    globe.canvas.style.pointerEvents = 'none';
  }

  const vpCx = window.innerWidth / 2;
  const vpCy = window.innerHeight / 2;
  const s = Math.max(0.04, (rect.r * DISC_VISIBLE_K * 2) / finalSize);
  card.style.transition = 'none';
  card.style.transform = `translate(${(rect.cx - vpCx).toFixed(1)}px, ${(rect.cy - vpCy).toFixed(1)}px) scale(${s.toFixed(4)})`;
  wrap.hidden = false;
  void card.offsetWidth;                                // commit the inverted start state pre-paint
  if (globe) console.info('[observatory] flip open — frozen:', globe._frozen === true, '· tile r(css):', Math.round(rect.r), '· card px:', finalSize, '· s:', s.toFixed(3));

  requestAnimationFrame(() => {
    card.style.transition = '';                         // CSS grow easing
    card.style.transform = '';                          // → identity (grows to centre)
    wrap.classList.add('is-open');                      // inner shell flips
  });
}

function closeFlip() {
  const wrap = document.getElementById('observatory-flip');
  const card = wrap?.querySelector('.tile-flip-card');
  const inner = wrap?.querySelector('.tile-flip-inner');
  if (!wrap || wrap.hidden) return;
  // CLOSE is a system response, not a deliberate act → snap it: fast + NO overshoot, asymmetric
  // against the expressive 0.55s open (Emil). Set on BOTH the card (shrink) and inner (flip-back)
  // BEFORE toggling is-open so the rotate uses the snappy curve too, not the CSS open easing.
  const CLOSE = 'transform 0.24s cubic-bezier(0.23, 1, 0.32, 1)';
  if (inner) inner.style.transition = CLOSE;
  if (card) card.style.transition = CLOSE;
  // Fade the backdrop out WITH the card (0.2s), not its slower 0.4s open fade — otherwise the
  // overlay is hidden mid-fade and the last sliver of dim visibly snaps off.
  wrap.style.transition = 'background 0.2s cubic-bezier(0.23, 1, 0.32, 1)';
  wrap.classList.remove('is-open');                      // flip back to front + fade backdrop
  // Shrink back onto the LIVE (still-frozen) tile — recompute its rect so we land where the tile
  // actually is, not a stale open-time position.
  const rect = flipGlobe?.getActiveTileScreen?.() || flipRect;
  if (card && rect) {
    const finalSize = parseFloat(card.style.width) || flipCardSize();
    const vpCx = window.innerWidth / 2;
    const vpCy = window.innerHeight / 2;
    const s = Math.max(0.04, (rect.r * DISC_VISIBLE_K * 2) / finalSize);
    card.style.transform = `translate(${(rect.cx - vpCx).toFixed(1)}px, ${(rect.cy - vpCy).toFixed(1)}px) scale(${s.toFixed(4)})`;
  }
  // The globe tile stays HIDDEN + frozen for the whole shrink (body.flip-open → globe opacity 0):
  // only the card paints, so there's no second disc to double-ring against. It's revealed in done().
  const done = () => {
    card?.removeEventListener('transitionend', onEnd);
    clearTimeout(timer);
    // Reveal the tile INSTANTLY (kill the 0.4s opacity fade) so it's already on-screen the moment the
    // card hides — the card ended at the tile's real size + position (DISC_VISIBLE_K), so the hand-off
    // is invisible. Reveal-then-hide in one synchronous task → a single paint, no gap, no overlap.
    const g = document.getElementById('observatory-globe');
    if (g) g.style.transition = 'none';
    document.body.classList.remove('flip-open');
    if (g) { void g.offsetWidth; g.style.transition = ''; }   // restore so the OPEN still fades the tile out
    wrap.hidden = true;                                        // hide the card now the tile is under it
    if (card) { card.style.transition = 'none'; card.style.transform = ''; card.style.width = ''; } // reset → next open recomputes
    if (inner) inner.style.transition = '';                   // reset → next open uses the CSS open easing
    wrap.style.transition = '';                               // reset → next open uses the CSS 0.4s backdrop fade-in
    if (flipGlobe) { flipGlobe.thaw(); flipGlobe.canvas.style.pointerEvents = ''; }
    flipRect = null;
    flipGlobe = null;
  };
  const onEnd = (e) => { if (e.target === card && e.propertyName === 'transform') done(); };
  card?.addEventListener('transitionend', onEnd);
  const timer = setTimeout(done, 320); // fallback if transitionend doesn't fire (matches the 0.24s snappy close)
}

function initFlip(canvas, globe) {
  const wrap = document.getElementById('observatory-flip');
  if (!wrap) return;

  // a tap (not a drag) opens the flip — but ONLY when it lands on the focused tile's disc
  let dx = 0, dy = 0, t0 = 0, moved = false;
  canvas.addEventListener('pointerdown', (e) => { dx = e.clientX; dy = e.clientY; t0 = Date.now(); moved = false; });
  canvas.addEventListener('pointermove', (e) => {
    if (Math.hypot(e.clientX - dx, e.clientY - dy) > 6) moved = true;
  });
  canvas.addEventListener('pointerup', (e) => {
    if (moved || Date.now() - t0 >= 400 || !currentFocus) return;
    const rect = globe?.getActiveTileScreen();
    if (!rect) return;
    // Hit the WHOLE disc, not just the symbol. The vertex shader spherises the quad so the
    // VISIBLE disc renders larger than the flat-quad rect.r — a tight tolerance left the
    // disc's outer ring / negative space un-clickable. 1.6× comfortably covers it (the
    // focused tile is the only interactive thing centre-screen, so being generous is safe).
    if (Math.hypot(e.clientX - rect.cx, e.clientY - rect.cy) > rect.r * 1.6) return;
    openFlip(currentFocus, rect, globe);
  });

  // close on a click anywhere OUTSIDE the visible disc, or Escape. The card is a SQUARE
  // (border-radius only makes it LOOK round — its transparent corners still catch clicks),
  // so the old `e.target === wrap` test missed every click that landed in those corner zones
  // → it felt like leaving the circle took several clicks. Measure the click against the disc
  // radius instead: outside the disc closes (one tap); inside keeps the "Explore" link live.
  wrap.addEventListener('click', (e) => {
    const card = wrap.querySelector('.tile-flip-card');
    const r = (parseFloat(card?.style.width) || flipCardSize()) / 2;
    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    if (Math.hypot(e.clientX - cx, e.clientY - cy) > r) closeFlip();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeFlip(); });
}

// ── globe ↔ list view toggle (G-C) ──────────────────────────────────────────────
//    Switches the page between the WebGL globe and the accessible list as a first-class
//    sighted peer. ONE source of truth (setListView) used by both the toggle button and
//    the sparse-set guard (A-4, which force-shows the list when a filter matches too few).
//    The button is found by id internally so apply() can call this without threading it.
function setListView(on, globe) {
  const btn = document.getElementById('observatory-view-toggle');
  document.body.classList.toggle('list-view', on);
  // Scroll-lock lives on <html>: clear it for the list (document scrolls), re-lock for the globe.
  document.documentElement.style.overflow = on ? '' : 'hidden';
  if (on) {
    globe?.freeze();
    if (btn) {
      btn.setAttribute('aria-pressed', 'true');
      const label = btn.querySelector('.view-pill-label');
      if (label) label.textContent = 'Globe';
    }
  } else {
    globe?.thaw();
    // the canvas was display:none → re-measure on the way back (mirrors maybeInitGlobe).
    globe?.resize();
    if (btn) {
      btn.setAttribute('aria-pressed', 'false');
      const label = btn.querySelector('.view-pill-label');
      if (label) label.textContent = 'List';
    }
  }
}

function initViewToggle(globe) {
  const btn = document.getElementById('observatory-view-toggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    setListView(!document.body.classList.contains('list-view'), globe);
  });
}

// ── per-pill muse colour ──────────────────────────────────────────────────────────────────
// The two control pills (Filter + List) carry a soft drifting muse-gradient glass. Shuffle the 7
// muses, then hand each pill a 3-muse window OFFSET from the next so the pills span cools + warms
// (a fixed full-palette sweep read as always-warm — the cool hues sat dark under the frost). A
// random drift phase/speed keeps them out of sync.
function initPillColours() {
  const glasses = [...document.querySelectorAll('.filter-wrap .pill-glass')];
  if (!glasses.length) return;
  const museKeys = Object.keys(MUSE_HEX);
  for (let i = museKeys.length - 1; i > 0; i--) {            // Fisher–Yates shuffle
    const j = Math.floor(Math.random() * (i + 1));
    [museKeys[i], museKeys[j]] = [museKeys[j], museKeys[i]];
  }
  glasses.forEach((g, i) => {
    [0, 1, 2].forEach((k) => g.style.setProperty(`--m${k + 1}`, MUSE_HEX[museKeys[(i * 2 + k) % museKeys.length]]));
    g.style.animationDelay = `-${(Math.random() * 22).toFixed(1)}s`;
    g.style.animationDuration = `${(18 + Math.random() * 10).toFixed(1)}s`;
  });
}

// ── filter control: a left-edge pill → a panel of facets that narrow the globe ──────
//    No filter → the session-random sample (S-2 landing state). Any filter active →
//    the TRUE matching set, capped at CAMPAIGN_CAP for the globe (S-2). The list always
//    mirrors the same set so the two views agree.
const TYPE_LABEL = { stardust: 'Stardust', horizon: 'Horizon' };
const STATUS_LABEL = { ongoing: 'Ongoing', upcoming: 'Upcoming', closed: 'Closed' };

function initFilters(globe, allCampaigns) {
  const toggle = document.getElementById('observatory-filter-toggle');
  const panel = document.getElementById('observatory-filter-panel');
  const wrap = document.querySelector('.filter-wrap');
  if (!toggle || !panel || !wrap) return;

  // Class-driven open/close (was the `hidden` attribute). Removing `hidden` hands visibility to
  // CSS (`.filter-panel` stays hidden until `.is-open`), so the grow/fade animates on EVERY iOS
  // version — `@starting-style`/`allow-discrete` only fire on iOS Safari 18+. The `hidden`
  // attribute stays in the HTML as the no-JS fallback (the panel's contents are JS-built anyway).
  panel.removeAttribute('hidden');
  const isOpen = () => panel.classList.contains('is-open');

  const pool = allCampaigns.filter((c) => !c.filler); // real entries only
  const facets = { muse: null, type: null, status: null, geo: '' };
  const seed = makeSeed(); // reuse the session seed so "clear" returns the SAME landing sample

  // Derive the option sets from the data (only offer facets that exist).
  const uniq = (key) => [...new Set(pool.map((c) => c[key]).filter(Boolean))];
  const muses = uniq('muse');
  const types = uniq('type');
  const statuses = uniq('status');
  const museHex = (m) => {
    const found = pool.find((c) => c.muse === m);
    return found?.hex || MUSE_HEX[m] || '#888';
  };

  const chip = (group, value, label, dotHex) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'filter-chip';
    b.dataset.group = group;
    b.dataset.value = value;
    b.setAttribute('aria-pressed', 'false');
    // Muse chips carry the masked muse glyph (the list-page marker) tinted to the muse hue;
    // type/status chips are text-only. --chip on the BUTTON drives both the glyph tint and the
    // selected-state underline (custom props inherit down, not up).
    let marker = '';
    if (dotHex) {
      b.style.setProperty('--chip', dotHex);
      if (group === 'muse') {
        b.style.setProperty('--glyph', `url('${esc(withBase('/assets/images/muse/' + value + '-white.png'))}')`);
        marker = '<span class="filter-chip-glyph" aria-hidden="true"></span>';
      }
    }
    b.innerHTML = marker + `<span>${esc(label)}</span>`;
    return b;
  };

  const group = (label, key, values, labelFor, dotFor) => {
    if (!values.length) return null;
    const g = document.createElement('div');
    g.className = 'filter-group';
    g.innerHTML = `<span class="filter-group-label">${esc(label)}</span>`;
    const chips = document.createElement('div');
    chips.className = 'filter-chips';
    for (const v of values) chips.appendChild(chip(key, v, labelFor(v), dotFor ? dotFor(v) : null));
    g.appendChild(chips);
    return g;
  };

  const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const gMuse = group('Muse', 'muse', muses, (m) => titleCase(m), museHex);
  const gType = group('comet-collab', 'type', types, (t) => TYPE_LABEL[t] || titleCase(t));
  const gStatus = group('Status', 'status', statuses, (s) => STATUS_LABEL[s] || titleCase(s));
  [gMuse, gType, gStatus].forEach((g) => g && panel.appendChild(g));

  // geo: a free text box (substring over locations[]) — A-1 structured geo isn't built yet.
  const geoWrap = document.createElement('div');
  geoWrap.className = 'filter-group';
  geoWrap.innerHTML = '<span class="filter-group-label">Place</span>';
  const geoInput = document.createElement('input');
  geoInput.type = 'search';
  geoInput.className = 'filter-geo';
  geoInput.placeholder = 'e.g. Berlin, Italy…';
  geoInput.setAttribute('aria-label', 'Filter by place');
  geoWrap.appendChild(geoInput);
  panel.appendChild(geoWrap);

  const footer = document.createElement('div');
  footer.className = 'filter-footer';
  footer.innerHTML = '<span class="filter-count"></span><button type="button" class="filter-clear" hidden>Clear all</button>';
  panel.appendChild(footer);
  const countEl = footer.querySelector('.filter-count');
  const clearBtn = footer.querySelector('.filter-clear');

  const isActive = () => facets.muse || facets.type || facets.status || facets.geo.trim();

  const apply = () => {
    const active = isActive();
    // No filter → the session-random landing sample. Any filter → the true matching set (S-2).
    const matched = active ? filterCampaigns(pool, facets) : pool;
    const forGlobe = active ? matched.slice(0, CAMPAIGN_CAP) : sample(pool, CAMPAIGN_CAP, seed);
    const items = buildItems(forGlobe);
    globe.setItems(items);
    renderList(active ? matched : allCampaigns);
    countEl.textContent = active ? `${matched.length} match${matched.length === 1 ? '' : 'es'}` : '';
    clearBtn.hidden = !active;
    wrap.classList.toggle('is-open', isOpen());
    // A-4: too few matches makes the globe repeat tiles + look broken — force the list
    // (the agreed fallback is show-the-list, not pad the globe). We never forcibly switch
    // BACK when matches are plentiful, so the user's chosen view is respected otherwise.
    if (active && applySparseGuard(matched).sparse) setListView(true, globe);
  };

  panel.addEventListener('click', (e) => {
    const b = e.target.closest('.filter-chip');
    if (!b) return;
    const { group: key, value } = b.dataset;
    facets[key] = facets[key] === value ? null : value; // single-select per group, toggle off
    for (const sib of panel.querySelectorAll(`.filter-chip[data-group="${key}"]`)) {
      sib.setAttribute('aria-pressed', String(sib.dataset.value === facets[key]));
    }
    apply();
  });

  let geoT;
  geoInput.addEventListener('input', () => {
    clearTimeout(geoT);
    geoT = setTimeout(() => { facets.geo = geoInput.value; apply(); }, 180);
  });

  clearBtn.addEventListener('click', () => {
    facets.muse = facets.type = facets.status = null;
    facets.geo = '';
    geoInput.value = '';
    for (const c of panel.querySelectorAll('.filter-chip')) c.setAttribute('aria-pressed', 'false');
    apply();
  });

  const setOpen = (open) => {
    panel.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    wrap.classList.toggle('is-open', open || isActive());
  };
  toggle.addEventListener('click', () => setOpen(!isOpen()));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) setOpen(false); });
  // click anywhere outside the rail (pill + panel) closes the open panel
  document.addEventListener('pointerdown', (e) => {
    if (isOpen() && !wrap.contains(e.target)) setOpen(false);
  });
}

// ── accessible list fallback (REQUIRED — screen reader / keyboard / reduced-motion
//    / no-WebGL2). Built from the same campaigns.json the globe consumes. ─────────
function renderList(campaigns) {
  const ul = document.querySelector('.observatory-list-items');
  if (!ul) return;
  ul.innerHTML = '';

  for (const c of campaigns) {
    if (c.filler) continue; // globe-only density tiles aren't real archive entries — keep the list honest
    const li = document.createElement('li');
    li.className = 'observatory-list-item';

    const inner = c.url ? document.createElement('a') : document.createElement('div');
    inner.className = 'observatory-list-link';
    if (c.url) inner.href = c.url;
    if (c.hex) inner.style.setProperty('--accent', c.hex);

    const typeLabel = c.type === 'horizon' ? 'Horizon' : 'Stardust';
    const num = typeof c.number === 'number' ? ` ${String(c.number).padStart(3, '0')}` : '';
    const eyebrow = [`${typeLabel}${num}`, c.cause, c.status].filter(Boolean).join(' · ');
    const meta = [c.year, c.location].filter(Boolean).join(' · ');
    // The muse glyph (tinted to the muse hex via a CSS mask) replaces the plain colour dot;
    // campaigns without a muse keep the neutral dot. withBase() keeps the path subpath-safe.
    const marker = c.muse
      ? `<span class="observatory-list-glyph" style="--glyph:url('${esc(withBase('/assets/images/muse/' + c.muse + '-white.png'))}')" aria-hidden="true"></span>`
      : '<span class="observatory-list-chip" aria-hidden="true"></span>';

    inner.innerHTML = `
      ${marker}
      <span class="observatory-list-text">
        <span class="observatory-list-eyebrow">${esc(eyebrow)}</span>
        <span class="observatory-list-name">${esc(c.title || c.slug)}</span>
        ${meta ? `<span class="observatory-list-meta">${esc(meta)}</span>` : ''}
      </span>
      ${c.url ? '<span class="observatory-list-go" aria-hidden="true">→</span>' : '<span class="observatory-list-soon">soon</span>'}
    `;

    li.appendChild(inner);
    ul.appendChild(li);
  }
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]
  ));
}

boot();
