# Decision log

> ADR-lite. Each entry: the decision, the context, and *why*. Knowing the why lets a
> future reader judge edge cases instead of blindly following the rule. Newest section
> first. Earlier per-round build decisions live in
> [archive/build-history.md](archive/build-history.md).

## 2026-06-25 — Layer-4 art pass: controls, flip, tint (Memo + Claude)

The G-D freeze condition is **satisfied** — layers 1–3 are built, tested, and wired — so this
is the sanctioned "art last" phase (A-3 / G-D). The below is layer-4 polish in the working
tree; exact colour/size values stay eyeball-tunable, but the decisions (the *what* + *why*)
are settled.

- **V-1 · Controls = two always-visible pills (Filter + List); zoom is gesture-only.** The
  left rail (a bottom-centred row on mobile) holds just the Filter pill and the List toggle,
  both always visible — no menu to open. The draggable zoom slider is gone; pinch + scroll-
  wheel still drive `globe.setScale`.
  *Why:* an interim "coin" that split into Filter/Zoom/List buried the List behind an open step
  and spent ~0.6s of motion on a 3-item menu; once zoom proved redundant (the gestures already
  cover it) only two controls remained, for which a splitting menu isn't worth the friction —
  and a one-tap List is the reachability win the a11y review asked for.
  *Apply:* `index.html` `.filter-wrap` holds `.filter-control` + `.view-pill` directly;
  `observatory.js` dropped `initMenu` + the liquid-blob animation, renamed `initZoomControl` →
  gesture-only `initGlobeZoom`, and moved the per-pill muse colours to `initPillColours`.
  *Supersedes:* **S-3** (filter + zoom on one rail) — zoom left the rail; the panel still opens
  to the right on desktop, centred on mobile.

- **V-2 · Filter popup mirrors the LIST PAGE (brand surface), not a dark glass panel.** The
  facet panel is a scaled-down echo of the accessible list: off-white paper, brand serif,
  muse-glyph chip markers, hairline group dividers, a feTurbulence grain, rounded corners.
  *Why:* the dark liquid-glass panel read as a SaaS filter; the list page is the canonical
  on-brand surface (cocoex Brand Rules: off-white/ink, space as separator, no boxes), so the
  popup should feel like a small-press monograph card.
  *Apply:* `.filter-panel*` in `observatory.css`; chips emit the masked muse glyph (`chip()` in
  `observatory.js`). The control-pill labels match (serif eyebrow treatment); the Filter pill
  goes matte black while its panel is open (`aria-expanded`).

- **V-3 · Flip morph sizes to the VISIBLE disc; the tile is hidden through the motion.** The
  DOM flip-card grows from / lands on the tile's *rendered* disc, not the flat-quad radius —
  `DISC_VISIBLE_K` (≈1.7) scales the anchor (the spherised disc renders ~that much larger, the
  same fudge the tap hit-test uses). The WebGL tile stays hidden (`body.flip-open`) for the
  whole open + close motion and is hidden/revealed **instantly** at the endpoints.
  *Why:* sizing to the raw `getActiveTileScreen().r` made the card ~half the tile → a nested
  "two discs" on close; drawing both card + tile during the motion double-ringed them. Hiding
  the tile through the motion (only the card paints) + an instant, size-matched hand-off makes
  open/close read as one object.
  *Apply:* `openFlip`/`closeFlip` in `observatory.js`.

- **V-4 · Hero colour = duotone (`color` blend) + a scrim behind the label.** The muse tint
  over a campaign hero is a `color` blend at ~0.85 (recolours the photo into the muse hue,
  keeping its luminance + texture) rather than a flat ~0.5 wash; a soft radial scrim seats the
  centred white label. Kept **identical** on the WebGL tile (canvas `globalCompositeOperation`)
  and the flip card (CSS `mix-blend-mode`) so the morph hand-off shows no tint jump.
  *Why:* a flat wash read dull and `multiply` muddied; `color` makes the muse shade strong +
  intentional (editorial duotone) while keeping photo detail — but it keeps the photo bright,
  so the label needs the scrim back.
  *Apply:* `HERO_TINT_ALPHA` + the radial scrim in `tile-atlas.js`; `.tile-flip-hero-wash` +
  `.tile-flip-front.has-hero::before` in `observatory.css`. The two alphas must stay in sync.

- **V-5 · Globe tiles +10%.** `baseScale` 0.25 → 0.275 so the disc cloud fills more of the
  sphere (less negative space). *Why:* Memo — the tiles read sparse. *Apply:* `globe.js`
  `#animate`. Verify they don't bleed past the halo at the limb.

## 2026-06-23 — Hardening fixes: sparse guard, view toggle, build-time sanitize (Memo + Claude)

Closing out the open A-4 / G-C questions and adding a build-time XSS guard.

- **A-4 · Sparse-set fallback = show the LIST, never pad the globe.** When a filter matches
  fewer than the threshold (`applySparseGuard`, default 6), the globe would repeat tiles and
  look broken, so we force the list view instead. We do NOT pad with placeholder/muse tiles.
  We also never forcibly switch BACK to the globe when matches are plentiful — the user's
  chosen view is respected once they've toggled.
  *Why:* padding fabricates archive entries that aren't real matches (dishonest); the list is
  already the honest, complete view of the matched set, so falling back to it is truthful.
  *Apply:* `observatory.js` `initFilters` `apply()` calls `setListView(true, globe)` when
  `active && applySparseGuard(matched).sparse`. Detection stays in `selection.js`.

- **G-C · Sighted globe ↔ list toggle built.** A List pill in the `.filter-wrap` rail
  (`#observatory-view-toggle`) flips the page between the WebGL globe and the accessible
  list as a first-class sighted peer. `body.list-view` reverses the a11y clip (restores
  document flow + scroll) and hides the globe + cosmic backdrop; the rail stays reachable.
  *Why:* the list was rendered + kept in sync but only reachable as an a11y-only clipped
  sliver — the "first-class peer" decision (G-C) was half-done.
  *Apply:* `setListView(on, globe)` is the ONE source of truth (freeze/thaw + resize on
  return, aria-pressed + label swap); used by both the toggle and the A-4 fallback. The pill
  is naturally absent in reduced-motion / no-WebGL2 mode (the rail is hidden until
  `.globe-active`, only added on the globe path).

- **SEC-1 · Build-time HTML sanitization (DOMPurify).** Markdown bodies are sanitized with
  `isomorphic-dompurify` (default profile) AFTER `marked.parse` and BEFORE the `[confirm]`
  highlight injection; the `[confirm]` note text is HTML-escaped. DOMPurify is a **devDep,
  build-time only** — same model as `marked`/`gray-matter`, never shipped to the client.
  *Why:* an authored markdown body could otherwise smuggle `<script>`/event handlers into a
  static record page. Sanitizing at build keeps the client bundle parser-free.
  *Apply:* `scripts/observatory/build.mjs` `generateObservatory()`; `esc` is now exported
  from `record-template.mjs` and reused. Verified the parser/sanitizer don't leak into
  `dist/assets/*.js`.

- **X-1 · Cross-browser fix = in-shader ordered dither (not a CSS-only patch).** Safari
  rendered the near-black cosmic backdrop visibly grainier/banded than Chrome. Root cause:
  8-bit backbuffer banding in the near-black gradients (brightness ~0.003–0.05), which
  Chrome dithers and Safari does not — amplified by the cloud's CSS `brightness()` lift and
  stacked `mix-blend-mode`. Fix: a shared GLSL `DITHER` chunk adds ±1 LSB ordered dither
  before the 8-bit write in `INTRO_FRAG`/`STARFIELD_FRAG`, and the cloud filter is softened
  (`brightness(1.5→1.25)`, `blur(2→3px)`).
  *Why:* the banding is a quantization artefact at the GPU write, so the durable fix lives in
  the shader (device-independent), not in a per-browser CSS hack. The control system also
  went dark-glass (filter/zoom/view pills + panel) so it reads on the dark backdrop.
  *Apply:* `src/webgl/shaders/glsl-utils.js` exports `DITHER`; `intro-frag.js` applies it.
  Verify in BOTH Safari (Memo eyeballs) and headless Chrome. This is a one-off cross-browser
  correctness fix, NOT a reopening of the frozen globe device-polish (G-D still holds).

- **DEPLOY-1 · GitHub Pages via Actions; base is conditional for the project subpath.** The
  site deploys to `vithana7.github.io/museobservatory/` through a GitHub Actions workflow
  (`.github/workflows/deploy.yml`: `npm ci` → `npm test` → `npm run build` → deploy `dist/`).
  Vite `base` is `/museobservatory/` when `GITHUB_PAGES=1` (the workflow sets it) and `/`
  otherwise (local dev + the custom domain).
  *Why:* the build is static-output, so Pages needs no runtime — it serves `dist/`. A project
  repo without a custom domain serves under `/<repo>/`, so a hardcoded `base:'/'` would 404
  every asset; making it conditional keeps local dev and a future custom-domain move at root.
  The `npm test` gate means a content/markdown change that breaks a test blocks the deploy
  rather than shipping broken.
  *Apply:* paths Vite can't rewrite (they live in JSON/JS, not HTML) are re-rooted at runtime
  against `import.meta.env.BASE_URL` — `observatory.js` maps `campaigns.json` `url`/`hero`
  via `withBase()`; the record-page template takes `base` (back-link + favicon) threaded from
  the Vite plugin's `config.base`. **Enabling Pages itself (Settings → Pages → Source: GitHub
  Actions) is an admin toggle, not in the repo** — a collaborator can't flip it.

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
  *Superseded 2026-06-25 (V-1):* zoom left the rail (gesture-only); the rail now holds the
  Filter + List pills, and the facet panel is an off-white brand card (V-2), not dark glass.

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

- **A-4 · Sparse-set guard.** Below ~6 filtered campaigns the globe repeats them and looks
  broken. *Resolved 2026-06-23:* the fallback is **show the list, never pad** — see the
  2026-06-23 section above.

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
