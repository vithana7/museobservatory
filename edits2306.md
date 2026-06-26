# edits2306 — visual changes pass

> Working plan for the next round of **visual** edits to the Muse Observatory.
> Started 2026-06-23. This is a scratch/planning doc, not spec — once an edit lands and
> sticks, fold the *why* into [docs/decisions.md](docs/decisions.md) and run `/doc-minder`.

## Why this is allowed now

`G-D` froze globe **device-polish** *"until the scaling foundation (layers 1–3) exists —
foundation before art."* Per [docs/frontend.md](docs/frontend.md) layers 1–3 are now built,
tested (`npm test` green), and wired (selection layer, filters, sparse fallback, globe↔list
toggle). **The freeze condition is satisfied** — this is the "art last" phase G-D and A-3
were waiting for. We can polish.

Standing rules still apply: vanilla JS only, markdown stays the source of truth, no
server/DB, **don't commit unless asked**, and verify empirically (headless Chrome for the
globe; Safari eyeballed by Memo).

## Preview links

Dev server is running (`npm run dev -- --host`):

| Target | URL | Notes |
|--------|-----|-------|
| **Desktop** | http://localhost:5174/ | Hot-reload; edits show live. (Port 5173 was busy, so Vite used 5174.) |
| **Mobile** | http://192.168.178.69:5174/ | Same Wi-Fi network only. Open on phone to check touch + small-screen. |
| Shipped (ref) | https://vithana7.github.io/museobservatory/ | GitHub Pages — what's live, not this branch. |

> For "what actually ships" (real bundle, asset paths): `./dev.sh preview` →
> http://localhost:4173/ . The LAN IP can change between sessions — re-check with
> `ipconfig getifaddr en0`.

## The surfaces we can edit

A map of the current visual elements, so each edit targets something real
([index.html](index.html) + [src/observatory/observatory.css](src/observatory/observatory.css)):

- **Cosmic backdrop** — `#observatory-cloud` (intro nebula), `#observatory-halo` (atmosphere),
  `#observatory-starfield` (screen-blended stars). Shown only when the globe is active.
- **The globe** — `#observatory-globe`, 42-tile icosahedron, tile atlas, arcball drag/inertia.
- **Left rail** (`.filter-wrap`) — Filter pill + facet panel, zoom slider, globe↔list toggle.
  All share the "beam-glow + liquid-glass" pill look.
- **Tile flip-card** — `#observatory-flip`, tap a tile → flips to name/cause/description.
- **The list view** — `#observatory-list` (title, intro, items). The find/scan peer.
- **Record pages** — generated static pages ([src/observatory/record.css](src/observatory/record.css)).
- **Type / brand** — Typekit (`afs8ors`), cocoex wordmark, `tokens.css` design tokens.

## Planned edits

> One row per edit. Keep *why* honest — it's what graduates into `decisions.md`.
> Status: `idea` → `doing` → `done` (→ documented).

| # | Surface | Edit | Why | Status |
|---|---------|------|-----|--------|
| 1 | Globe + halo | Fix Safari tile/halo misalignment (tiles spill past the glow) | Correctness — the globe reads broken on Safari; allowed under G-D as a correctness fix (X-1 precedent) | doing |
| 2 | Left rail | cocoex-symbol "coin" that splits into the three controls (Filter / Zoom / List), weighted open/close | Cleaner first view — three always-on pills clutter the globe; one mark reads as brand + the split invites interaction | done (eyeball pending) |
| 3 | Type / brand | Switch the display face to **Canela Deck** | The Deck optical cut is the intended brand face; current `'canela'` may be the wrong variant | blocked — kit 404s, needs woff2 or kit fix |

### Details

#### 1. Safari globe/halo misalignment — *correctness*
- **Touches:** [globe.js](src/observatory/globe.js), [observatory.js](src/observatory/observatory.js), maybe `#observatory-halo` in [observatory.css](src/observatory/observatory.css).
- **Approach:** measure first. Add a dev-gated `?viewprobe` (mirrors `?zoomprobe`) dumping dpr, `clientWidth/Height`, `drawingBufferWidth/Height`, `getBoundingClientRect`, `visualViewport`, `getSphereScreenRadius`, projected origin centre. Memo runs it in **Safari**; I read **Chrome** headless; compare. Then fix the divergence — likely a `ResizeObserver` replacing the synchronous post-`.globe-active` resize, one shared `cssW/cssH` source for projection + halo, and/or tracking the real outermost tile instead of the `HALO_FIT = 0.70` fudge.
- **Verify:** headless Chrome stays aligned; Memo confirms Safari (desktop + mobile) across the zoom range.
- **Notes:** sphere + tiles use the *same* projection → divergence is the canvas-box→viewport mapping, not the shader.

#### Batch 3 (2026-06-24) — art-direction pass
- **Menu:** mobile pops up **horizontal** (row); coin logo **10% bigger**; pills **10% longer** + **vertical labels flipped** (head-left). Pills **drop the rainbow** → soft **drifting muse-colour gradient** (`@keyframes muse-drift`, per-pill random delay/duration in `initMenu`); the coin keeps its beam-glow. Open/close is now a **soft springy "blob"** (pills pop scale 0.4→spring-overshoot→1; slices balloon out + fade).
- **List view → inverse** (dark-on-white, muse accents kept): offwhite bg, dark text, inverted wordmark, neutral dot for muse-less rows. Applies to toggle list-view + the no-WebGL `list-only` path. **Verified** in headless (reduced-motion path).
- **List scroll fixed (again):** the lock now lives on **`<html>`** (JS-managed in `setListView`/`maybeInitGlobe`) — toggling `<body>` overflow was the Safari culprit. Body overflow rules removed.
- **Globe tile + flip:** muse overlay stronger (`HERO_TINT_ALPHA 0.35→0.5`, flip wash `0.35→0.5`).
- **Flip:** rim arc text smaller (`fs` cap `6.2→5.0`), centre title bigger (`24→28`) so the title regains weight.
- Globe-view visuals (springy menu, muse-drift pills, tile tint, flip) need Memo's live eyeball — headless WebGL was down this session.

#### Batch 2 (2026-06-24) — menu vertical bars, halo, list fixes
- **Menu open layout → three VERTICAL bars** (per Memo's sketch): Filter / Zoom / List are now tall, narrow vertical pills stacked + centred on the coin. Labels rotated (`writing-mode: vertical-rl`); the **zoom became a vertical slider** (initZoomControl rewritten to the Y axis: `clientY`, `translateY`, travel from height; Up=in/Down=out; `aria-orientation:vertical`). Verified open state in headless.
- **List scroll bug fixed**: `body.globe-active.list-view { overflow: visible }` (compound selector beats the globe lock; `visible` lets the *document* scroll instead of the flaky body→viewport propagation that blocked Safari).
- **Dots → muse glyphs**: `renderList` emits `.observatory-list-glyph` (white muse PNG tinted to the muse hex via CSS `mask` + `background:var(--accent)`); muse-less campaigns keep the dot. Verified in headless (Stardust 002/003 glyphs, Horizon 002 dot).
- **List title + intro centred.**
- **Halo organic/cloudy**: low-frequency `feTurbulence` mask carves the uniform ring into sparse wisps; interior stays transparent; RGB=white → luminance-mask engines fall back to the full ring. **Needs Memo's eyeball** (headless globe render is flaky). Record the *why* in decisions once confirmed (revisits round-4 "no grainy milky way" — this is low-freq cloud, not grain).

#### 2. cocoex-symbol menu — *polish (built)*
- **Touches:** [index.html](index.html), [observatory.css](src/observatory/observatory.css), [observatory.js](src/observatory/observatory.js).
- **Final design (per Memo):** the coin **literally splits into three**. Closed = a circular coin whose face is three stacked arc-`.menu-slice` bands (the cocoex logo reconstructed across them). On open the slices fly apart + fade while the three real pills scale in, **centred on the coin's height** (middle pill where the coin sat). Close via Esc / click-outside.
- **Weighting:** open = `cubic-bezier(0.34,1.56,0.5,1)` (the flip-card back-out) ~0.42s, centre-out stagger; close = `cubic-bezier(0.4,0,0.2,1)` ~0.26s, no overshoot. Reduced-motion → instant.
- **State:** `initMenu` toggles `.filter-wrap.menu-open` (kept separate from the filter panel's `.is-open`) + `inert` on `#observatory-menu` + `aria-expanded`. Logo path set via `withBase()` CSS var (subpath-safe).
- **Verified:** 48/48 tests, no JS errors, ARIA + `inert` correct, closed coin + open 3-pill states screenshot clean (headless). **Pending:** Memo eyeballs the desktop left-rail split + the animation weight on Chrome/Safari.

#### 3. Canela Deck — *polish (investigate first)*
- **Touches:** [tokens.css](src/styles/tokens.css), [tile-atlas.js](src/observatory/tile-atlas.js), [globe.js](src/observatory/globe.js); maybe [index.html](index.html) + [record-template.mjs](scripts/observatory/record-template.mjs).
- **Investigation result (2026-06-23):** headless Chrome + curl both show the Typekit kit `afs8ors` **404s** → `document.fonts.size === 0` → the site currently falls back to **Georgia serif** (no `canela` face is actually loading here). Also: **Canela / Canela Deck are Commercial Type fonts, not on Adobe Fonts/Typekit** — so a kit swap can't deliver them.
- **Decision needed from Memo:** (a) confirm in the Adobe Fonts dashboard whether `afs8ors` is published + which domains it allows (it may work on the live domain but not here); and (b) provide **licensed Canela Deck `.woff2` files** to self-host (the realistic path).
- **Approach (once files arrive):** add `@font-face` for Canela Deck, then swap the family string in `tokens.css` **and** the three hardcoded JS/atlas spots (`tile-atlas.js:108`, `globe.js:306`, `globe.js:317`) together — else the baked tile labels silently won't sharpen. Drop/replace the dead Typekit `<link>` in `index.html` + `record-template.mjs`.
- **Verify:** `document.fonts.check` for the new family; tile labels re-bake sharp; body/record/flip copy render Canela Deck.
- **Notes:** family name lives in 4 places (1 CSS token + 3 JS/atlas) — change as a set.

## How we'll run each edit

1. Make the change against the dev server (hot-reload, link above).
2. Eyeball on **desktop + mobile**; Memo checks Safari (no screencapture on this host).
3. For the globe specifically, verify with headless Chrome + the `?`-gated dev hooks.
4. When it sticks: record the *why* in `decisions.md`, then `/doc-minder` to reconcile.
5. Commit only when Memo asks.

## Open questions / to confirm

- Placement: keep this at repo root, or move under `docs/` (or `docs/archive/` next to the
  living issue tracker)?
- Scope of this pass — globe-only polish, or the rail / list / record pages too?
- Any hard "don't touch" zones for this round?
