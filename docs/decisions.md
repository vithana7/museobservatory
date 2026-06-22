# Decision log

> ADR-lite. Each entry: the decision, the context, and *why*. Knowing the why lets a
> future reader judge edge cases instead of blindly following the rule. Newest section
> first. Earlier per-round build decisions live in
> [archive/build-history.md](archive/build-history.md).

## 2026-06-22 — Selection layer (layer 3) built + wired (Memo + Claude)

Locked while building + wiring the selection module (`src/observatory/selection.js`,
tested in `selection.test.mjs`; consumed by `observatory.js` `boot`/`maybeInitGlobe`/
`initFilters`). The filter UI ships as a left-edge pill → facet panel (S-2 below).

- **S-1 · Globe campaign cap = 42; muses leave the globe.** The globe is a fixed 42-vertex
  icosahedron. Muses no longer ride the globe — they live solely in the filter as the
  **"Muse"** facet — so all 42 vertices hold campaigns (`CAMPAIGN_CAP = 42`).
  *Why:* past the vertex ceiling tiles collide (`i % count`); a fixed cap keeps the globe a
  bounded render regardless of archive size (G-A/G-B). Pulling the 7 muse anchors out of the
  render reclaims their vertices for campaigns and makes the globe purely Stardust/Horizon.
  *Apply:* `sample()` defaults to 42. `buildItems()` now emits **campaign tiles only** (the
  muse-anchor prepend + the muse flip-card branch were removed). The muse facet click-to-
  filter idea is now realised *in the filter panel*, not on a globe tile.
  *Supersedes:* the earlier S-1 (cap 35, muses-on-globe), which is no longer in effect.

- **S-2 · Filter shows the TRUE matching set, never a re-sample.** Session-random sampling
  is the *initial unfiltered landing state only*. Once any filter is active, show all
  matching campaigns (up to the cap), in index order; clearing all filters restores the
  same session sample (the seed is reused). Facets are **single-select per group** (re-click
  to toggle off; picking a second value in a group replaces the first — mutual exclusion).
  *Why:* random-sampling a filtered set could hide campaigns the user explicitly asked for
  ("filter to Italy" dropping Italian campaigns) — Memo's red line.
  *Apply:* `filterCampaigns()` returns the full ANDed match, uncapped; the caller caps to
  `CAMPAIGN_CAP` for the globe and feeds the *same* set to the list so the two views agree.
  Facets ANDed: muse/type/status exact (case-insensitive). **geo = a case-insensitive REGEX**
  tested against *all* of a record's geo strings (`locations[]` + the joined `location`, plus
  structured `city`/`region`/`country` when A-1 lands); an invalid pattern (half-typed `(`)
  falls back to a literal substring so the filter never throws mid-keystroke.

- **S-3 · Filter + zoom share one left rail; panel opens to the right.** Both controls reuse
  the comet pill's beam-glow + liquid-glass look. The rail is vertically centred on the left
  edge (clears the cocoex logo); the zoom pill sits below the filter pill with inline −/+
  glyphs. The facet panel opens to the *right* of the filter pill (white liquid-glass body)
  rather than pushing the zoom down.
  *Why:* the original top-left filter overlapped the logo; a vertically-centred rail clears
  it, and a right-opening panel keeps the zoom anchored.
  *Apply:* markup in `index.html` (`.filter-wrap` rail), styles in `observatory.css`. UI
  detail, not load-bearing — restyle freely.

## 2026-06-22 — Data/backend hardening (Memo + Claude)

Making the content pipeline rock-solid for CRUD before any selection/view work.

- **D-1 · Filename is the identity authority.** `type`, `number`, `slug` are derived
  from the filename (`STARDUST001.md` → `stardust` / `1` / `stardust001`), never authored
  in frontmatter. Pattern: `(STARDUST|HORIZON)\d{3}`.
  *Why:* identity lived in three places (filename + frontmatter `slug` + the number/type
  re-encoded in the filename) with nothing enforcing agreement — a silent-drift footgun.
  One authority means rename-the-file is the *only* way to retype/renumber, and the URL
  moves with it automatically.
  *Apply:* new campaigns are named `TYPE+NNN.md`; never add `type`/`number`/`slug` to
  frontmatter (the build warns + ignores if you do).

- **D-2 · URL = lowercased filename.** `STARDUST001.md` serves at `/stardust001/`. The
  human-readable tail (`-cantine-volpi`) is dropped from the slug.
  *Why:* the slug must be 100% derivable from the filename with zero sync; a free-text tail
  reintroduces a second editable field. Uppercase on disk reads as a clear ID; lowercase
  URL stays web-conventional.
  *Apply:* the old `/stardust-001-cantine-volpi/` form is gone. No redirects built — the
  site isn't live yet, so there are no inbound links to preserve. Add redirects only if we
  ever rename a *published* slug.

- **D-4 · Assets live in `public/assets/images/<slug>/`; footage originals stay out.**
  Web-sized images served at `/assets/images/<slug>/<file>`; `hero` is a bare filename
  resolved there. Full-res originals are **not** committed or shipped.
  *Why:* the slug already names the campaign — making it the folder name removes the only
  remaining path-sync footgun, and `public/` is what Vite serves at root. The 70 MB of
  full-res footage currently in `public/` is placeholder material and the live publish
  blocker (OBS-1/2/3); shipping downscaled web images keeps `dist/` small.
  *Apply:* move referenced heroes into `public/assets/images/<slug>/`; downscale before
  they land; keep raw originals in a separate store, never the repo. Build resolves +
  existence-checks under `public/assets/images/<slug>/`.

- **D-5 · `location` is a list; build emits array + joined display.** Authored as a YAML
  list (one entry per place); `campaigns.json` carries `locations: [...]` and a `" · "`
  joined `location` string.
  *Why:* multi-place events (HORIZON002: Berlin·Krefeld·Salzburg·Tortona) can't live in one
  freeform string and still be counted/filtered. The array is the truth; the display string
  spares every view from re-joining.
  *Apply:* always a list, even for one place. A bare string is tolerated (wrapped) but warns.
  This is the *list* shape; the per-place *structured-geo* upgrade (A-1) is still deferred.

- **D-3 · Validation warns, never fails (drafts excepted).** Off-pattern filename, unknown
  muse/status, missing hero file, redundant identity fields, page-worthy-without-title →
  grouped warnings at build end; the build still completes.
  *Why:* Memo previews work-in-progress constantly; a hard fail would block iteration. The
  warnings are a to-fix checklist, not a gate. The single hard gate stays the draft/
  `[confirm]` rule (C1) — unfinished records never reach `dist/`.
  *Apply:* don't promote these warnings to errors without Memo's call; if a strict CI gate
  is ever wanted, add it as a separate `--strict` build flag, not the default.

## 2026-06-22 — Foundation review (Memo + Claude)

Sparring session that re-validated the target, goal, and architecture before building
the engineering foundation. Memo is not a software engineer; these were pressure-tested
together.

### The globe

- **G-A · Globe is the "wow" view, demoted from navigation.** It renders a bounded
  subset, never the whole archive.
  *Why:* a sphere hides half its tiles and InfiniteMenu has a hard ~42-tile ceiling; as
  an archive grows the globe can't show everything. Navigation must come from filters.
  *Apply:* never try to render all campaigns on the globe; feed it a subset.

- **G-B · Session-random sample per visit.** The globe's initial (unfiltered) state is a
  random, session-stable sample. No auth — "random per login" means per visit/session.
  *Why:* keeps the globe a fixed, performant size regardless of archive growth, and gives
  the "you happen to be on these" ambient feel Memo wants.
  *Apply:* seed once per session so tiles don't reshuffle mid-exploration; fresh next visit.

- **G-C · Grid/list is a first-class peer.** Not a hidden "fallback".
  *Why:* for *finding* and *scanning* a list is strictly better than a globe; it's also
  the accessibility + no-WebGL path. We already built it — promote it.

- **G-D · Globe device-polish is frozen** until the scaling foundation (layers 1–3)
  exists. The Safari-blur / flip / pinch rounds wait.
  *Why:* 8 rounds of polish went onto a base that didn't yet scale. Foundation before art.
  *Apply:* don't reopen blur/flip/halo work until layer 3 is built + tested.

### Backend & data

- **B-1 · Markdown is the source of truth; git-CMS is the deferred upgrade.** No server,
  no database. `campaigns.json` (compiled) is the only data payload to the browser.
  *Why:* campaigns are infrequent, curated artefacts — a server-backed CMS would be infra
  solving problems we don't have. See the full table in [architecture.md](architecture.md).
  *Apply:* if file-editing becomes the bottleneck, add Decap/Tina (web form → commits the
  same markdown), not Strapi.

- **A-1 · Structured geo.** `location` becomes `{ city, region, country, display }`;
  `region` = administrative (e.g. Piedmont); `display` = free editorial text, never parsed.
  *Why:* the old freeform string can't be filtered by country/region/city reliably.
  *Apply:* structured fields drive filters; `display` is cosmetic; degrade when fields absent.

- **A-2 · Selection layer is client-side; the build stays dumb.** `build.mjs` emits the
  *complete* `campaigns.json`. Session-random + ANDed filters run in the browser.
  *Why:* no auth/server, public site — dynamic per-session behaviour must be client-side;
  pre-baking samples would make "random per visit" impossible.

- **A-3 · Build order: schema → selection layer (built + tested) → wire views.** Art last.
  *Why:* layers 1–3 are device-independent pure logic; getting them solid + tested first
  means the visual layer can't destabilise the foundation.

- **A-4 · Sparse-set guard (open detail).** Below ~6 filtered campaigns the globe repeats
  them and looks broken. Rule TBD (present grid for that view, or pad with muse anchors).
  *Status:* to finalise when building layer 3 — see [questions.md](questions.md).

### Tooling & hygiene

- **T-1 · `dev.sh` with two modes.** `./dev.sh` (dev) + `./dev.sh preview` (real
  production build). *Why:* Memo needs to run it without a dev; preview exposes the real
  bundle / network / bloat truth.

- **T-2 · Cleanup, commit-first.** Current state is committed (recoverable), then remove
  confirmed-unused files in order. *Why:* "narrow the scope" measured, not reckless.

## Earlier decisions (Phases 1 & 3)

The original D1–D4 (domain, globe-as-index, tile taxonomy, markdown pipeline) and the
per-round build decisions (E1 clean URLs, F1→circle tiles, procedural disc, Safari LOD
bias, etc.) are preserved in [archive/build-history.md](archive/build-history.md). Note
several are superseded by the 2026-06-22 review above (e.g. globe-as-navigation → G-A).
