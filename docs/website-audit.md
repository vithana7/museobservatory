# cocoex.xyz — Living Audit & Issue Tracker

> **Purpose:** a running log of bugs, complications, perf nits, a11y gaps, and tech debt found
> while working on the site. Flag serious problems here the moment they're spotted so nothing
> gets lost between sessions. **Keep this file updated** — add new findings, move items to
> *Resolved* when fixed (don't delete; the history is useful), and bump *Last updated*.
>
> **Last updated:** 2026-06-22 (round-8 build) · branch `memo-edits-1906` (uncommitted)
> **Scope so far:** Muse Observatory page (`/observatory`) — first full audit 2026-06-22,
> + Memo's round-7 Safari/mobile eyeball review 2026-06-22 (OBS-10…13).
> **Round 8 (2026-06-22):** OBS-11/12/13 + OBS-10 addressed (flip morph rewrite, always-big card,
> curved rim title, "Explore" button, focused-tile zoom bounds + size-gap narrowed, pinch-to-zoom,
> halo dim) → all 🟡 In progress, Chrome-verified, **pending Memo's Safari/mobile eyeball**. See
> `museobservatory.md §13.23`. OBS-1/2/3 (footage bloat) still 🔴 Open.

## How to use
- Each issue has a stable **ID** (`OBS-1`, `HOME-1`, …), a **status**, a **severity**, the
  **files**, and a **fix**. Reference IDs in commits/PRs ("fixes OBS-1").
- **Status:** 🔴 Open · 🟡 In progress · ✅ Fixed · ⏸ Tracked elsewhere (link where).
- **Severity:** 🔴 High (blocks publish / breaks UX) · 🟡 Medium · 🟢 Low (nit / hygiene).
- New area → add a new `## <AREA>` section with its own ID prefix.

---

## OBSERVATORY (`/observatory`)

First audited 2026-06-22 (round-6 build, Chrome-verified, uncommitted). No hard runtime/render
bug found — atlas↔shader cell indexing, premultiplied composite, instance color/scale indexing,
and the screen-projection math all check out. Items below are real but none break the current render.

### 🔴 High

#### OBS-1 — `dist/` ships 73 MB of unused campaign footage · 🔴 Open
`dist/` is **77 MB**, of which **73 MB** is the verbatim-copied
`public/assets/images/comet-collabs/campaign-footage/` folder — 4 A4 JPEGs (~10 MB each), a 4 MB
JPG, a `.heic` Chrome can't decode, and a 1.1 MB PDF — **none referenced**. Vite copies all of
`public/` literally.
- **Fix:** curate a `heroes/` folder (or downscale only the used images) and keep the raw footage
  OUT of `public/` — move it, or add a build-time copy-exclude. Confirm `dist/` shrinks
  (`npm run build` + `du -sh dist`).
- **Blocks publish. Independent of the Safari gate — can be done anytime.**
- Files: `public/assets/images/comet-collabs/campaign-footage/`, frontmatter `hero:` in
  `content/campaigns/*.md`, `scripts/observatory/build.mjs` (hero resolution).

#### OBS-2 — Used heroes are unoptimized; one is a 19 MB PNG drawn at ~200 px · 🔴 Open
The 3 referenced heroes are 324 KB / 1.5 MB / **19 MB** (`Stardust003/HoGP.png`). The 19 MB PNG is
`drawCover`'d into a 512 px atlas cell (`tile-atlas.js`) to display at ~200 device px — and it's
*also* the hero on the Stardust-003 record page. Curating the unused footage (OBS-1) isn't enough.
- **Fix:** downscale the 3 kept heroes to ~768 px web JPEGs (use **PIL**, not ImageMagick — absent
  on this Mac). Point frontmatter `hero:` at the downscaled copies.
- Files: `content/campaigns/stardust-003-memo-x-la-luna.md` (+ stardust-001, horizon-001),
  `tile-atlas.js` (`drawCover`, `CELL`).

#### OBS-3 — Junk files in `public/` get shipped · 🔴 Open
A `.DS_Store` sits inside the footage folder; the PDF and `.heic` are also copied to `dist/`.
- **Fix:** exclude `.DS_Store`/`*.pdf`/`*.heic` from the shipped set (folds into OBS-1's curation).

#### OBS-11 — Flip card too big + text spills out of the circle · 🟡 In progress (round 8, pending Memo eyeball)
_From Memo's round-7 eyeball (2026-06-22)._ The round-6 tile-proportional sizing overshoots:
`FLIP_GROW = 1.6` floored at `FLIP_MIN_PX = 260` (`observatory.js`) makes a large card, and the
back-face copy (eyebrow + name + desc + action pill) overflows the inscribed circle — text spills
past the curve. The `-webkit-line-clamp:5` + `clamp(28px,13%,58px)` padding aren't enough at this size.
- **Fix (to discuss):** shrink the card (lower `FLIP_GROW`/`FLIP_MIN_PX`), and/or tighten back-face
  type + padding so all copy fits inside the circle at every size; consider scaling type to card size.
- Files: `src/observatory/observatory.js` (`flipCardSize`, `FLIP_GROW`, `FLIP_MIN_PX`),
  `src/observatory/observatory.css` (`.tile-flip-back`, `.tile-flip-desc`).
- **Round 8 (2026-06-22):** card now opens to a FIXED readable size (`flipCardSize` = `min(vw,vh)·0.82`,
  clamped, `FLIP_GROW`/`FLIP_MIN_PX` removed) — kept big per Memo, but the morph origin is decoupled
  (see OBS-12). Copy fits: the eyebrow moved to a curved SVG rim title (`rimSvg`), freeing the centre
  for title + summary + button. Chrome-verified (`?flipdemo`).

#### OBS-12 — Flip open/close glitches · 🟡 In progress (round 8, pending Memo eyeball)
_From Memo's round-7 eyeball (2026-06-22)._ The anchored grow/shrink (FLIP technique) glitches on
open and close — not the smooth "tile turns" it should be. The double-rAF transform mapping +
freeze/thaw timing is the suspect.
- **Fix (to discuss):** re-derive the open/close so it's a clean anchored transition; verify the
  transform/transition handoff and that `freeze()` engages before the first painted frame.
- Files: `src/observatory/observatory.js` (`openFlip`/`closeFlip`), `observatory.css` (`.tile-flip-card`).
- **Round 8 (2026-06-22):** re-derived as a flash-free FLIP — the inverted (tile-mapped) transform is
  set in the SAME task as unhide + committed with one forced reflow BEFORE any paint, so the
  un-inverted (centred, full-size) frame never paints (that one frame was the "second card on top").
  The card centres in the viewport, so the inverted transform is computed analytically (no
  getBoundingClientRect, which needed a paint). The FRONT face now mirrors the WebGL tile (hero photo +
  accent wash + label) so it grows from the SAME image, not a different disc. Chrome-verified;
  smoothness on device = Memo's eyeball.

### 🟡 Medium

#### OBS-10 — Halo too dominant · 🟡 In progress (round 8, light dim — pending Memo eyeball)
_From Memo's round-7 eyeball (2026-06-22)._ The cosmic halo reads as too big/bright over the globe.
`HALO_FIT = 0.78` (`observatory.js`) still projects from the radius-2 equator (measured ~1081px vs a
~700px frame half-width → the sphere overflows the frame at every zoom), and the gradient alphas
(`0.18`/`0.10`, `observatory.css`) may be too strong.
- **Fix (to discuss):** lower `HALO_FIT` and/or dim the gradient so the halo sits on the perceived
  cloud edge as a soft glow, not a dominant ring. Tune by eye with Memo.
- Files: `src/observatory/observatory.js` (`HALO_FIT`), `src/observatory/observatory.css` (`#observatory-halo`).
- **Round 8 (2026-06-22):** conservative dim — `HALO_FIT 0.78→0.70` + gradient alphas `0.18→0.11` /
  `0.10→0.06`. Note: the zoom rework didn't change the sphere silhouette (the `0.35` framing factor is
  unchanged), so this is independent. Memo didn't raise the halo this round → left light; confirm by eye.

#### OBS-13 — Mobile: no pinch-to-zoom · 🟡 In progress (round 8, pending device test)
_From Memo's round-7 ask (2026-06-22)._ Trackpad pinch works (wheel+ctrl) and the zoom pill works,
but touch devices have no native two-finger pinch to zoom the globe — the expected mobile gesture.
- **Fix (to discuss):** add a 2-pointer pinch handler that maps finger-distance delta to the same
  zoom `frac`/scale the pill drives. `ArcballControl` currently consumes single-pointer rotate; the
  pinch must coexist with (suppress) rotation while two fingers are down.
- Files: `src/observatory/globe-controls.js` (`ArcballControl` pointer handling) and/or
  `src/observatory/observatory.js` (`initZoomControl` zoom seam, `globe.setScale`).
- **Round 8 (2026-06-22):** added — 2 touch pointers on the canvas drive the same `frac` as the
  pill/wheel (`initZoomControl`); `ArcballControl.paused` suppresses rotate while two fingers are down.
  Pinch out → zoom in, pinch in → zoom out (log2 ratio). Needs Memo's on-device test (not headless-testable).
  Related: the zoom RANGE was reframed this round so the focused tile stays in frame at max-in and isn't
  tiny at max-out (Memo's separate ask) — `MIN/MAX` in `initZoomControl` + `SIZE_BY_KIND` in `globe.js`.

#### OBS-4 — Flip overlay has no modal a11y plumbing · 🟡 Open
The tile flip-card is a real interactive overlay (contains a live `View record →` link) but, unlike
the homepage muse popup, has: no `role="dialog"`/`aria-modal` on `#observatory-flip`; no focus moved
into the card on open / restored on close; no focus trap; **no visible close button** (only Escape /
backdrop-click).
- **Mitigated** (not eliminated): canvas is `aria-hidden`, tiles aren't focusable, and the same
  record links exist in the accessible list (the declared source of truth) → keyboard/SR users have
  a parallel path.
- **Fix:** reuse the existing `createFocusTrap` / `wireModalDismiss` from `src/ui/focus-trap.js`
  (drop-in — the muse popup already uses it); add a small close affordance for touch users.
- Files: `src/observatory/observatory.js` (`openFlip`/`closeFlip`/`initFlip`),
  `observatory/index.html` (`#observatory-flip`), `src/observatory/observatory.css`.

### 🟢 Low

#### OBS-5 — Per-frame GC allocations outside the optimized path · 🟢 Open
`#animate` was deliberately de-allocated into a `_scratch` object, but three hot paths still
allocate every frame (same Safari-GC-stutter class the scratch fix targeted):
- `getSphereScreenRadius()` — a `mat4` + 2 `vec4` each frame (called from the halo `onFrame`).
- `#onControlUpdate()` — `vec3.create()` per frame.
- `#findNearestVertexIndex()` — `quat` + `vec3` each idle frame.
- **Fix:** give these reused scratch objects too. Files: `src/observatory/globe.js`.

#### OBS-6 — Two un-removed `window` resize listeners · 🟢 Open
One in `maybeInitGlobe`, one in `initZoomControl` — harmless, mergeable. Files: `observatory.js`.

#### OBS-7 — Global `wheel` hijack never torn down · 🟢 Open
`observatory.js` adds a `passive:false` `preventDefault` wheel listener on `window`; `Globe.dispose()`
exists but is never called and doesn't cover page-level listeners. Fine for a single static page;
latent leak if the globe ever re-inits. Files: `observatory.js`.

#### OBS-8 — Stale comments · 🟢 Open
- `globe.js` header describes a per-instance `aIsCircle` flag (muse=circle/campaign=square) that no
  longer exists — everything is circle-clipped now.
- `tile-atlas.js` says hero photos are "none yet" — round 6 added them.
- (Doc-level: `CLAUDE.md` still says `vite.config` `base: './'`; it's now `'/'` for the nested
  `/observatory/` path — intentional, see the `E1` comment in `vite.config.js`.)

#### OBS-9 — `esc()` omits the single-quote · 🟢 Open
`esc()` (`observatory.js`) escapes `& < > "` but not `'`. No actual risk today — all interpolated
values are owner-authored frontmatter into double-quoted attributes — but it'd bite if an attribute
is ever templated with single quotes.

### ⏸ Tracked elsewhere (not audit findings — listed so they're not re-flagged)
- **Safari symbol blur** — the probe4 gate. See `observatory-round8-handoff.md` + `museobservatory.md` §13.22.
- **`HERO_TINT_ALPHA`** tunable — awaits Memo's eye (photo wash strength).
- (Halo / flip moved from "tunable" to active issues OBS-10/11/12 after Memo's round-7 review.)

---

## HOMEPAGE (`/`)
_No audit run yet. Add `HOME-n` issues here when found._

---

## BUILD / TOOLING
_No audit run yet. Add `BUILD-n` issues here when found._

---

## Resolved
_Move fixed items here with the fix commit/date — keep the record._

(none yet)
