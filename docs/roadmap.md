# Roadmap & open questions

> What's next, in what order, and what's still genuinely undecided. Decisions already
> locked are in [decisions.md](decisions.md).

## Build order (decision A-3)

Foundation first; art last. Each step is verifiable before the next.

1. **Schema (layer 1).** Migrate `location` to structured geo (A-1) in the 2 real
   campaigns; update `build.mjs` to emit it; update `TEMPLATE.md` to guide Memo.
   Fold in the hero fix (downscaled `heroes/` images) while touching frontmatter.
2. **Selection layer (layer 3).** Build + test the client module: session-random sample,
   ANDed filters (muse/type/geo/status), sparse-set guard. Pure logic — unit-testable,
   no WebGL. *This is the scaling foundation.*
3. **Wire views (layer 4).** Connect `globe.setItems(subset)` and the grid to the
   selection layer. Promote the list to a first-class grid view (G-C).
4. **Filter UI.** The filter bar/controls that drive layer 3.
5. **Globe device-polish (unfrozen).** Resume Safari-blur / flip / pinch refinement
   (G-D lifts once 1–3 are solid). Memo's artistic pass.
6. **Homepage ticker** (later). Same `campaigns.json` feeds a news strip.

## Open questions — resolve before/when building layer 3

These are deliberately *not* decided yet. Don't force them prematurely.

### Q1 · Selection-layer semantics (the heart of scaling)
- **Sample size:** how many tiles on the globe? The geometry wants ~12–42 (the 42-vertex
  ceiling). Fixed N, or `min(all, 42)`?
- **Filter ↔ sample interaction:** when a filter is applied, does the globe re-sample from
  the filtered set, or show the *true* filtered set (up to the cap)?
  *Leaning:* random sample is only the initial unfiltered state; once a filter is active,
  show the true matching set — otherwise "filter to Italy" could randomly hide Italian
  campaigns (a usability bug, Memo's red line).
- **Sparse-set guard (A-4):** the threshold (~6?) and the fallback (grid vs pad with muse
  anchors).

### Q2 · `display` vs structured geo authority
*Leaning (per A-1):* structured fields are authoritative for filtering; `display` is free
editorial text, never parsed. Accept that Memo keeps them consistent (template guides it).
Confirm we don't want to auto-derive `display` from the structured fields.

### Q3 · The `filler` tile concept in `build.mjs`
`build.mjs` already has a `filler` notion ("globe-only density tile, skipped in the
accessible list"). It's a primitive precursor to layer-3 sampling. Decide whether the
selection layer subsumes it or keeps it.

## Known issues / publish blockers

Tracked in [archive/website-audit.md](archive/website-audit.md) (stable IDs OBS-1…13).
The live publish blockers: **OBS-1/2/3** — the 70 MB footage folder + a 19 MB hero PNG +
junk files shipping into `dist/`. Fix folds into build step 1 (heroes → downscaled
`heroes/` dir; keep raw footage out of `public/`).
