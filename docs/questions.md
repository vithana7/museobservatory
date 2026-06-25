# Open questions & things to sort

> The living list of what's genuinely undecided or known-broken. Locked choices live in
> [decisions.md](decisions.md); this file is only the *open* set. When a question is
> resolved, move it to `decisions.md` (with its *why*) and delete it here. Don't force
> these prematurely — an honest "TBD" beats a fake decision.

## Selection layer (layer 3) — the scaling engine

The module is **built + wired + tested** (see [frontend.md](frontend.md) and S-1/S-2/S-3
in [decisions.md](decisions.md)). The cap/muses and filter↔sample questions are resolved
(cap 42, muses moved into the filter; filter = the true set). A-4 (sparse-set fallback =
show the list, never pad) and G-C (sighted globe↔list toggle) are now resolved + built —
see the 2026-06-23 section in [decisions.md](decisions.md). What's still open:

- **Q · The `filler` tile concept.** `build.mjs` still has a `filler` notion ("globe-only
  density tile, skipped in the accessible list") — a primitive precursor to layer-3
  sampling. With sampling now in place, decide whether the selection layer subsumes it.

## Data schema

- **Q · `display` vs structured geo authority.** *Leaning (per A-1):* structured fields
  (`city`/`region`/`country`) are authoritative for filtering; `display` is free editorial
  text, never parsed. Confirm we don't want to auto-derive `display` from the structured
  fields (i.e. accept that Memo keeps them consistent, template-guided).

- **Q · Structured geo (A-1) — when to build.** Deferred. The decision is locked (A-1);
  the *build* is not scheduled — do it only when filters actually need per-place facets
  (country/region/city). Until then `location` stays the list shape (D-5).

## Known follow-ups (not blocking)

- **Q · Automate hero downscaling (`sharp`).** Authors can currently ship full-res heroes
  by hand; a build/prepare step with `sharp` (staged devDep) would prevent it. Nice-to-have
  once the foundation is locked.

- **Q · `createProgram` hardening.** `globe.js:32` skips the attach on a failed shader
  compile, then relies on `linkProgram` to fail — returns `null` correctly but double-logs.
  Tighten to bail on the first null shader. Smell, not a bug; see [frontend.md](frontend.md).

- **Q · `dispose()` listener teardown.** `dispose()` now `gl.delete*`s the textures/buffers/
  program/VAO (done 2026-06-23). Window/document listener teardown (`initGlobeZoom`/
  `initFilters`/`maybeInitGlobe`) is explicitly DEFERRED — no in-place re-init exists today,
  so it's speculative SPA plumbing; build it only if a future SPA re-inits the globe in-place.
