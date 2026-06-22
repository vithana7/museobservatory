# Roadmap & open questions

> What's next, in what order, and what's still genuinely undecided. Decisions already
> locked are in [decisions.md](decisions.md).

## Build order (decision A-3)

Foundation first; art last. Each step is verifiable before the next.

1. **Data foundation (layer 1–2).** Close the schema + backend contract — the plan below.
   *(Identity, validation, location-list, and asset convention are already done;
   what remains is the asset fix, tests, and downscaling.)*
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

## Data-foundation plan (closing the schema + backend tasks)

Priority = correctness + safety. Stack stays hand-rolled: **no SSG, no zod, no TS** — the
bespoke `build.mjs` is the right size for this site (evaluated + rejected alternatives).
Only additions: `node:test` (no dep), a JSDoc typedef (no dep), and `sharp` (devDep, staged).

**P0 — ship-blockers & correctness — DONE (2026-06-22)**
- **P0.1 ✓ Asset contract reconciled (D-4).** Heroes moved to `public/assets/images/<slug>/`;
  `build.mjs` resolves + existence-checks there and emits root-absolute `/assets/images/…`.
- **P0.2 ✓ Raw footage gone.** `comet-collabs/` tree removed; referenced heroes downscaled.
  `dist/` 76 MB → 8.2 MB (OBS-1/2/3 cleared).
- **P0.3 ✓ Draft gate hardened.** Stateless `hasConfirmMarker()` for detection; `CONFIRM_RE`
  `/g` kept only for the `marked` highlight. The one fail-closed gate (C1) can't drift.

**P1 — safety net & tests — DONE (2026-06-22)**
- **P1.1 ✓ `node:test` coverage** (`build.test.mjs`, `npm test`, no deps) — identity, draft
  gate, muse join, location normalization, `hasPage`, and the exact `campaigns.json` keys.
- **P1.2 ✓ Validation consolidated** into `validateCampaign()`; hero check fixed; duplicate-
  slug guard added. Warn-only (D-3).
- **P1.3 ✓ JSDoc `@typedef CampaignIndex`** next to the emit — no toolchain.

**P2 — scale (after the foundation is locked)**
- **P2.1 Automate hero downscaling with `sharp`** (build/prepare step) so authors can't ship
  full-res by hand. *(M)*
- **P2.2 Structured-geo (A-1)** — deferred; build only when filters need per-place facets.

Full audit history: [archive/website-audit.md](archive/website-audit.md) (OBS-1…13).
