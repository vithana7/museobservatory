# Decision log

> ADR-lite. Each entry: the decision, the context, and *why*. Knowing the why lets a
> future reader judge edge cases instead of blindly following the rule. Newest section
> first. Earlier per-round build decisions live in
> [archive/build-history.md](archive/build-history.md).

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
  *Status:* to finalise when building layer 3 — see [roadmap.md](roadmap.md).

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
