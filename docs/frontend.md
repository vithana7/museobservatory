# Frontend — current spec & assessment

> How the **views** (layer 4) and the **selection layer** (layer 3, now built + wired)
> work, what's solid, and what's still open. Companion to
> [architecture.md](architecture.md) (the 4-layer model) — this doc is the layer-3/4
> detail. If something here disagrees with the code, one of them is wrong — fix it
> (`/doc-minder`).

## Scope

The frontend is everything the browser runs: the WebGL globe (the "wow" view), the
grid/list (the find/scan peer), and the generated static record pages. It consumes one
payload — `campaigns.json` — and nothing else. No framework, no router, no server calls
beyond that one fetch.

```
campaigns.json ──fetch──► observatory.js (orchestrator)
                              │
                              ├─ renderList(campaigns)      → grid/list (always built)
                              └─ maybeInitGlobe(campaigns)  → Globe.setItems(subset)
```

## The stack (verdict: appropriate)

| Choice | Where | Verdict |
|--------|-------|---------|
| Vanilla JS, no framework | all of `src/` | **Sound** at this size. Hand-rolled DOM is the cost; acceptable for a mostly-static site. |
| Vite | `vite.config.js` + `vite-plugin-observatory.mjs` | **Good fit.** Markdown pipeline runs as a build script invoked by the plugin's `closeBundle()`; dev serves generated JSON/HTML via middleware. Markdown never enters the client bundle. |
| `gl-matrix` (only client dep) | globe math | **Justified.** Tiny, math-only. Scratch objects reused per-frame to avoid GC stutter (`globe.js` animate loop). |
| WebGL2 + custom shaders | `globe*.js`, `tile-atlas.js` | **The structural risk.** Ported from reactbits InfiniteMenu; carries the 42-vertex ceiling (below) and a long device-fight history (frozen per G-D). |

## How the globe actually works

`Globe` (`src/observatory/globe.js`) renders a **fixed 42-vertex icosahedron**, confirmed:
`IcosahedronGeometry` starts with 12 vertices (`globe-geometry.js:120`), `subdivide(1)`
adds 30 deduped edge-midpoints (`globe-geometry.js:52`, `#getMidPoint` cache at `:108`) =
**42**. `instanceCount` is read straight off that geometry. Tile `i` renders item
`i % count` — in JS (`#computeInstanceColors/Scales`) and again in the shader
(`globe-shaders.js`, `vInstanceId % uItemCount`).

**Consequence:** the globe does **not** scale by adding tiles. Past the ceiling, items
collide on the same vertex or never render. This is by design (decision G-A) — the globe
is a *bounded view*, not navigation.

**The budget is the full 42 campaign slots.** Muses left the globe (decision S-1, revised):
`buildItems()` now emits **campaign tiles only** — the old 7-muse-anchor prepend was
removed — so all 42 vertices hold campaigns and `CAMPAIGN_CAP = 42`. The globe is purely
Stardust/Horizon; the muse facet moved into the filter panel.

**`setItems()` is a genuine, race-guarded seam** (`globe.js`): it swaps the item
array, recomputes per-instance colour/scale, and rebuilds the atlas, with a guard against
a newer `setItems()` racing an in-flight atlas upload (`:298`, `:324`). This is exactly
the hook the selection layer needs — **no globe changes required to filter.**

### What breaks first as the archive grows

The render cost is fixed (one `drawElementsInstanced`, 42 instances). The thing that
grows is the **tile atlas**: `tile-atlas.js` builds a `⌈√N⌉ × ⌈√N⌉` grid of 512 px cells.
The selection layer now caps the globe's input at ≤ 42 (`CAMPAIGN_CAP`), so N is bounded
and the atlas can't outgrow common GPU `MAX_TEXTURE_SIZE` limits. **The old "feed it the
whole list" risk is closed** — the globe only ever sees a bounded subset.

## The selection layer (layer 3) — built + tested

**Status: built + wired.** `src/observatory/selection.js` is the pure (no DOM/WebGL)
scaling engine, covered by `selection.test.mjs` (`node:test`, no deps — the layer-3
analogue of `build.test.mjs`). Three exports:

- `sample(campaigns, n = CAMPAIGN_CAP, seed)` — seeded Fisher–Yates shuffle (mulberry32);
  same `(campaigns, seed)` → same subset/order. Non-mutating. The seed comes from
  `makeSeed()` (sessionStorage `mo.seed`, guarded so it degrades to a fresh random in
  Node/private mode — the only impure function).
- `filterCampaigns(campaigns, { muse, type, geo, status })` — ANDed facets, returns the
  **true** match (uncapped; caller caps). muse/type/status are exact case-insensitive;
  geo is a case-insensitive **regex** over all geo fields (`geoFields()` collects
  `locations[]` + `location` + future structured `city`/`region`/`country`), with a
  literal-substring fallback when the pattern is invalid.
- `applySparseGuard(matches, threshold = 6)` — returns `{ items, sparse, threshold }`. The
  A-4 fallback is **resolved**: when a filter match is sparse, `initFilters` `apply()` forces
  the list view (`setListView(true, globe)`) — never pads the globe (decisions A-4, 2026-06-23).

Wired in `observatory.js`: `boot()` samples the landing set and calls `maybeInitGlobe()`;
`initFilters()` derives facet options from the live data, builds the filter UI, and on
every facet change recomputes the set and calls `globe.setItems()` + `renderList()` so the
globe and list always agree. Clearing all filters restores the original session sample.

### Locked semantics

See S-1/S-2 in [decisions.md](decisions.md): cap 42 (muses in the filter, not on the
globe); filter = the true ANDed set, never a re-sample, single-select per group; geo regex.
The rail composition (S-3) was reworked — Filter + List pills, gesture-only zoom — see the
2026-06-25 section.

## The grid/list — a first-class peer (globe ↔ list toggle built)

`renderList()` (`observatory.js`) runs **unconditionally** on boot and emits real semantic
markup: `<a href="/slug/">` for page-worthy campaigns, `<div>` for drafts. It is
keyboard-reachable, screen-reader-sane, and re-rendered with the filtered set so it
mirrors the globe.

The `.filter-wrap` rail now holds **two always-visible pills — Filter and List**
(`#observatory-view-toggle`). The List pill flips the page between the WebGL globe and the
list as a first-class sighted peer (G-C); one tap, no menu to open. `body.list-view` reverses
the a11y clip — restoring document flow + scroll — and hides the globe + cosmic backdrop while
the rail stays reachable. `setListView(on, globe)` is the one source of truth (freeze/thaw +
resize-on-return, aria-pressed + label swap) and is shared by both the toggle and the A-4
sparse fallback. When WebGL2 is unavailable or `prefers-reduced-motion` is set, the list is
the experience and the rail is naturally absent (`maybeInitGlobe`).

## Navigation & UX — honest verdict

**Solid.** The control rail is two always-visible pills; filters + the view toggle landed:

1. **Two control pills — Filter + List** (left rail on desktop; a bottom-centred horizontal
   row on mobile). The List pill flips globe↔list (G-C) in one tap — always reachable, no menu
   to open. (An interim coin-split menu was tried and retired; see the 2026-06-25 decision.)
2. **Filters** — the Filter pill opens a facet panel (Muse / comet-collab / Status chips + a
   Place regex box), styled as a scaled-down echo of the list page (off-white brand card);
   selecting a facet narrows the globe + list to the true matching set (S-2). Single-select
   per group with toggle-off.
3. **Zoom is gesture-only** — pinch + scroll-wheel drive `globe.setScale` (`initGlobeZoom`);
   the draggable zoom slider was retired (it duplicated the gestures and cluttered the rail).
4. **Full-page navigation tears state.** Record pages are separate static HTML; clicking
   "Explore" is a real navigation, and returning re-boots the page (fresh sample, globe
   reset, list re-render). Acceptable for now (no SPA router by design), but worth noting.

**What is already good:** interaction itself is smooth — the arcball control
(`globe-controls.js`) has quaternion drag + inertia + snap-to-tile, two-finger pinch zoom
is gated so it doesn't fight rotation, and the flip-card freezes the globe so the focused
tile can't drift (`globe.js`). Accessibility is solid: canvas is `aria-hidden`, the list is
semantic and keyboard-navigable, reduced-motion fully gates the globe.

### A correction worth recording

Earlier analysis flagged a "leaking rAF loop" and a "critical shader bug." On reading the
source, both are overstated:

- **The rAF loop already pauses when hidden.** `#frame` skips animate+render while
  `document.hidden` and only reschedules (`globe.js:365`); `dispose()` cancels the rAF and
  removes the visibilitychange listener. Under full-page navigation the browser
  tears down the whole JS context anyway — **there is no cross-navigation leak.** `dispose()`
  now also `gl.delete*`s the textures/buffers/program/VAO (done 2026-06-23); the only
  remaining deferred item is window/document listener teardown, speculative SPA plumbing
  since no in-place re-init exists today (see [questions.md](questions.md)).
- **`createProgram` (`globe.js:32`) is a smell, not a crash.** If a shader fails to
  compile it skips the attach, then `linkProgram` fails and the function returns `null`
  (`:42`) — it does not silently link garbage. Worth tightening (bail on first null) but
  not urgent.

## Open questions (carry-overs)

- **Q3 `filler` tiles:** the build's `filler` notion vs. selection-layer sampling — does
  one subsume the other? (still open — see [questions.md](questions.md).)
- **`createProgram` hardening / listener teardown:** minor smells, deferred — see
  [questions.md](questions.md).

## What's done vs. next

**Done:** the selection layer is built, tested (`npm test` green), and wired — sample on
landing, ANDed filters → true matching set, geo regex, single-select facets, muses moved off
the globe into the filter, Filter + List pills on one rail (S-1/S-2). The sighted
globe↔list toggle (G-C) and the sparse fallback (A-4) are built; build-time HTML
sanitization (SEC-1) and the Safari near-black dither (X-1) landed; GitHub Pages deploy with
a subpath-safe `base` (DEPLOY-1) is wired. Decisions in [decisions.md](decisions.md).

**Next (not yet built):**
- **Structured geo (A-1)** when filters need per-place facets — `geoFields()` already folds
  `city`/`region`/`country` in, so the regex matcher picks them up with no caller change.
- **Q3 `filler` tiles:** decide whether layer-3 sampling subsumes the build's `filler` notion.
