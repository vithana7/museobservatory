# CLAUDE.md — Muse Observatory

cocoex's public **campaign archive**: markdown campaigns → a JSON index + static record
pages, presented through a WebGL globe (the "wow" view) and a grid/list (find/scan).
No backend server, no database, no auth.

## Read the docs first

The current spec lives in `docs/` — read it before changing anything:
- **`docs/architecture.md`** — the 4-layer model, data flow, backend/frontend rationale. Start here.
- **`docs/data-schema.md`** — frontmatter + `campaigns.json` contracts + structured geo.
- **`docs/decisions.md`** — every locked decision, with *why*.
- **`docs/roadmap.md`** — build order + open questions.
- **`docs/archive/`** — history (8 rounds of globe iteration) + the living issue tracker. Not current spec.

## Run

```bash
./dev.sh           # dev server (hot-reload)
./dev.sh preview   # production build + preview ("what actually ships")
```

## The 4-layer mental model

```
LAYER 4 · VIEWS      globe · grid · record pages        ← artistic polish
LAYER 3 · SELECTION  session-random sample + filters    ← the scaling engine (not built yet)
LAYER 2 · INDEX      campaigns.json (compiled)          ← single source of truth
LAYER 1 · DATA       markdown frontmatter               ← bedrock
```

Layers 1–3 are pure data/logic (no WebGL, testable, device-independent). Build them solid
*before* the visual layer. The globe is a *view* fed a bounded subset — never the navigation.

## Standing rules

- **Foundation before art.** Build order is schema → selection layer → wire views → polish (decision A-3).
- **Globe device-polish is frozen** until layers 1–3 are solid (decision G-D).
- **Markdown is the source of truth.** Don't introduce a server/DB; if editing-by-file
  becomes the bottleneck, add a git-CMS (Decap/Tina), not Strapi (decision B-1).
- **Do not commit unless asked.** Working branch: `memo-edits-1906`.
- **Verify empirically** — headless Chrome (SwiftShader) + the `?`-gated dev hooks for the
  globe; Safari is eyeballed by Memo (no screencapture on this host).
- **Keep docs fresh:** after meaningful changes, run `/doc-minder` to reconcile `docs/` with the code.

## Tech

Vanilla JS (no frameworks, by rule) · WebGL2 + `gl-matrix` (globe) · Vite (build + dev) ·
`gray-matter` + `marked` (build-time markdown only — never shipped to the client).
