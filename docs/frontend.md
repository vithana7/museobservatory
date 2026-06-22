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
- `applySparseGuard(matches, threshold = 6)` — detection only (`{ items, sparse, threshold }`);
  the A-4 fallback policy is still open (see below).

Wired in `observatory.js`: `boot()` samples the landing set and calls `maybeInitGlobe()`;
`initFilters()` derives facet options from the live data, builds the filter UI, and on
every facet change recomputes the set and calls `globe.setItems()` + `renderList()` so the
globe and list always agree. Clearing all filters restores the original session sample.

### Locked semantics

See S-1/S-2/S-3 in [decisions.md](decisions.md): cap 42 (muses in the filter, not on the
globe); filter = the true ANDed set, never a re-sample, single-select per group; geo regex;
filter + zoom share one left rail with the panel opening to the right.

### Still open

- **Sparse-set guard (A-4):** below ~6 matches the globe repeats tiles and looks broken.
  `applySparseGuard` *detects* it; the fallback (show the grid, or pad) is unfinalised.

## The grid/list — first-class in code, second-class on screen

`renderList()` (`observatory.js`) runs **unconditionally** on boot and emits real semantic
markup: `<a href="/slug/">` for page-worthy campaigns, `<div>` for drafts. It is
keyboard-reachable, screen-reader-sane, and now re-rendered with the filtered set so it
mirrors the globe.

**But there is still no visible way to switch to it while the globe is up.** When the globe
is active the list is CSS-clipped to a 1px a11y-only sliver (`observatory.css`), kept in the
accessibility tree but invisible to sighted users. The list becomes the real experience
*only* when WebGL2 is unavailable or `prefers-reduced-motion` is set (`maybeInitGlobe`). So
the decision to make it a first-class peer (G-C) is **half-done**: the code is there, the
sighted globe↔list toggle UI is not.

## Navigation & UX — honest verdict

**Improving.** The filters landed this session; the remaining gaps:

1. **No view toggle (globe ↔ list).** Sighted users on a modern browser still can't reach
   the list view. Now the top remaining UX gap (filters are no longer the gap).
2. **Filters now exist** (was the prior top blocker). A left-rail pill opens a facet panel
   (Muse / comet-collab / Status chips + a Place regex box); selecting a facet narrows the
   globe + list to the true matching set (S-2). Single-select per group with toggle-off.
3. **Full-page navigation tears state.** Record pages are separate static HTML; clicking
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
  removes the visibilitychange listener (`:400`). Under full-page navigation the browser
  tears down the whole JS context anyway — **there is no cross-navigation leak.** The only
  real (minor) gap: `dispose()` doesn't `gl.delete*` textures/buffers — irrelevant today,
  would matter only in a future SPA that re-inits the globe in-place.
- **`createProgram` (`globe.js:32`) is a smell, not a crash.** If a shader fails to
  compile it skips the attach, then `linkProgram` fails and the function returns `null`
  (`:42`) — it does not silently link garbage. Worth tightening (bail on first null) but
  not urgent.

## Open questions (carry-overs)

- **A-4 sparse-set guard:** threshold (~6?) and fallback (show grid, or pad). Detected by
  `applySparseGuard`; policy unfinalised — see [questions.md](questions.md).
- **Sighted globe↔list toggle:** the list is still a11y-only while the globe is up; G-C
  (list as first-class peer) is half-done.
- **Q3 `filler` tiles:** the build's `filler` notion vs. selection-layer sampling — does
  one subsume the other? (still open — see [questions.md](questions.md).)

## What's done vs. next

**Done (this session):** the selection layer is built, tested (`npm test` green), and wired
— sample on landing, ANDed filters → true matching set, geo regex, single-select facets,
muses moved off the globe into the filter, filter + zoom on one left rail. The old
Milestone-1 "lock the selection layer" plan is complete; its decisions live in
[decisions.md](decisions.md) (S-1/S-2/S-3).

**Next (not yet built):**
- A sighted **globe↔list view toggle** (close the G-C gap).
- **Finalise the A-4 sparse-set fallback** (currently detection-only).
- **Structured geo (A-1)** when filters need per-place facets — `geoFields()` already folds
  `city`/`region`/`country` in, so the regex matcher picks them up with no caller change.
