# Muse Observatory — Build History (ARCHIVE)

> **⚠ ARCHIVE — history, not current spec.** This is the original living plan + the 8
> rounds of globe iteration, kept verbatim for context. For *what is true now* read
> [../architecture.md](../architecture.md), [../data-schema.md](../data-schema.md), and
> [../decisions.md](../decisions.md). Several decisions below are **superseded** by the
> 2026-06-22 foundation review (notably: globe-as-navigation → demoted to a "wow" view;
> see decisions G-A…D).

> **Original status:** PLANNING. Nothing built yet. This is the sign-off doc — we talk it out here, lock decisions, *then* implement.
> Last updated: 2026-06-19. Owner: Memo + Claude. Branch: `memo-edits-1906`.

The Muse Observatory is cocoex's **campaign archive** — the destination of the "Explore campaigns" CTAs in the Comet section. Every Stardust (artist-led) and Horizon (community-led) campaign lives here as a long-form record. The index is a WebGL globe; each record is a shareable article built from the canonical Stardust/Horizon format.

---

## 1. Decisions locked

| # | Decision | Choice |
|---|----------|--------|
| D1 | **Domain** | NOT a new domain / subdomain. A second page in the *same* Vite project at **cocoex.xyz/observatory** (Vite multi-page entry — `observatory.html` + `src/observatory/`). Shares tokens, fonts, starfield; keeps JS out of the homepage bundle. |
| D2 | **Index visual** | **WebGL globe** — port of reactbits `InfiniteMenu` (raw WebGL2 + `gl-matrix`, the renderer is a standalone class; we drop the React wrapper). On-brand with the cosmic site. |
| D3 | **Globe tiles** | **Muse anchors + campaign snaps both.** 7 permanent muse tiles (white symbol on coloured disc — assets already exist) = always-present anchors AND the cause filter. Real campaigns appear as photo-tiles (their hero image) clustered near their muse's colour. Globe is never empty. Tile type is **shape-coded — muse = CIRCLE, campaign = SQUARE** (see §3). |
| D4 | **Content pipeline** | **Markdown file → auto-build.** One `.md` per campaign (YAML frontmatter = metadata block, markdown body = prose). Build step generates the index data + a static record page per campaign. New campaign = copy template, fill, rebuild. |

**Single source of truth chain:** one `campaigns/*.md` → `campaigns.json` index → (a) globe tiles, (b) record pages, (c) homepage "ongoing/past/future" news ticker under the Comet steps. Write once, three surfaces.

---

## 2. The two reference components (reality check)

Both are **React**; this codebase is strict vanilla JS ("never add frameworks"). So they're *ported*, not dropped in.

- **InfiniteMenu (chosen):** raw **WebGL2** + `gl-matrix` (tiny, math-only — not a framework). Renderer is a standalone `InfiniteGridMenu` class (~350 lines WebGL/shader, ~50 lines React glue we discard). Items: `{ image, link, title, description }`. Ports ~1:1.
- **DomeGallery (not chosen for index):** CSS 3D + `@use-gesture/react`. Parked. Could become a per-muse drill-down later if the globe ever feels too dense.

**New dependencies this introduces (all acceptable, all flagged):**
- `gl-matrix` — client, math only, for the globe.
- `gray-matter` + `marked` (or similar) — **build-time only**, to parse frontmatter + render markdown. Never shipped to the client if we pre-render (see §5).
- NONE are UI frameworks. No React, no Vue.

---

## 3. Information architecture

```
cocoex.xyz/observatory                    ← index: the globe + filter bar
   ├── filter: muse cause   (via the 7 muse anchor tiles + bar)
   ├── filter: type         (Stardust / Horizon)
   ├── filter: status       (ongoing / past / upcoming)
   │
   └── cocoex.xyz/observatory/<slug>      ← one record page per campaign
            e.g. /observatory/stardust-001-cantine-volpi
                 /observatory/horizon-001-future-lab
```

**Tile taxonomy on the globe (RESOLVED — shape-coded):**
InfiniteMenu is built for *homogeneous* tiles, so the two kinds are distinguished by **shape**, reusing the site's existing grammar (orbit dots, orbit cards, the popup disc are all circular):
- **Muse anchor tile → CIRCLE.** Muse symbol on its coloured disc. *Circular-alpha texture* — the disc PNG's corners are transparent, so a square quad reads as a circle; **no new geometry needed.** Click = *filter the globe to that cause* (stays on the page). Focused state shows the cause name + a filter affordance.
- **Campaign tile → SQUARE.** Full-bleed hero photo. Click = *go to the record page*. Focused state shows title/year + a view affordance.

Shape encodes type instantly; circle already means "muse" everywhere on the site. (Note: the focused-tile copy + action thus **differ by type** — a small fork in the ported InfiniteMenu focus handler.)

---

## 4. Data schema (frontmatter) — derived from your format

Cause + colour are **derived from the muse** (reuse the `MUSES` map / 7 hexes already in `src/data.js`) so you never retype them per campaign. The factual block lives in frontmatter (structured → drives tiles, cards, the record sidebar, the ticker); the narrative sections live in the markdown body.

**Shared fields (both types):**
```yaml
type: stardust | horizon
number: 1
slug: stardust-001-cantine-volpi      # also the URL + filename
title: Cantine Volpi
muse: rabu                            # → cause + hex from MUSES map
status: closed | ongoing | upcoming   # → past / ongoing / future filter
year: 2025
location: Volpedo, Alessandria · Italy
hero: cantine-volpi-hero.jpg          # the globe tile image (else images[0])
images: []                            # record-page gallery
```

**Stardust factual block:**
```yaml
artist: Memose Vithana (Memo)
partner: Cantine Volpi, Volpedo
ngo: Anffas Tortona
fundSplit: 50% artist / 50% NGO       # per-cycle, not a programme default
fundsRaised:                          # [confirm]
transferred: { amount: €2,500, to: Anffas Tortona, date: 2025-12-11 }
event: { name: , date: , location: Cantine Volpi · Volpedo }   # [confirm]
```

**Horizon factual block (adds the participatory fields):**
```yaml
host: Pro Loco Carezzano
partner: Slow Food Tortona
festival: { name: Vinili e Vinelli, date: September 2024, location: Carezzano }
embeddedArtist: Memose Vithana (Memo)
participants: { total: 34, community: 33, embeddedArtists: 1, nationalities: 10 }
question: How do we imagine models of sustainable tourism for the Colli Tortonesi?
```

**Body (markdown) = the narrative sections from your format:**
- Stardust: *The work · The event · The Comet · Impact · Images*
- Horizon: *The question · The Future Lab · What the community proposed · The artworks · The report · What came after · Impact · Images*

(The "campaign" factual block is rendered from frontmatter, not written in the body — keeps every record consistent and machine-readable. The `[confirm]` items from your draft stay as confirms until verified.)

---

## 5. Build pipeline (the "effortless insert")

Recommended: **pre-rendered static HTML per campaign** (best for SEO + clean shareable URLs — each record is a public artifact about an artist/NGO/impact). A small Node build script runs as part of `npm run build` (+ a dev watcher):

```
content/campaigns/*.md
        │  (gray-matter + marked, build-time)
        ▼
   ┌─────────────────────────────┐
   │ campaigns.json  (index data)│ → globe tiles, filters, homepage ticker
   │ observatory/<slug>.html     │ → one static record page each
   └─────────────────────────────┘
```

- Frontmatter → metadata header + factual block + tile data.
- Body markdown → the article.
- Muse cause/colour → joined from the `MUSES` map at build (no duplication).

**Alternative considered:** one record page + client-side render from `campaigns.json` (simpler build, worse SEO, uglier URLs). → recommend AGAINST for public campaign pages.

**Later (optional):** Decap or TinaCMS gives Memo a no-code form that *commits the same markdown* — layers on without changing the source of truth. Not in initial scope.

---

## 6. Filters

Three facets, ANDed:
- **Muse cause** — driven by the 7 muse anchor tiles on the globe (click a muse → globe filters to its campaigns) + mirrored in the filter bar.
- **Type** — Stardust / Horizon.
- **Status** — ongoing / past / upcoming (`status` field: `ongoing` / `closed`→past / `upcoming`→future).

Filtering = re-feed the globe a filtered `items` subset. → **OPEN Q:** transition when the set changes (re-instantiate vs animate tiles out/in).

---

## 7. Homepage tie-in — the "news ticker"

Your idea: ongoing/past/future eventually shown as **running text under the Comet Stardust/Horizon steps**, like a news strip. Same `campaigns.json` feeds it — filter by `type` (stardust vs horizon) + `status`, render a marquee/list under the relevant step. No second data source. (Separate, later phase.)

---

## 8. Open questions (talk these out next)

1. ~~Tile interaction / visual distinction / clustering~~ — **RESOLVED:** shape-coded (circle = muse/filter, square = campaign/record; see §3); campaign squares **distribute evenly** on the sphere (InfiniteMenu's natural icosahedral grid), colour-tagged to their muse — NOT clustered hub-and-spoke.
2. **Record page URL/slug:** `/observatory/stardust-001-cantine-volpi` — good, or a shorter scheme?
3. **Record page render:** pre-rendered static HTML per campaign (recommended, §5) — confirm.
4. **Filter bar:** does cause live ONLY on the globe (muse tiles), or also as chips in a top bar alongside Type + Status?
5. **Accessibility (required, not optional):** a WebGL canvas is invisible to screen readers + keyboard. We MUST ship a parallel accessible campaign **list view** (also doubles as the reduced-motion + low-power fallback). Confirm we build it from day one.
6. **Globe density:** 7 muses + **5 campaigns (2 closed + 3 upcoming)** = 12 tiles at launch — healthy for a globe; the empty-globe worry is gone. (Still worth a mock before building.)
7. **Mobile:** globe drag vs page scroll on touch; record pages are long-form (fine).
8. ~~Upcoming campaigns~~ — **RESOLVED:** tile **always** (muse-colour placeholder square, no snap yet, marked "soon"); **page is optional / content-driven** — a teaser page is created only when there's public-ready content, otherwise the tile doesn't navigate. Schema degrades gracefully (§10).
9. ~~Horizon 002~~ — **RESOLVED** (Memo, 2026-06-19):
   - **Muse/cause** — deliberately **left blank for now.** The Open Charter isn't a final draft and the muse is a *conceptual* layer mentioned later — it's assigned once the charter firms up. Schema must allow no muse (see no-muse fallback below).
   - **Brand-voice** — confirmed: **keep technical terms (blockchain / DAO / decentralised) OUT of public copy for now.** Blockchain carries a bad rep; cocoex is building concrete use-cases and will introduce the technical layer *gently, later*. Tell H002 via the **Future Labs / Robert Jungk Zukunftswerkstatt / art-in-the-loop / "human as the primary instance"** lens. General principle, not just H002 — see memory `blockchain-introduce-gently-later`.
   - **Privacy** — working material (protocols, names, emails) stays **INTERNAL**; never published, not in the repo.
   - **No-muse fallback** — an entry with no `muse` → **neutral placeholder tile** (not a muse hue), excluded from cause filters until a muse is assigned.

---

## 9. Proposed build order (phases)

| Phase | Deliverable |
|-------|-------------|
| 0 | Lock schema (§4) + write the 2 real campaign `.md` files (content, with `[confirm]`s) + a `TEMPLATE.md`. |
| 1 | Build pipeline: `md → campaigns.json + static record pages` (§5). |
| 2 | Record page design (Stardust + Horizon layouts, muse-colour accent). |
| 3 | Observatory index: port the globe (muse anchors + campaign tiles) + accessible list fallback. |
| 4 | Filters (cause via muse tiles + bar; type; status). |
| 5 | Wire both "Explore campaigns" CTAs → `/observatory`; homepage news ticker. |
| 6 | (Optional, later) Decap/Tina no-code editing layer. |

---

## 10. Risks / notes

- **Tile-type ambiguity** (§3) — the main UX risk; needs a clear visual language.
- **Accessibility** — globe needs the parallel list (§8.5). Non-negotiable for a public archive.
- **gl-matrix** — new client dep (tiny, math-only).
- **Empty-globe** — solved by D3 (muses always present), but density still needs a mock (§8.6).
- **Separate page = separate WebGL context** — the homepage's Safari 8-context budget doesn't apply on `/observatory`; the globe lives alone there.
- **Reduced-motion** — list fallback covers it; globe should also offer a static/non-spinning state.
- **Sparse/upcoming entries** — the schema + record template must **degrade gracefully** when fields are empty (upcoming campaigns have no hero, funds, or Impact yet). Render only the sections that have content; don't show empty headers. Upcoming tiles fall back to a muse-colour placeholder square (§8.8).
- **Internal vs public content** — campaign source material can contain PII (names, emails, meeting notes — e.g. Horizon 002). Only curated, public-ready prose goes into `content/campaigns/*.md`. Internal coordination docs stay out of the repo.
- **Muse-less entries** — `muse` may be blank (early-stage campaigns; cause assigned later). Tile → neutral placeholder; excluded from cause filters until assigned. Don't assume every campaign has a muse.

---

## 11. Campaign backlog (content)

Phase 0 writes these. `[confirm]` = unverified; muse → cause + hex via the `MUSES` map.

| Slug | Type | # | Muse (cause) | Status | Notes |
|------|------|---|--------------|--------|-------|
| `stardust-001-cantine-volpi` | Stardust | 001 | Rabu · Human Rights | closed | Full record (from draft). NGO Anffas Tortona; €2,500 transferred 2025-12-11. |
| `horizon-001-future-lab` | Horizon | 001 | Solis · Well-being | closed | Full record (from draft). Slow Food Tortona; 34 participants, 10 nationalities. |
| `stardust-002-practicing-futures` | Stardust | 002 | Solis · Well-being | upcoming | Group show "Practicing Futures" @ Vinili e Vinelli; NGO Terra Nuda. Stub. |
| `stardust-003-memo-x-la-luna` | Stardust | 003 | Shukra · Bio-diversity | upcoming | "Memo × La Luna"; NGO Repair Together (Ukraine). Stub. |
| `horizon-002-open-charter` | Horizon | 002 | **[confirm]** | upcoming | Consortium w/ Robert-Jungk-Bibliothek: 4 Future Labs in 4 countries (Berlin · Krefeld · Salzburg · Tortona), pilot mid-2027. **Tile-only stub** — see §8.9 (muse + brand-voice + privacy unresolved). |

---

## 12. Phase 1 — build pipeline (BUILT 2026-06-19 · verified)

> **Status: DONE & verified** (build + dev both proven). Decisions locked: **A1** (read
> tokens.css for hexes), **B1** (Vite plugin), **C1** (build pages but keep drafts dev-only/
> unlinked), **D → deferred** (globe shell is Phase 3). New devDeps: `gray-matter`, `marked`.
>
> **Shipped:** `scripts/observatory/build.mjs` (generator), `scripts/observatory/record-template.mjs`,
> `src/observatory/record.css`, `vite-plugin-observatory.mjs` (wired in `vite.config.js`).
> `npm run build` → `dist/observatory/campaigns.json` + `dist/observatory/<slug>/index.html` (non-draft only).
> `npm run dev` → serves `/observatory/campaigns.json` + `/observatory/<slug>/` from memory (drafts incl. for preview), live-reloads on `content/` + `record.css` edits.
>
> **Current state of the 5 campaigns:** both "full" records (stardust-001, horizon-001) still
> carry `[confirm]` → classed **draft** → **0 record pages in a production build**; preview them in
> `npm run dev`. They auto-publish once the `[confirm]`s are resolved. The other 3 are tile-only.
>
> **⚠ Content flag (not code):** `horizon-002` `title` is still *"Open Charter for Decentralised
> Futures"* — that title (with "Decentralised") is now in `campaigns.json` and would show on the
> globe. Pick a voice-safe public title before the globe ships (plan §8.9).

> Goal: `content/campaigns/*.md` → `campaigns.json` (index) + one static record page per
> *page-worthy* campaign. Build-time markdown only; **no parser shipped to the client.**

### 12.0 Critique fixes folded in (corrections to earlier sections)
- **§4 hex claim is wrong.** `MUSES` in `src/data.js` holds `color: 'var(--lunes)'` (CSS-var refs), **not hexes** — the 7 literal hexes live only in `tokens.css`. The globe needs a numeric hex, so the muse→hex join needs a real hex source (see Decision A). `MUSES` also has **no slug**; frontmatter `muse: rabu` joins via `name.toLowerCase()`.
- **Stubs are first-class.** 3 of 5 campaigns are tile-only (body = HTML comment, frontmatter mostly `[confirm]`/blank). Pipeline **indexes all 5**, **emits a page only for the 2 with a real body**, and **degrades on muse-less** (horizon-002 → `cause:null, hex:null`).
- **observatory.html = the globe shell (Phase 3), not the record pages.** Record pages are *generated* static HTML, not hand-authored Vite entries.

### 12.1 Files added
```
scripts/observatory/
  build.mjs            # the generator (gray-matter + marked, run at build-time)
  record-template.mjs  # campaign frontmatter+html → full <!doctype> string
src/observatory/
  record.css           # record-page styles (imports/relies on tokens.css vars)
vite-plugin-observatory.mjs  # (Decision B) dev-serve + watch + build-emit glue
```
New **devDeps:** `gray-matter`, `marked`. Generated output is **gitignored** (build artifact, never committed).

### 12.2 Pipeline steps (build.mjs)
1. Glob `content/campaigns/*.md` (skip `TEMPLATE.md`).
2. `gray-matter` → `{ data: frontmatter, content: bodyMarkdown }`.
3. **Normalise frontmatter:** coerce js-yaml `Date` objects back to `YYYY-MM-DD` strings; treat empty/`null` as absent.
4. **Join muse:** `slug = String(muse).toLowerCase()` → `{ cause, hex }`. Unknown/blank muse → `{ cause:null, hex:null }` (neutral tile). Validate against the 7 known slugs; warn (don't crash) on a typo.
5. **Classify `pageWorthy`:** body has ≥1 real markdown block (a `##` heading or non-comment prose) → emit a page; else tile-only. (HTML-comment-only stubs ⇒ tile-only.) An explicit `page: false` front-matter override forces tile-only.
6. **Emit `campaigns.json`** — *every* campaign (sorted: ongoing → upcoming → closed, then number). Shape in 12.4.
7. **Emit record pages** — for pageWorthy only: `marked(body)` → inject into `record-template.mjs` → write `observatory/<slug>/index.html` (clean URL `/observatory/<slug>/`).

### 12.3 Record page = self-contained static HTML
Each generated page links the **shared design tokens** + a record stylesheet and the Typekit font (same `<head>` recipe as `index.html`), so records inherit the brand with **zero Vite bundling coupling**. Layout: muse-colour accent rail, frontmatter → factual sidebar, body → article. Graceful degrade: render only sections/fields that have content (no empty headers). *(Visual design is Phase 2; Phase 1 ships a clean, correct, minimally-styled page.)*

### 12.4 `campaigns.json` contract (the single index → globe + filters + ticker)
```jsonc
[{
  "slug": "stardust-001-cantine-volpi",
  "type": "stardust", "number": 1, "title": "Cantine Volpi",
  "muse": "rabu", "cause": "Human Rights", "hex": "#8CB07F",   // null,null if muse-less
  "status": "closed", "year": 2025,
  "location": "Volpedo, Alessandria · Italy",
  "hero": "assets/images/.../hero.jpg",   // null → muse-colour placeholder tile
  "hasPage": true,                         // false = tile-only (no nav target)
  "url": "/observatory/stardust-001-cantine-volpi/"   // null when !hasPage
}]
```

### 12.5 Decisions (LOCKED 2026-06-19)
- **A1.** Muse→hex resolved from `tokens.css` at build; cause from `MUSES` (`src/data.js`). No `data.js` edit; each stays single-source. Muse-less / unknown muse → `cause:null, hex:null` (warns, never crashes).
- **B1.** Vite plugin (`vite-plugin-observatory.mjs`): dev middleware serves `/observatory/*` + watches `content/`+`record.css`; `closeBundle` (gated to `command==='build'`) emits to `dist/`.
- **C1.** A record carrying `[confirm]` (or `draft:true`, or `page:false`) is a **draft**: rendered in dev preview (`noindex`, banner, `[confirm]` highlighted), **never written to dist**, `hasPage:false`/`url:null` in `campaigns.json` (+ `draft:true` marker).
- **D → deferred.** No `observatory.html` yet; the globe shell is Phase 3.
- URL form: `/observatory/<slug>/` via `<slug>/index.html` (clean URLs).

### 12.6 Phase 2 / next (not done)
- Record-page visual design (Stardust + Horizon layouts, hero, gallery, muse-colour system). Phase 1 ships a clean minimal page only.
- Resolve `[confirm]`s in the 2 full records → they auto-publish.
- Voice-safe public title for `horizon-002` (see flag above).
- Hero-image convention: `campaigns.json` maps `hero: foo.jpg` → `assets/images/campaigns/foo.jpg` (dir not created yet; all heroes blank for now).
- `campaigns.json` location for consumers: emitted at `/observatory/campaigns.json` (globe/ticker `fetch` it). Reconsider if the homepage bundle should import it directly (Phase 5 ticker).

---

## 13. Phase 3 — port the globe (PLANNING · sign-off doc)

> **Status: BUILT 2026-06-19; ROUNDS 1–3 done & Chrome-verified (§13.13–15); ROUND-4 (§13.17) + ROUND-5 (§13.18) REJECTED (§13.19). ROUND-6 (§13.20 plan → §13.21 BUILT, 2026-06-20) fixed all four + added CAMPAIGN HERO PHOTOS, Chrome-verified. ROUND-7 (§13.22, 2026-06-22): full code AUDIT (→ repo-root `website-audit.md`, OBS-1…9) + Memo's Safari/mobile eyeball — ROUND 6 NOT accepted: HALO too dominant, FLIP card too big / text spills the circle / open-close glitches, mobile needs PINCH-to-zoom; + the 73MB dist footage bloat (OBS-1/2/3) blocks publish. ROUND 8 (§13.23) = BUILT 2026-06-22 (flip morph rewrite + always-big card + curved rim title + "Explore" + focused-tile zoom bounds & narrowed size-gap + pinch-to-zoom + halo dim), Chrome-verified, PENDING Memo's Safari/mobile eyeball. All uncommitted. **WORKSPACE CLEANUP 2026-06-22:** the spent round-4/5 probes `observatory-probe{,2,3}.*` + the superseded `observatory-round{6,7}-handoff.md` were DELETED (findings preserved in §13.16–13.21; rounds 6/7 in §13.20–13.22). RETAINED: `observatory-probe4.*` (active Safari symbol-acutance gate), `scripts/observatory/probe-logger.mjs` + `probe-log.json`, and `observatory-round8-handoff.md` (current). Downstream mentions of probe1/2/3 or the round-6 handoff below are HISTORICAL — those files no longer exist.** Phase 1 (pipeline) done & verified;
> Phase 2 (record visual design) **skipped for now** by product call — the globe is next.
> Branch `memo-edits-1906`, **all uncommitted**. Owner: Memo + Claude.
> ⚠ Host **cannot screencapture Safari** (Screen-Recording perm denied) — Memo eyeballs Safari;
> verify on Chrome headless (SwiftShader) + PIL crops, or a `gl.readPixels` beacon probe.
>
> **Locked:** **Component = Globe (InfiniteMenu)** for the index; **DomeGallery → later
> per-muse drill-down** (new phase: click a muse → a dome of just that cause's campaigns).
> **E1** (`base:'/'` + `observatory/index.html` → clean URL `/observatory/`, *with a homepage
> build re-verify*). **F1** (one quad geometry + per-instance circle-clip flag). **G1** (accept
> ~3–4× tile repeats). **H** (filters = Phase 4; only the `setItems` seam now). **I** (muse-click
> = inert "Filter this cause" label until Phase 4).
>
> Deliverable: the `/observatory` **index** — a WebGL2 globe (ported InfiniteMenu) of
> muse-anchor + campaign tiles, fed by `campaigns.json`, **plus the required accessible
> list fallback**. Filters (cause/type/status) are **Phase 4** — Phase 3 only leaves the
> seam (`globe.setItems(subset)`), it does not build the filter bar.

### 13.0 Research findings — the REAL InfiniteMenu (grounds the port, corrects earlier sections)
Fetched the actual reactbits source (`InfiniteGridMenu`). What's true vs what the earlier plan assumed:

- **Constructor:** `new InfiniteGridMenu(canvas, items, onActiveItemChange, onMovementChange, onInit?, scale?)`. `items = [{ image, link, title, description }]`. Standalone class; the React file is ~50 lines of glue (a focused-item **card overlay** + an action button + a `face/back` toggle) that we **discard and re-build in vanilla DOM**.
- **WebGL2 + gl-matrix** (`mat4, quat, vec2, vec3`). Our existing helpers (`gl-context.js`) are **WebGL1** (`getContext('webgl')`) — the globe needs its **own** WebGL2 context + program (can't reuse `getGL`). DPR cap (`DPR()`) we DO reuse.
- **Geometry = `DiscGeometry` (a circle).** ⚠ **Corrects §3 + §8.1:** every tile is a **circle** by default — the "square campaign tile, *no new geometry needed*" claim is **false**. Square tiles require a real fork (§13.4).
- **Positions = `IcosahedronGeometry`, subdivided once → 42 vertices**, spherised to radius 2. Disc instances sit on those 42 vertices; the texture for vertex *i* is item **`i % items.length`**. ⚠ **Corrects §8.1:** with 12 launch tiles, **each tile repeats ~3–4× around the globe** — that's intrinsic to "Infinite"Menu, not a bug. Either we accept it (ambient index) or reduce density (§13.8 G).
- **Texture = a single canvas ATLAS**, `cellSize 512`, `atlasSize = ceil(sqrt(count))²` grid; the frag shader picks a cell by instance id. So we **render each tile into a 512² cell on a 2D canvas** at init — perfect: muse tiles = coloured disc + white symbol drawn in-canvas; campaign tiles = hero photo (or muse-colour placeholder). No per-tile WebGL textures.
- **Focus = nearest-vertex** (max dot of snap-dir vs vertex world pos); fires `onActiveItemChange(item)`. `onMovementChange(bool)` toggles the card in/out while dragging. **ArcballControl** (quaternion + momentum) handles pointer/touch drag — ports 1:1.
- **No circle clipping in the frag shader** — the disc *geometry* is already round; AA comes from the geometry edge. (Matters for §13.4: a square needs a quad + a frag-shader round-clip for the muse subset.)

### 13.1 Files to add
```
observatory/index.html           # the globe shell page (Vite entry — see §13.8 E for URL/base)
src/observatory/
  globe.js            # ported InfiniteGridMenu (vanilla, WebGL2) — the renderer class
  globe-controls.js   # ported ArcballControl (or inlined in globe.js)
  globe-shaders.js    # disc/quad vert + frag GLSL (verbatim-ish, + the shape-clip fork)
  tile-atlas.js       # build the 512² atlas: muse disc+symbol draws + campaign heroes/placeholders
  observatory.js      # page entry: fetch campaigns.json → items[] → globe + overlay + list fallback
  observatory.css     # globe shell, focused-tile overlay card, accessible list view
new client dep: gl-matrix   (math only, ~tiny; flagged in §2/D2)
```
Reuses unchanged: `tokens.css` (brand vars + 7 hexes), Typekit `afs8ors`, `DPR()`, the white muse symbols (`<muse>-white.png`), `MUSES` (cause labels), the unified starfield shader (optional backdrop).

### 13.2 The port (keep vs discard)
- **KEEP & port 1:1:** `InfiniteGridMenu` (geometry build, atlas, instance matrices, camera/projection, render loop, nearest-vertex focus), `ArcballControl`. Translate TS→JS, drop React.
- **DISCARD:** the React component (`useRef`/`useState`/`useEffect`, the JSX focused-item card + `<a>` action). Re-implement as a **vanilla overlay** (§13.5) wired to the two callbacks.
- **ADD:** (a) the shape fork (§13.4), (b) in-canvas muse-tile rendering (§13.3), (c) the type-forked focus action (muse→cause label, campaign→record link), (d) the accessible list fallback (§13.6), (e) reduced-motion / no-WebGL2 guards.

### 13.3 Tile atlas (`tile-atlas.js`)
Build one 2D canvas atlas at init, hand its `<canvas>` to the globe as the texture source:
- **Muse anchor tile** (7, always present): fill the cell with a radial gradient in the muse **hex** (from `campaigns.json`/tokens), draw the **white symbol** PNG (`<muse>-white.png`, already preloaded pattern exists in `muse-popup.js`) centred — mirrors the orbit-disc recipe. Circle (§13.4).
- **Campaign tile:** `drawImage(hero, cover-fit)` into the cell; **no hero** → muse-colour placeholder square with the cause word. Square (§13.4).
- All images `await img.decode()` before drawing (Safari clean-paint pattern, same as the popup symbol preload). Atlas rebuilds when `setItems()` changes the set (Phase 4).

### 13.4 Shape-coding (the geometry fork — corrects §3)
Plan grammar: **muse = circle, campaign = square.** Since the base geometry is a disc, the cleanest single-draw-call fix:
- Switch the base geometry to a **quad** (square) and pass a **per-instance `aIsCircle` float** (1 for muse vertices, 0 for campaign). Frag shader: when `aIsCircle`, `smoothstep` round-clip to a disc (AA'd); else render the full square. One instanced draw, one program. *(Alt F2: keep DiscGeometry for muses + a second quad draw for campaigns — two draws. Recommend F1.)* — see §13.8 F.

### 13.5 Focused-tile overlay (vanilla replacement for the React glue)
A fixed DOM overlay (`.observatory-focus`), updated on `onActiveItemChange(item)`, faded by `onMovementChange` (hidden while dragging, shown on settle — same UX as the original):
- **Campaign tile:** title + `type number · cause · year`; action = **"View record →"** linking `item.url` (only when `hasPage`; upcoming/no-page → a muted "Soon" with no link).
- **Muse tile:** cause name (e.g. "Human Rights"); action = **"Filter this cause"** — in Phase 3 this is a **labelled-but-inert affordance** (or shows count); the actual filtering lands in Phase 4 (§13.8 I).
This is the *only* place the muse/campaign fork shows in interaction (the §3 "small fork in the focus handler").

### 13.6 Accessible list fallback (REQUIRED — §8.5, non-negotiable)
A real, parallel `<ul>` of all campaigns built from the SAME `campaigns.json` (semantic links, muse-colour chips, type/status/year, cause). Serves three roles at once: screen-reader/keyboard access, `prefers-reduced-motion`, and the **no-WebGL2 / low-power** fallback. Ships **day one of Phase 3**, not deferred. The globe is `aria-hidden`; the list is the accessible source of truth. (A "static, non-spinning globe state" for reduced-motion is a nice-to-have on top — the list satisfies the requirement.)

### 13.7 Brand integration
Same `<head>` recipe as the records (Typekit + tokens). Optional: the **unified starfield** behind the globe (its own WebGL1 context on this page — the homepage 8-context Safari budget does NOT apply here, globe lives alone; §10). Muse hues, Canela, offwhite/black palette from tokens — zero new design language.

### 13.8 OPEN decisions to lock (talk these out — do NOT assume)
- **E — page URL & Vite `base` (structural, biggest).** Site is currently `base: './'` (relative). A nested `observatory/index.html` entry breaks under `./` (its `./assets/` → `/observatory/assets/`, which won't exist).
  - **E1 (clean URL):** switch to `base: '/'` + add `observatory/index.html` as a Vite input → URL **`/observatory/`** (matches D1 intent, sits beside the record pages). Cost: a global config change → **must re-verify the homepage build/deploy** (was it `./` for a reason?).
  - **E2 (zero homepage risk):** keep `base: './'`, ship a **root** `observatory.html` → URL **`/observatory.html`** (its `./assets/` → `/assets/` works). Cost: `.html` URL (or a one-line host rewrite `/observatory → /observatory.html`); mild inconsistency with the clean `/observatory/<slug>/` record URLs.
  - *Recommend E1* (clean URLs, on-plan) **iff** a quick homepage build-verify passes; else fall back to E2.
- **F — shape-coding (§13.4).** F1 = one quad + per-instance circle-clip flag (recommend); F2 = two geometries/draws.
- **G — globe density / repeats (§13.0).** G1 accept ~3–4× repeats (true InfiniteMenu feel, recommend); G2 drop subdivision → 12 vertices = one-each but chunky icosahedron. *Proceeding G1 unless you object.*
- **H — Phase 3 scope.** Globe + list fallback + focus overlay + (optional) starfield. **Filters = Phase 4** (only the `setItems` seam now). *Proceeding as scoped.*
- **I — muse-click in Phase 3.** Inert "Filter this cause" affordance now; real filtering in Phase 4. *Proceeding I-inert.*
- **Pre-req content flag:** `horizon-002.title` still says *"…Decentralised Futures"* and is in `campaigns.json` → would render on a tile. Needs a voice-safe title **before the globe ships** (§8.9). Not blocking the build; blocking the *publish*.

### 13.9 Risks
- **WebGL2 port fidelity** — the renderer is ~350 lines of shader/matrix code; port carefully, verify visually (proof-don't-assume: headless render + screenshot the globe).
- **`base` change blast radius** (E1) — re-verify the whole homepage if we flip it.
- **Dev/plugin route overlap** — the observatory plugin middleware intercepts `/observatory/*`; confirm it falls through for the new `/observatory/` index page (its slug regex needs ≥1 path char, so `/observatory/` → `next()` → Vite serves the shell; verify).
- **Touch: globe drag vs page scroll** (§8.7) — Arcball claims the pointer; the globe page is single-screen (not long-scroll), so low conflict, but test on iOS.
- **gl-matrix** — new client dep (accepted, math-only).
- **Atlas memory** — 12 tiles × 512² is trivial; fine. Larger archives later may need a bigger atlas / mipmaps.

### 13.10 Build order within Phase 3 (verify as I go)
1. `npm i gl-matrix`; lock E (URL/base) + F (shape).
2. Globe shell page + page entry that `fetch`es `campaigns.json` and logs items[].
3. Port `InfiniteGridMenu` + `ArcballControl` → spinning globe with a **placeholder** atlas (solid cells). Verify it renders + drags.
4. `tile-atlas.js`: real muse discs + campaign placeholders. Verify tiles read correctly.
5. Shape fork (F). Verify circle/square split on screen.
6. Focus overlay (§13.5) + type-forked action. Verify focus snaps + links work.
7. Accessible list fallback + reduced-motion / no-WebGL2 guards. Verify keyboard + a11y.
8. Polish: starfield backdrop, mobile/touch pass, screenshot proof.

### 13.11 BUILT 2026-06-19 — what shipped + verified (headless Chrome, SwiftShader WebGL2)
**Files added** (all uncommitted):
- `observatory/index.html` — globe shell (Vite input). `vite.config.js`: `base:'./' → '/'` + `rollupOptions.input { main, observatory }` (E1).
- `src/observatory/globe.js` — `Globe` (ported `InfiniteGridMenu`, vanilla WebGL2, own RAF + `visibilitychange` pause, `setItems()` seam, `onFrame` hook).
- `globe-geometry.js` (Geometry/Icosahedron + **QuadGeometry** centre+4-corner fan), `globe-shaders.js` (`TILE_VERT`/`TILE_FRAG` + per-instance `aIsCircle` circle-clip), `globe-controls.js` (`ArcballControl`, verbatim), `tile-atlas.js` (`buildAtlas` — muse disc gradient+white symbol / campaign hero|placeholder).
- `observatory.js` — fetch `campaigns.json` → 7 muse anchors (from `MUSES` + CSS-var hexes) + campaign tiles → globe; **accessible list fallback**; reduced-motion / no-WebGL2 **guards**; focus overlay; starfield backdrop.
- `observatory.css` — shell, sr-only list under `.globe-active`, focus overlay, starfield/globe layering.
- dep: **`gl-matrix ^3.4.4`** (client).

**Verified empirically (screenshots):** homepage still builds + renders after the `base` flip (E1 safe); list fallback renders all 5 campaigns (2 links + 3 "soon"); globe renders a sphere of tiles; **muse = circle, campaign = square** (F1 confirmed on screen); focus overlay type-fork (muse → cause + inert "Filter this cause"; campaign → "View record" link, or **"Soon"** for draft/no-page); starfield backdrop shows through tile gaps. No shader/JS console errors. Build clean (`2 page(s), 2 draft(s) held, 1 tile-only`).

**Key port gotcha fixed:** the globe canvas is `display:none` until `.globe-active`; constructing the globe while hidden read `clientWidth/Height = 0` → `aspect = NaN` → nothing rasterised. Fix: add `.globe-active` then `globe.resize()` before `start()`. (See [[scrolltrigger-vh-as-px-trap]]-style "measure when visible" class of bug.)

**Decisions as-built:** E1 (`/observatory/`, `base:'/'`), F1 (quad + circle-clip), G1 (42 verts, tiles repeat ~3.5×), H (no filters yet — `setItems` seam only), I (muse-click inert). `scale: 2.0` chosen so the sphere reads as a globe (tunable in `observatory.js`).

### 13.12 Remaining (next)
- **Device/touch pass** — verify Arcball drag vs scroll on real iOS/Android (headless can't). Single-screen page, `touch-action:none` on the canvas.
- **`scale` / camera feel** — 2.0 is a first pass; tune to taste with Memo's eye.
- **Hero images** — `assets/images/campaigns/` dir + real heroes → campaign squares become photos (currently muse-colour placeholders). Pipeline already maps `hero:`.
- **`horizon-002` title** — "…Decentralised Futures" now renders on a globe tile; pick a voice-safe public title before shipping (§8.9 / §12).
- **Phase 4 filters** — cause (muse-click) / type / status, via the `globe.setItems(subset)` seam already in place + the focus overlay's currently-inert "Filter this cause".
- **Docs** — fold the observatory module map into `CLAUDE.md` via `/doc-minder` once this increment is signed off.
- **Phase 3.5 (later)** — DomeGallery per-muse drill-down (the "Both" decision).

### 13.13 ROUND-1 refinements (2026-06-20) — DONE & Chrome-verified, uncommitted
Memo reviewed live; this batch shipped (supersedes parts of §13.8/§13.11):
- **Tile language changed — F1 is OBSOLETE.** ALL tiles are now **circles**; type is coded by **size + colour**: muses render **half-size in their hue** (`SIZE_BY_KIND` in `globe.js`, applied in `#animate`; the `aIsCircle` attribute was removed, frag clips ALL tiles to a circle), muse **symbol bumped to ~80%** of the disc (popup ratio). Campaign tiles are full-size circles with a baked **"Stardust 00X"/"Horizon 00X"** label (cause implied by colour); **muse-less (H002) = black disc**.
- **Zoom control** — a draggable pill (`#observatory-zoom`) reusing the comet `.beam-glow`/`.pill-glass` recipe (ported into `observatory.css`) → `Globe.setScale` (continuous, `1.2`–`3.6`). Refined: smaller, default **30% opacity → 100% on hover**.
- **Content** — S003 → **Shukra**; H002 title → **"Manifesto"** (clears the voice flag); **S001 + H001 PUBLISHED** by trimming all `[confirm]`s (now **4 record pages**, 0 drafts, 1 tile-only); record back-link → **`/observatory/`**.
- **Safari** — removed `img.crossOrigin` in `tile-atlas.js` (same-origin canvas-taint) + allocation-free scratch-matrix `#animate`.
- **Tile flip-card** — tap the focused tile → a DOM card flips to a **black detail face** (name + cause + description). Muse descriptions ADDED to `src/data.js` `MUSES`; campaign **`summary`** (first body paragraph, capped) ADDED to `campaigns.json` via `summarize()` in `build.mjs`.

### 13.14 ROUND-2 (Safari review 2026-06-20) — DONE & Chrome-verified, uncommitted
All eight shipped: (A) `MUSE_HEX` hardcoded fallback in `observatory.js`; (B) dropped blocking `fonts.ready` in `buildAtlas` + `Globe.loadAtlas` re-uploads after fonts; (C) `CELL` 512→1024; (D) flip-back→circle + removed `#observatory-focus`/`renderFocus`; (E) campaign discs share `drawDisc`; (F) zoom no-words + slope glass + double-rAF/clamp thumb fix; (G) `#observatory-cloud` via `createIntroStarfield` — needs `mix-blend-mode:screen` on the starfield (STARFIELD_FRAG is opaque, would occlude the cloud); (H) back-link `cocoex-text.png` wordmark. Original asks:
- **(A) Tiles still grey on Safari** — muse hex via `getComputedStyle('--<muse>')` returns `''` on Safari (imported-CSS-var timing) → grey `#888` fallback. Fix = **hardcoded `MUSE_HEX` map** in `observatory.js` as the fallback (campaign hexes from `campaigns.json` are fine).
- **(B) Slow load** — drop the blocking `await document.fonts.ready` in `buildAtlas`; build/upload immediately, re-upload after fonts load.
- **(C) Blurry/pixelated tile text** — atlas `CELL` 512 → **1024**.
- **(D) Flip → CIRCLE** (not a rounded card) + **remove the bottom focus overlay** (`#observatory-focus`/`renderFocus` — repetitive with the flip).
- **(E)** Campaign discs share the muse `drawDisc` recipe (lit-centre gradient + grain).
- **(F) Zoom** — drop the "in/out" words; **slope-y** glass (darker on the right); fix the first-paint thumb glitch (defer `place()` to a double rAF; clamp `frac`).
- **(G)** Add the intro nebula backdrop via **`createIntroStarfield('observatory-cloud')`** (`pulse=0`).
- **(H)** Back-link → the **`cocoex-text.png`** wordmark, not typed "← cocoex".
Verify on Chrome headless AND **Safari** (the gate — Chrome already passes).

### 13.15 ROUND-3 (2026-06-20) — DONE & Chrome-verified, uncommitted
Memo reviewed round-2 on desktop Safari; this batch shipped (Safari sharpness still open — see §13.16):
- **(1) Safari sharpness ATTEMPT — STILL UNSOLVED.** Added 16× anisotropic filtering (`#uploadAtlas`), a per-cell UV **gutter** (`TILE_FRAG`, INSET 0.012, stops atlas mip cross-bleed), and a **−0.5 LOD bias** (`texture(uTex,st,-0.5)`). ⚠ **Anisotropy was the wrong lever** — the tiles are **camera-facing billboards** (isotropic footprint), which anisotropy doesn't help; the blur is `LINEAR_MIPMAP_LINEAR` **trilinear minification** of the small/half-size tiles (Safari's mip-LOD softer than Chrome's). Empirical WebGL2 probe earlier proved it's NOT texture size / canvas downscale / upload failure (`MAX_TEXTURE_SIZE 16384`, clean upload). See memory `safari-billboard-texture-sharpness`.
- **(2) Discs match the popup EXACTLY** — `drawDisc` gradient changed from lighten-to-white → **hue→darker** (`radial circle at 50% 38%, hex → darken(hex,0.3)`, matching `.muse-card-inside`), and the grain is now the **real `feTurbulence` SVG** (rasterised to a 256px tile, overlay 0.22 / screen 0.15 on black) — the old per-pixel random noise was averaged away by the mips ("missing grain"). Black muse-less disc = orbit `#1d1d1d→#000`.
- **(3) Flip = GROW FROM THE TILE** (Memo's pick). `Globe.getActiveTileScreen()` projects the active vertex → CSS-px `{cx,cy,r}` (stores `activeVertexIndex` + per-frame `instanceFinalScale`). `observatory.js` uses the **FLIP technique**: the card renders centred at a standard size, is mapped onto the tile on open, then released (grows) while the inner shell does the orbit **0.82s back-out** `rotateY`. Faces = the **homepage orbit recipe** (colour front disc + engraved symbol/label → black **concave** back disc with muse-hue name + cause + summary + action pill). **Click only on the disc** (radius hit-test). Globe **dims+freezes** during the flip.
- **(4) Zoom** — responsive: **mobile bottom-centre / desktop top-right** mirroring the wordmark; **scroll-wheel zoom** (Google-Maps style, `wheel` nudges the pill `frac`, trackpad pinch = wheel+ctrl for free).
- **(5) Nebula = cosmic halo** (Memo's pick: neutral) — `#observatory-cloud filter:brightness(2.4)` (the source nebula is near-black) + a new `#observatory-halo` radial-gradient layer hugging the sphere's silhouette. *(Round 4 changes the halo colour — see below.)*

### 13.16 ROUND-4 (2026-06-20) — PLANNED, NOT built (do in a fresh chat)
1. **SAFARI BLUR — hot priority, master it (probe-first, don't assume).** Round-3 anisotropy didn't fix it. **Measure on Safari**: render the globe's exact atlas+filter pipeline, compute symbol-edge sharpness via `gl.readPixels`, beacon to a local logger, across filter configs — `LINEAR_MIPMAP_LINEAR` (current) · `LINEAR` (no-mip) · `LINEAR_MIPMAP_NEAREST` · mips + `TEXTURE_MAX_LOD` clamp · stronger `texture(,bias)`. Run the same in headless Chrome for the baseline; pick the config sharp on **both**. Confirm the `document.fonts.ready` re-upload fires on Safari (if not, labels stay serif = blurry "text" — add a `fonts.check`/timeout fallback). Files: `globe.js` (`#uploadAtlas`), `globe-shaders.js`, `tile-atlas.js`.
2. **Halo → WHITE / neutral** — colour wrongly implies a muse. `#observatory-halo` gradient → `rgba(255,255,255,…)`.
3. **Flip close = ONE entity** (screenshot showed two discs on close) — hide the globe **fully** during the flip (`body.flip-open #observatory-globe { opacity: 0 }`, was 0.22) so the shrinking card never overlaps the real tile; verify open + close read as one.
4. **Muse-tile grain +20%** — bump `drawDisc` grain alpha (~0.22→0.26 colour / 0.15→0.18 black) in `tile-atlas.js`.

### 13.17 ROUND-4 (2026-06-20) — BUILT. Safari blur PROBE-SOLVED + 3 polish items (uncommitted)
**(1) SAFARI BLUR — solved, probe-first (the round-3 gate).** Built a dev-only **sharpness probe** (`observatory-probe.html` + `observatory-probe.js`, served by Vite dev; NOT a build input → never shipped) + a **beacon logger** (`scripts/observatory/probe-logger.mjs`, `:7777`, CORS-open). The probe renders the globe's **exact** atlas + cell-sampling pipeline (same `buildAtlas`, same `TILE_FRAG` UV math: cell offset + 0.012 INSET + circle-clip + configurable `texture(,bias)` / min-filter / `TEXTURE_MAX_LOD` / aniso) onto a **flat quad at the tile's real on-screen device size** — faithful because settled tiles are **camera-facing billboards** (isotropic footprint), so a flat quad at the right size reproduces the exact `CELL/size` minification. Sizes derived analytically from the real camera (`scale 2.0` → cam z 6, focused vertex at world (0,0,2), half-extent = `finalScale`): campaign-focus, muse-focus (half), back. Metric = **inner-disc gradient acutance** via `gl.readPixels` (mean |Δluma| over opaque pixels inside r<0.6, excludes the disc-rim AA → isolates texture-filter sharpness; higher = crisper). Beacons numbers (not a screenshot) so **Safari self-reports without screencapture** — I `open -a Safari <probe>` and read the beacon.

- **Configs swept:** `LINEAR_MIPMAP_LINEAR` @ bias {0, −0.5 (round-3 CURRENT, +aniso16), −1.5} · `LINEAR` no-mip · `LINEAR_MIPMAP_NEAREST` @ bias {0, −0.5} · mml + `TEXTURE_MAX_LOD 1.0`.
- **REAL Safari 26.3.1 (retina dpr2) result** — the half-size **muse tile (482px on-screen) is the blur source**: round-3 CURRENT (b−0.5) acutance **1.868** vs **b−1.5 = 2.261 (+21%)**, tied with no-mip (the sharpness ceiling = mip 0). Focused **campaign** tile (964px) is already ~mip 0 → all configs ≈ equal (it was never the problem). `mip-NEAREST` and `maxLod1.0` won **nowhere** (nearest rounds LOD≈1→mip 1 = still soft). **aniso confirmed useless** (wrong lever, isotropic billboards). Headless Chrome (dpr1) agreed: **b−1.5 sharpest-or-tied everywhere, retaining mips.**
- **WINNER (sharp on BOTH, AA kept) = `LINEAR_MIPMAP_LINEAR` + a strong `−1.5` LOD bias.** It clamps near/focused/half-size tiles to **mip 0** (so Safari's softer trilinear LOD no longer blends in a blurrier level — the actual mechanism), while genuinely-minified far tiles (LOD > 1.5) **keep sampling the mip chain → anti-aliasing retained** (confirmed: on back tiles b−1.5 stays below no-mip = it's still mipping there). **Applied:** `globe-shaders.js` `texture(uTex, st, −0.5)`→`−1.5`; `globe.js` **removed the anisotropy** grab + per-upload `texParameterf` (round-3's wrong lever), kept `generateMipmap` + `LINEAR_MIPMAP_LINEAR`.
- **Fonts:** probe confirmed `document.fonts.ready` **DOES fire on Safari 26** and `check('700 1em canela')` is **true** before+after → the "blurry text = serif fallback" theory was **false here**; Canela bakes correctly. Still added the asked **belt-and-suspenders** to `Globe.loadAtlas`: skip the re-upload if Canela's already loaded (`fonts.check`); else re-bake on whichever fires first — an explicit `fonts.load('700 1em canela')`, `fonts.ready`, **or a 3 s timeout**.
- ⚠ **Pending Memo's Safari eyeball** to sign the blur off (probe + numbers say solved; eyeball confirms the lived experience). Probe + logger **kept** as reusable Safari-debug scaffolding (like `viewport-debug.js`); run: `node scripts/observatory/probe-logger.mjs` then `open -a Safari http://localhost:5173/observatory-probe.html`.

**(2) Halo → WHITE/neutral.** `#observatory-halo` gradient blue-violet → achromatic white/grey (`rgba(255,255,255,…)` core → `rgba(236,238,245,.20)` → grey falloff). A tinted halo wrongly implied a muse. Chrome-verified (live globe shows a neutral white atmosphere).

**(3) Flip close = ONE entity.** `body.flip-open #observatory-globe { opacity: 0 }` (was 0.22) so the real WebGL tile can't show beside/behind the DOM card during grow/shrink; backdrop layers (starfield/cloud/halo) stay at 0.22 so the card keeps its atmosphere. (Eyeball open+close on device.)

**(4) Muse-tile grain +20%.** `tile-atlas.js drawDisc` grain alpha 0.22→**0.26** (colour) / 0.15→**0.18** (black).

**Verified:** `npm run build` clean (probe files excluded — not rollup inputs); live globe renders in headless Chrome (focused tile crisp, white halo, no regression from the aniso removal). All changes confirmed present in `dist/` bundles. Nothing committed.

### 13.18 ROUND-5 (2026-06-20) — Memo review: blur STILL there + 5 more. Reframed + fixed (uncommitted)
Memo on Safari: tiles still blurry/pixelated after the −1.5 rebuild (hard-reloaded). Re-researched probe-first and **found I'd been measuring the wrong regime** in round 4.
- **What ruled OUT (probe2 `observatory-probe2.*` + probe3 `observatory-probe3.*`, real Safari 26 + Chrome):** (a) my fresh "Safari 4096² canvas-area cliff" hypothesis is **FALSE** — Safari `maxTextureSize` 16384, downscales NOTHING at 2048/4096/8192 (1px-line + corner-marker survival, 2D + WebGL upload paths). (b) Source symbols are 933px (drawn 819px) — sharp, not the cause. (c) the feTurbulence grain DOES rasterise (Chrome std 20 / Safari 13) — it was just too faint in compositing.
- **The real mechanism (probe3 = LIVE globe on real Safari):** the focused tile is only **~203 device px** (radius 51 css), sampling a 1024px cell = **5× MINIFICATION**. Tiles are SMALL + downsampled, not magnified. So a baked-texture disc shown at ~200px reads soft on Safari no matter the filter — and round-4's probe1 had tested 482–964px sizes that **don't occur**. (Round 4's −1.5 was a real but insufficient improvement.)
- **FIX #1 (Memo's pick) — PROCEDURAL DISC.** The coloured disc (radial gradient 50%/38% hue→−30% rim + film grain + AA edge) is now computed **in `TILE_FRAG`** from a **per-instance accent colour** (`aInstanceColor`, new instanced vec4 attr in `globe.js` `#computeInstanceColors`; black/muse-less flag in `.a`). Razor-sharp at ANY size/zoom — no minification on the disc/edge/gradient. Grain is a per-`gl_FragCoord` hash (~±13%, constant crisp screen-pixel size). The atlas (`tile-atlas.js`) now holds **only the FOREGROUND** (white muse symbol engraved / campaign label) on **transparent**, **premultiplied-alpha** upload (so mips don't dark-fringe the glyph), composited over the procedural disc — and **CELL 512** (was 1024; tiles never exceed ~250px, so the atlas is now 2048² and the symbol downsamples cleanly). Chrome-verified: disc gradient + edge sharp, **grain clearly visible**, symbol/ring crisp. (Heros: future — a hero would be opaque foreground replacing the disc; none exist yet.)
- **FIX #2 — Halo attached to the circumference.** New `Globe.getSphereScreenRadius()` (projects the sphere equator) → `observatory.js` writes `--halo-r` (px) every frame; `#observatory-halo` gradient is now a white ring pinned AT `--halo-r` feathering outward (was a fixed 62vmin background). It hugs the sphere and scales with zoom. Still achromatic (round 4).
- **FIX #3 — Flip jump + hit area.** The close "shrinks tiny then the globe pops to a different size" was the globe **still animating** under the open card. Added `Globe.freeze()`/`thaw()` (skips `#animate`/`#render` while keeping `onFrame`) — `openFlip` freezes, `closeFlip` thaws, so open + close anchor to the SAME frozen tile = no jump. Hit-test widened `rect.r*1.15`→**`*1.6`**: the vertex shader spherises the quad so the VISIBLE disc is bigger than the flat-quad `rect.r` — the outer disc / negative space wasn't clickable (only the symbol). Now the whole disc clicks.
- **FIX #4 — Grain.** Globe tiles: procedural (above). Flip card (CSS `::after`): opacity 0.18→**0.3** (front/overlay) and 0.13→**0.2** (back/screen).
- **FIX #5 — Mobile wordmark top-CENTRE** (`@media max-width:767px` → `.observatory-back { left:50%; translateX(-50%) }`; desktop stays top-left). **FIX #6 — Mobile default zoom IN**: `observatory.js` `defaultScale` 2.0 desktop / **1.35 mobile** (camera was too far on phones); the zoom-slider initial `frac` now derives from `globe.scaleFactor`.
- **Verified:** `npm run build` clean; Chrome desktop + 390×844 mobile screenshots confirm all six (procedural disc + grain, hugging halo, mobile centre-wordmark + closer zoom). **Pending Memo's Safari eyeball** on the procedural disc (the whole point — it's resolution-independent now, should match Chrome). Probes (`observatory-probe{,2,3}.*` + `scripts/observatory/probe-logger.mjs`) kept as scaffolding. Nothing committed.

### 13.19 ROUND-5 MEMO REVIEW (2026-06-20) — REGRESSED on 4 fronts → ROUND-6 agenda (do in a FRESH chat)
Memo reviewed round 5 on Safari. **Round 5 is NOT accepted — fix in a new chat (this one is too long; see the handoff `observatory-round6-handoff.md`).** Honest status:
1. **NOISE — MAJOR REGRESSION ("worst it's ever been").** Clarification from Memo: the ask was the **NOISE EFFECT**, and the reference is the **muse popup** `.muse-card-inside::after` (the BEST version ever) = feTurbulence `fractalNoise baseFrequency 0.8 / numOctaves 2`, **opacity 0.18, mix-blend overlay, 160px tile** — soft + organic. Round 5 instead used a per-pixel `hash(gl_FragCoord.xy)` in `TILE_FRAG` (±13% multiply) = harsh DIGITAL STATIC, wrong; and over-bumped the flip-card CSS (0.3/0.2). **ROUND-6 FIX:** replicate the popup's feTurbulence feel on the globe disc — in-shader use organic fractal noise (the project has `SIMPLEX_NOISE` in `webgl/shaders/glsl-utils.js`) at a matching soft scale + low overlay-like strength, OR sample a baked feTurbulence tile at a SCREEN-STABLE scale. Revert the flip-card CSS to 0.18 overlay. Match the popup exactly.
2. **SAFARI BLUR — STILL not solved** even with the procedural (resolution-independent) disc. Strong hypothesis: the disc gradient/edge ARE sharp now, but the **white SYMBOL/ring is still a sampled PNG** (foreground atlas, CELL 512 → minified to ~200px on Safari) — that's the salient thing the eye reads as "blurry." ROUND-6: probe the LIVE globe framebuffer on Safari directly (not a flat-quad proxy) to confirm it's the symbol; then make the symbol sharp (SDF / vector, or guarantee a near-mip-0 sample at the real ~200px size, or a dedicated higher-res symbol path). Also re-confirm Memo actually got the rebuild (Safari cache/HMR).
3. **FLIP — "nothing changed."** freeze/thaw + hit-`1.6×` didn't change the felt behaviour. Likely the card grows to a FIXED `clamp(300,52vw,440px)` regardless of the ~200px tile, so it always reads as a disconnected big grow/shrink (Memo's real ask: "open and close ON the current zoom view" = size the card RELATIVE to the live tile/zoom). ROUND-6: re-derive the flip so it anchors AND scales to the live tile size; verify `freeze()` actually engages (add a visible check).
4. **HALO — oversized.** `getSphereScreenRadius()` projects the equator at SPHERE_RADIUS=2, which renders LARGER than the visible tile-cloud (Memo's screenshot: halo ring sits outside the sphere's actual curvature). ROUND-6: shrink `--halo-r` to the visible sphere (≈×0.7–0.85, or project the real visible extent) so the ring sits ON the curvature.
5. Mobile wordmark-centre + mobile default-zoom 1.35 — not objected to; keep.

### 13.20 ROUND-6 PLAN (2026-06-20) — PLANNING, NOT built (awaiting Memo sign-off)
Fresh chat per `observatory-round6-handoff.md`. Branch `memo-edits-1906`, all uncommitted, **do not commit unless asked**. Plan-first: this section is the sign-off doc; nothing lands until Memo approves the two forks below. Verify empirically (Chrome headless SwiftShader + PIL crops; Safari = Memo eyeball + readPixels beacon). Keep `npm run build` clean.

**Confirmed facts (re-derived from the live code, not assumed):**
- 12 items (7 muse anchors + 5 campaigns: S001–003, H001–002) → atlas `ceil(sqrt(12))=4` → **4×4 = 2048²**, CELL 512, symbol drawn at `0.8·512 ≈ 410px`/cell.
- probe3: focused tile ≈ **203 device px** at default zoom → the white symbol ≈ `0.8·203 ≈ 162 device px`. Cell content 410px shown at 162px = **~2.5× minification of the glyph** → the residual Safari blur (the disc is procedural/sharp now; only the glyph is still a minified raster).
- Canonical grain (the "best ever" = popup): `.muse-card-inside::after` / `.muse-orbit-disc::after` = feTurbulence `fractalNoise baseFrequency 0.8 numOctaves 2`, **opacity 0.18 · mix-blend overlay · 160px tile**; black back-face override = **screen blend, opacity 0.13**.
- Flip card is `clamp(300px,52vw,440px)` → **440px on a 1440 desktop vs a ~101px css tile = ~4.3× → the "disconnected big grow/shrink"** Memo flagged.

**⚠ Cross-cutting suspect — STALE BUNDLE (check FIRST).** "blur still there" (#2) AND "flip nothing changed" (#3) are *exactly* the symptoms of Safari serving a cached/old ES bundle (round-5 never actually loaded). Before re-engineering anything, add a tiny **visible build stamp** (e.g. `#observatory-build` text node or a `console.info('[observatory] build <ts>')`) so Memo can confirm the rebuild is live. Cheap insurance that may explain multiple "nothing changed" reports at once. → ship this in step 0.

#### Issue 1 — NOISE (top priority): match the popup feTurbulence exactly
- **Root cause:** round 5's `hash(gl_FragCoord.xy)·0.26` is white noise (uncorrelated per pixel) = harsh digital static; the popup grain is band-limited feTurbulence (spatially correlated, fractal) blended **overlay @ 0.18** — soft/organic. Two errors: wrong noise *character* AND wrong blend math (round 5 did a symmetric multiply, not overlay).
- **FORK A → LOCKED A1 (baked feTurbulence tile), Memo 2026-06-20.**
  - **A1 — baked feTurbulence tile (CHOSEN).** Rasterise the *exact* popup SVG feTurbulence to a ~256px tile, upload as a 2nd sampler (`uNoise`, unit 1, `GL_REPEAT`, `LINEAR`, no mips), sample **screen-stably** at `texture(uNoise, gl_FragCoord.xy/160.0)` and overlay-blend at 0.18 over the procedural disc. Identical generator → guaranteed visual match to the popup; screen-stable so it can't be mip-averaged away (the round-3 failure) and stays crisp on Safari (it's a ~1:1 screen sample, NOT a minified cell sample). Cost: one tiny texture + one sampler.
  - **A2 — in-shader simplex.** `SIMPLEX_NOISE.snoise` (already in `glsl-utils.js`): `n = 0.5·snoise(p·f) + 0.25·snoise(p·2f)` over `gl_FragCoord.xy`, tuned so fineness ≈ 160px feTurbulence, overlay-blended @ 0.18. No texture/sampler; fully resolution-independent. Cost: it's an *approximation* of feTurbulence by eye — risk of another review round if the character is subtly off.
- **Both:** implement true `overlay` blend in-shader (not the round-5 multiply), strength 0.18, so it reads identically to the CSS `mix-blend-mode: overlay`. Black/muse-less disc → screen-style blend @ ~0.13 (matches the back-face override).
- **CSS revert (regardless of fork):** `observatory.css` `.tile-flip-front::after`/`.tile-flip-back::after` → front **opacity 0.3→0.18 (overlay)**, back **0.2→0.13 (screen)**, `background-size 150px→160px` (exact popup match). Files: `globe-shaders.js` (`TILE_FRAG`), `globe.js` (+`tile-atlas.js` if A1 bakes the tile there), `observatory.css`.

#### Issue 2 — SAFARI BLUR: the minified symbol (PROBE-FIRST, don't pre-commit a fix)
- **Hypothesis (to prove, not assume):** disc is sharp; the **white symbol/label** is a 410px raster shown at ~162px (~2.5× min) sampled `LINEAR_MIPMAP_LINEAR` @ bias −0.5 → Safari's softer trilinear LOD blends mip 1 → soft. Round-4's −1.5 helped but was tested on the *whole baked disc*; now the glyph is isolated.
- **Step 2a — probe the LIVE globe framebuffer on Safari.** Extend `observatory-probe3.*` (it already builds the real `Globe`) → after settle, `gl.readPixels` the focused-tile region and compute **symbol-edge acutance** (mean |Δluma| across the glyph's high-contrast edges). Sweep foreground-sampling configs: current `mml @ −0.5` · `mml @ −1.5` · `textureLod(...,0.0)` (force mip 0) · `LINEAR` no-mip · (if needed) a higher-res symbol path (CELL 768/1024 again now that ONLY the glyph is baked) · SDF candidate. Run identically in headless Chrome (baseline) + beacon from Safari (`probe-logger.mjs :7777`). Pick the config crisp on **both**.
- **Step 2b — implement the probe winner.** Likely cheapest = force the foreground toward mip 0 for near/focused tiles (a stronger negative bias or `textureLod` on the glyph only — the disc is procedural so there's no gradient-aliasing tradeoff) while keeping mips for far-tile AA. **Escalation only if the probe says raster sampling can't reach Chrome-parity: SDF symbols** (vector-crisp at any size; bigger lift — text labels complicate it, so cap effort here unless data forces it). Files: `globe.js` (`#uploadAtlas`, CELL), `globe-shaders.js` (`TILE_FRAG` foreground sample), `tile-atlas.js`.
- No design fork — the probe decides. Re-confirm Memo on the rebuild (step 0 stamp).

#### Issue 3 — FLIP: size & anchor to the LIVE tile/zoom, no close-jump
- **Root cause:** the card grows to a FIXED `clamp(300,52vw,440px)` regardless of the ~101px css tile → reads as a detached big grow, then snaps back. The focused tile always projects ≈ screen-centre (it snaps to the sphere front), so *position* is already ~centre — the problem is **SIZE**, not placement.
- **FORK B → LOCKED B1 (tile-proportional + legibility floor), Memo 2026-06-20.**
  - **B1 — tile-proportional with a legibility floor (CHOSEN):** final px = `max(tileDiameter · k, readableMin)` with `k≈1.6`, `readableMin≈260px`. Zoom in → card tracks the bigger tile (feels connected); zoom out → floors so the name/cause/desc stay readable. Open & close derive from the SAME live rect → no size jump.
  - **B2 — exactly tile-sized:** card = tile diameter (most "connected") but text is unreadable when zoomed out — likely needs the back face to scale type to card size; risk of tiny illegible cards.
  - **B3 — modest fixed enlargement:** always ~1.8× the tile, no floor — simplest, but still detached when zoomed way out.
- **Either way:** drop the fixed `clamp(...)` width; size the `.tile-flip-card` from JS off `getActiveTileScreen().r` at open, and make the back-face type clamp against the card so it stays legible at the chosen size. Open and close MUST read the same derived size (they already share `flipRect`).
- **Verify `freeze()` engages:** add a visible/telemetry check that `_frozen` is true during the flip (the code path looks correct; confirm it actually runs — and that round 5 wasn't simply a stale bundle). Files: `observatory.js` (`openFlip`/`closeFlip`/`initFlip` sizing), `observatory.css` (`.tile-flip-card`).

#### Issue 4 — HALO oversized
- **Root cause:** `getSphereScreenRadius()` projects the geometric equator at SPHERE_RADIUS=2, larger than the *perceived* tile-cloud (limb tiles are sparse + depth-shrunk, so the dense ball reads smaller than radius 2).
- **Fix:** apply a shrink factor ≈ **0.78** (within Memo's ×0.7–0.85) where `observatory.js` writes `--halo-r` (keep the projector geometrically honest; apply the aesthetic factor at the consumer). Tune by eye with Memo. Files: `observatory.js` (`onFrame` `--halo-r`), `observatory.css` (`#observatory-halo` fallback). One-liner; no fork.

#### Build order (trivial → structural; verify each)
0. Build stamp (de-risks #2/#3 "nothing changed"). 1. Halo factor (#4, one-liner). 2. Noise (#1, after Fork A) + CSS revert. 3. Flip sizing (#3, after Fork B) + freeze check. 4. Safari symbol: probe (#2a) → implement winner (#2b). Then: Chrome screenshots + PIL crops for 1/3/4; Safari beacon for 2; Memo eyeball for the lot; `npm run build` clean.

#### Risks / watch-list
- A1 adds a 2nd sampler — keep premultiply/blend correct; verify it doesn't regress the foreground composite. SDF (#2 escalation) is a real lift — gate it behind probe data. Long-chat law: checkpoint + flag if this round runs long.

### 13.21 ROUND-6 BUILT (2026-06-20) — all four + photos. Chrome-verified, uncommitted
Branch `memo-edits-1906`, nothing committed. Pending = **Memo's Safari eyeball + a probe4 Safari run** (the #2 gate).

- **Step 0 — build stamp.** `observatory.js` `BUILD` const (`r6.1`) → faint corner `#observatory-build` + `console.info('[observatory] build …')`. Confirms Safari is on the FRESH bundle (a stale cache would make #2/#3 look like code bugs). Bump on each change.
- **#1 NOISE — baked feTurbulence (Fork A1).** New `buildNoiseTile()` in `tile-atlas.js` bakes the EXACT popup SVG (`feTurbulence fractalNoise baseFrequency 0.8 numOctaves 2`, 160px) over opaque mid-grey → a 2nd texture (`uNoise`, unit 1, REPEAT/LINEAR/no-mip) created+loaded in `globe.js` (`#loadNoise`). `TILE_FRAG` now samples it SCREEN-stably (`uNoiseScale = 1/(160·dpr)`, matching the popup's 160px CSS tile so it can't minify/mip-away) and composites with the popup's REAL CSS blend math: `blendOverlay @0.18` on colour discs, `blendScreen @0.13` on the black disc (was round-5's harsh per-pixel `hash()` multiply). Flip-card CSS reverted to the popup grain exactly: `.tile-flip-front/back::after` → 0.18 overlay / 0.13 screen / 160px. Chrome crop confirms soft organic grain.
- **#2 SAFARI BLUR — symbol mip-0 (probe4).** Built `observatory-probe4.{html,js}` — measures **symbol-edge acutance on the LIVE globe framebuffer** (readPixels, mean |Δluma| + top-5% inside the focused tile) across foreground configs, beacons to the logger. Made the foreground LOD bias a uniform (`uFgBias`, `globe.js` `fgBias`, + probe setters `setForegroundBias`/`setForegroundMinFilter`/`_probeRender`). **Chrome result:** top-5% acutance `mml b-0.5` (round-5 current) **145.4** vs `mml b-1.5` **171.5** = ties no-mip / mip-0 ceiling while KEEPING mips for far-tile AA. **ROOT CAUSE found:** round 5's procedural-disc rewrite silently reverted round 4's `-1.5` → `-0.5` = the residual blur. **Fix: `fgBias = -1.5`.** SDF NOT needed (raster at mip 0 = Chrome parity). ⚠ Safari probe4 + eyeball still owed.
- **#3 FLIP — tile-proportional (Fork B1).** Dropped the fixed `clamp(300,52vw,440px)`; `observatory.js` now sizes `.tile-flip-card` per-open from the live tile: `max(tileDiameter·1.6, 260px floor)` capped to 92vw/vh (`FLIP_GROW`/`FLIP_MIN_PX`, tunable). Open + close derive from the same `flipRect` → no size jump; width reset on close. Added a `console.info` confirming `globe._frozen===true` on open (freeze verification).
- **#4 HALO — fit factor.** `observatory.js` writes `--halo-r = getSphereScreenRadius()·HALO_FIT` (`0.78`). Measured (halo beacon): equator projects ~1081px vs frame half-width 700 — the sphere **overflows the frame at every zoom** (FOV compensates the dolly), so the old halo genuinely sat beyond the visible cloud. 0.78 (mid of Memo's 0.7–0.85) pulls it in; one tunable constant for Memo's eye.

**PHOTOS (Memo dropped footage at `assets/images/comet-collabs/campaign-footage/<Campaign>/`):**
- `build.mjs` hero resolution made flexible: a `hero:` value containing `/` resolves under `assets/images/` (so footage subpaths work); bare filename still → `assets/images/campaigns/`.
- Frontmatter `hero:` set for **horizon-001** (`…/Horizon001/DJI_0537-1024x768.jpg`), **stardust-001** (`…/Stardust001/IMG_2364.jpg`), **stardust-003** (`…/Stardust003/HoGP.png`) — web-friendly picks (skipped the 10MB A4 JPEGs, the `.heic` Chrome can't decode, the PDF). stardust-002 (no footage) + horizon-002 (black manifesto) unchanged.
- `tile-atlas.js drawCampaignCell`: hero present → `drawCover` photo → **accent wash `HERO_TINT_ALPHA = 0.35`** (Memo asked ~30%; evaluated at the real ~200px tile size — label legible at every 0.30–0.55 because the label's dark shadow is the backstop, so 0.35 honours ~30% with margin for brighter shots) → label. Cell is OPAQUE so the shader composite (`disc·(1−fg.a)+fg.rgb`, fg.a=1) replaces the procedural disc with the circle-clipped photo; transparent label-only/muse cells still reveal the procedural disc. Verified by rendering the real `buildAtlas` output (`atlas_eval`, temp): 3 hero cells correct, labels legible.

**Verification:** `npm run build` clean (57 modules; probe files NOT shipped); live globe boots error-free (Chrome SwiftShader WebGL2); noise crop soft/organic; symbol `-1.5` visibly crisper than `-0.5`; atlas hero bake correct. **Probes kept** as scaffolding (`observatory-probe{,2,3,4}.*` + `scripts/observatory/probe-logger.mjs`).

**⚠ Open follow-ups:** (1) **Safari**: Memo runs `observatory-probe4.html` (`node scripts/observatory/probe-logger.mjs` first) + eyeballs noise/flip/halo/photos — the #2 gate. (2) **Footage ships 75MB to `dist/`** — Vite copies the whole `campaign-footage/` folder (huge JPEGs/heic/PDF) though only 3 small heroes are used → curate a `heroes/` folder or downscale before publish. (3) photo tiles sample at `fgBias −1.5` (mip 0) → mild aliasing possible on fine photo detail; add a per-instance hero-bias if Memo sees it. (4) HALO_FIT/FLIP_* tunables await Memo's eye.

### 13.22 ROUND-7 (2026-06-22) — CODE AUDIT + Memo Safari/mobile review → ROUND 8 agenda
This chat: (a) ran a full code audit of the observatory page → seeded a **living tracker at repo-root `website-audit.md`** (issues OBS-1…9, severity-ordered, stable IDs, statuses — keep it updated). No hard render bug found; the publish blockers are the **dist footage bloat** (OBS-1 73MB unused footage + OBS-2 a 19MB hero PNG drawn at ~200px + OBS-3 junk `.DS_Store`/PDF/heic). (b) Memo eyeballed round 6 on **Safari + mobile** → **ROUND 6 NOT accepted**; new asks (all logged in `website-audit.md`):
1. **HALO too dominant** (OBS-10) — `HALO_FIT 0.78` still too big/bright (equator projects ~1081px vs ~700px half-frame → sphere overflows the frame); lower the fit and/or dim the gradient alphas. Files: `observatory.js` `HALO_FIT`, `observatory.css` `#observatory-halo`.
2. **FLIP card too big + text spills the circle** (OBS-11) — `FLIP_GROW 1.6` / `FLIP_MIN_PX 260` overshoot; back-face copy overflows the inscribed circle. Shrink the card and/or tighten back-face type+padding so all copy fits. Files: `observatory.js` `flipCardSize`, `observatory.css` `.tile-flip-back`/`.tile-flip-desc`.
3. **FLIP open/close glitches** (OBS-12) — the anchored grow/shrink (double-rAF transform + freeze/thaw) isn't clean; re-derive for a smooth anchored transition. Files: `observatory.js` `openFlip`/`closeFlip`.
4. **Mobile PINCH-to-zoom** (OBS-13) — add a 2-pointer pinch gesture → same zoom `frac`/scale the pill drives; must coexist with (suppress) Arcball rotate while two fingers are down. Files: `globe-controls.js`, `observatory.js` `initZoomControl`.
Still in flight: **Safari symbol blur** (probe4 gate, §13.21 #2) — re-confirm under round 8. More to discuss in the new chat. Plan-first into a new §13.23 before building; nothing committed.

**Process note:** the chat got too long and I (Claude) FAILED to proactively flag + checkpoint per the standing [[long-chat-checkpoint-law]] instruction. Corrected here: full checkpoint + a migration prompt (`observatory-round6-handoff.md`). New chat starts fresh from that handoff.

### 13.23 ROUND-8 (2026-06-22) — BUILT, Chrome-verified, uncommitted · PENDING Memo's Safari/mobile eyeball
Fresh chat per `observatory-round8-handoff.md`. Memo's headline complaints: the flip card detached/glitched instead of growing from the clicked tile, was too small/unreadable, the title was weak, and the focused tile zoomed in so far it bled off-frame (yet was too small zoomed out, esp. mobile). Plan in `/Users/Memo/.claude/plans/ok-lets-work-on-happy-blossom.md` (approved). All four workstreams built + verified in headless Chrome (SwiftShader) via PIL crops + a `?flipdemo` / `?scale=` dev hook; device feel owed to Memo.

- **A — Seamless flip morph (OBS-12).** Root cause found: `openFlip` unhid the card at full centred size, THEN inverted onto the tile one rAF later → ONE painted frame of the big centred card = the "second card layered on top" Memo saw. Fix: set the inverted (tile-mapped) transform in the SAME synchronous task as `wrap.hidden=false`, then force ONE reflow to commit it BEFORE any paint (canonical FLIP). The card centres in the viewport (fixed symmetric flex wrap) so the inverted transform is computed analytically from `window.innerWidth/2` — no `getBoundingClientRect` (which needs a paint, the old timing trap). Also: the **front face now mirrors the WebGL tile** (hero photo cover-fit + accent wash + label for campaigns; white symbol for muses) so the morph grows from the SAME image, not a different disc (`fillFlip`, `.tile-flip-hero`/`-hero-wash`).
- **B — Always-big readable card (OBS-11).** `flipCardSize()` now returns a FIXED size `min(vw,vh)·0.82` clamped to `[~300, 560]`px, DECOUPLED from the tile (`FLIP_GROW`/`FLIP_MIN_PX` removed). The morph still ORIGINATES from the exact clicked tile (`openFlip` maps the big card onto `{cx,cy,r}` from `getActiveTileScreen()`), so a tiny zoomed-out tile grows UP to the readable size — Memo's "always big" + exact-origin morph, both satisfied.
- **C — Curved rim title + button.** The eyebrow is now a seal-style SVG `<textPath>` along the inside top arc (`rimSvg()`; e.g. "STARDUST · BIO-DIVERSITY · 2026" in the accent hue), freeing the disc centre for title + summary + button — the other half of the OBS-11 copy-fit fix. "View record →" → **"Explore →"**.
- **D — Zoom bounds + pinch + halo.** Memo's call: bound the FOCUSED TILE (not the whole globe — the globe may keep overflowing). **Key geometry:** the camera recomputes FOV from distance (`globe.js:500`), so the dolly only resizes the FRONT tile (perspective loom), and the focused-tile size as a fraction of the viewport's smaller dimension is **orientation-independent** → ONE bound set covers mobile + desktop. But the muse↔campaign size gap was 2× (`SIZE_BY_KIND 0.5/1.0`) — no single zoom could keep a campaign in-frame AND a muse non-tiny, so narrowed to **0.66/0.9** (≈1.36×). Bounds `MIN 1.3 / MAX 2.1` (was 1.2/3.6), default `1.6`: at max-in a centred campaign ≈ 0.8·vmin (in frame, margin); at max-out ≈ comfortable, not tiny. **Pinch-to-zoom** (OBS-13): 2 touch pointers on the canvas drive the same `frac` as the pill/wheel (`initZoomControl`); `ArcballControl.paused` suppresses rotate while two fingers are down. **Halo** (OBS-10, secondary — Memo didn't raise it this round): conservative dim `HALO_FIT 0.78→0.70` + alphas `0.18→0.11`/`0.10→0.06`.
- **BUILD stamp** bumped to `r8.0 · 2026-06-22`. `npm run build` clean (57 modules; probe files excluded).
- **Dev hooks kept** (`?`-gated, inert otherwise, like `viewport-debug.js`): `?scale=X` previews a zoom level; `?flipdemo[=N]` auto-opens a flip (+`&face=front` holds the front face) for headless screenshots; `?zoomprobe` writes the focused-tile metric to `<title>`.
- **Caveat (headless artifact):** under `--virtual-time-budget` the arcball doesn't fully settle, so the focused tile sat ~14% off-centre in captures and exact disc sizes are approximate — the bounds were set for a CENTRED tile (the real-browser resting state) and final feel is Memo's device eyeball. **STILL OWED:** Memo's Safari/mobile eyeball on flip smoothness / morph / curved title / zoom feel / pinch; **Safari symbol blur** probe4 gate (§13.21 #2) unchanged. Nothing committed.