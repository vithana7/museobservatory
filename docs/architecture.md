# Architecture — current spec

> The single source of truth for *how the system works and why*. If something here
> disagrees with the code, one of them is wrong — fix it (run `/doc-minder`).
> History of how we got here lives in [archive/build-history.md](archive/build-history.md).

## What this is

A public **campaign archive** for cocoex. Content is authored as markdown, compiled at
build time into a JSON index + static HTML pages, and presented through two views: a
WebGL globe (the "wow" view) and a grid/list (the find/scan view). No backend server,
no database, no auth.

## The four layers

```
┌─────────────────────────────────────────────────────────┐
│  LAYER 4 · VIEWS    globe (wow) · grid (find) · record    │  ← Memo's art lives here
├─────────────────────────────────────────────────────────┤
│  LAYER 3 · SELECTION   session-random sample + filters    │  ← the scaling engine
├─────────────────────────────────────────────────────────┤
│  LAYER 2 · INDEX       campaigns.json (the contract)      │  ← single source of truth (compiled)
├─────────────────────────────────────────────────────────┤
│  LAYER 1 · DATA        markdown frontmatter + schema      │  ← the bedrock
└─────────────────────────────────────────────────────────┘
```

The design principle: **layers 1–3 are pure data + logic — no WebGL, no Safari, no
devices.** They can be built and tested in isolation. Layer 4 (the visual/artistic
polish) sits on top and cannot destabilise the foundation beneath it. This ordering is
deliberate: build the foundation solid first, decorate second.

### Layer 1 — Data (markdown)

One `.md` file per campaign in `content/campaigns/`. YAML frontmatter = the structured,
machine-readable facts; the markdown body = the narrative prose. Cause + colour are
*derived* from the `muse` field (never retyped). See [data-schema.md](data-schema.md).

### Layer 2 — Index (`campaigns.json`)

`scripts/observatory/build.mjs` compiles every campaign into a single `campaigns.json`
(metadata only) plus one static HTML record page per page-worthy campaign. The build is
**dumb on purpose**: it emits the *complete* list and does no sampling or filtering —
that is the client's job (layer 3). Markdown never reaches the browser.

Identity is derived from the filename (decision D-1/D-2); validation is warn-only
(`validateCampaign`, D-3) except the draft gate; the emitted shape is the `CampaignIndex`
typedef and is pinned by `npm test` (`build.test.mjs`) so refactors can't silently change it.

### Layer 3 — Selection (the scaling engine) — *built + tested*

`src/observatory/selection.js` (pure, no DOM/WebGL; covered by `selection.test.mjs`) sits
between `campaigns.json` and the views:
- **Session-random sample** for the globe's initial state — `sample(campaigns, n, seed)`,
  a seeded shuffle so tiles stay stable within a visit and are fresh next time. The globe
  shows a bounded subset ("you happen to be on these", not the whole archive).
- **Filters** — `filterCampaigns(campaigns, { muse, type, geo, status })`, ANDed; returns
  the **true** matching set (not a re-sample). geo is a regex over all geo fields.
- **Sparse-set guard** — `applySparseGuard(matches, threshold)`; on a sparse match the
  filter forces the list view rather than padding the globe (A-4, resolved).

It is wired in `observatory.js`: `boot()` samples the landing set, `initFilters()` builds
the filter UI and swaps `globe.setItems()` + the list on every facet change. This is what
lets the archive grow without limit while the globe stays a fixed, performant size. See
the locked semantics (S-1/S-2/S-3) in [decisions.md](decisions.md).

### Layer 4 — Views

- **Globe** (`src/observatory/globe.js` et al.) — WebGL2, ported from reactbits'
  InfiniteMenu. Renders whatever subset layer 3 hands it via `setItems`. The "wow" view.
- **Grid/list** — the accessible, scannable peer. Rendered unconditionally and kept in
  sync with the filtered set. A first-class sighted peer: the `.filter-wrap` rail has a
  globe↔list toggle (`body.list-view`), and a sparse filter match auto-falls-back to it
  (G-C / A-4, see [decisions.md](decisions.md)).
- **Record pages** — generated static HTML, one per campaign.

## Data flow

```
content/campaigns/*.md
        │  build-time: gray-matter + marked  (build.mjs)
        ▼
   campaigns.json  +  static record pages
        │  fetched by the browser
        ▼
   selection layer (session-random + filters)
        │  subset
        ├──► globe.setItems(subset)
        └──► grid(subset)
```

## Backend evaluation — markdown, not a CMS server

**Verdict: markdown-as-source is the correct backend here. A server-backed CMS (Strapi
et al.) would be infrastructure solving problems we don't have.**

The "it's just files over the network" worry is addressed by the build model: `.md`
files are a **build-time source format**, never a runtime payload. The browser only ever
receives `campaigns.json` (small — metadata only) and static HTML. That is exactly what a
headless CMS would also serve you, minus the server, database, hosting cost, and request
round-trip.

| Driver | Markdown wins | CMS server wins |
|--------|---------------|-----------------|
| Editors | Memo + devs | Many non-technical editors |
| Churn | Occasional, high-effort campaigns | Daily, high-volume |
| Volume | Tens → low hundreds | Thousands needing server-side query |
| Live updates | No (rebuild on publish is fine) | Yes (change without deploy) |
| Infra | Zero servers / DB / cost | Run + secure + pay |

cocoex's campaigns are infrequent, curated artefacts — the markdown model gives free
static hosting, perfect SEO, no server to secure, and git as a free version history /
audit log.

**Deferred upgrade path:** if hand-editing files becomes the bottleneck, add a *git-based*
CMS (Decap or TinaCMS) — a web form that commits *the same markdown* to the repo. Memo
gets an admin UI **without** introducing a server, database, or a new source of truth.
This defers the server/DB decision until it's genuinely needed. Strapi stays off the
table unless requirements change fundamentally (many editors, high churn, live updates).

## Frontend evaluation — vanilla JS + Vite

**Verdict: sound, with one watch-item (the globe's device fragility).**

- **No framework (vanilla JS):** appropriate for a small, mostly-static site. Avoids
  React/Vue bundle weight and churn. The cost is hand-rolled DOM, acceptable at this size.
- **`gl-matrix`** (only client dep): tiny, math-only. Justified for the globe.
- **Vite:** good fit — fast dev server, clean static build, the content pipeline plugs in
  as a plugin.
- **InfiniteMenu port (the globe):** the one structural risk. It is ~350 lines of ported
  WebGL/shader code carrying its own scaling constraint (a fixed-vertex icosahedron — see
  the scaling note below) and a long history of device-rendering fights (Safari blur,
  flip, touch). Mitigation: the globe is a *view*, not the navigation — layer 3 keeps the
  tile set bounded, and the grid/list provides a robust path that doesn't depend on WebGL.

### How the globe scales (the key constraint)

InfiniteMenu uses a fixed 42-vertex icosahedron; tile `i` renders campaign `i % count`.
This means the globe does **not** scale by adding tiles — past 42 campaigns some would
never render. It scales by **always rendering a bounded subset** (layer 3's job):
session-random initially, filtered thereafter, capped at `CAMPAIGN_CAP = 42` (muses live
in the filter, not on the globe — S-1). The archive can grow to thousands while the globe
stays a fixed ≤42-tile, fixed-cost render. This is why layer 3 is the foundation, not the
globe.

## Deployment — static output to GitHub Pages

The build is static-output, so there is no runtime backend to host: `vite build` runs the
markdown pipeline at build time and emits `dist/` (HTML/JS/CSS + `campaigns.json` + record
pages). A GitHub Actions workflow (`.github/workflows/deploy.yml`) runs `npm ci` → `npm test`
→ `npm run build` → deploys `dist/` to GitHub Pages on every push to `main`. The site lives
at `vithana7.github.io/museobservatory/`.

Because it deploys under a **project subpath**, Vite's `base` is conditional —
`/museobservatory/` when the workflow sets `GITHUB_PAGES=1`, `/` for local dev and the
custom domain. Paths Vite can't rewrite (they live in JSON/JS, not HTML) are re-rooted at
runtime against `import.meta.env.BASE_URL`; the record-page template takes `base` threaded
from the Vite plugin. See DEPLOY-1 in [decisions.md](decisions.md). (Enabling Pages itself is
a repo-admin toggle, not in the repo.)

## What is NOT in scope (deliberately)

- No authentication / user accounts (the site is public; "random per visit" is
  session-seeded, client-side).
- No server, no database.
- No map / geocoding / lat-long (geo filtering uses discrete country/region/city fields).
