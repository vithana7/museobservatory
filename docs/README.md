# Muse Observatory — Documentation

The Muse Observatory is cocoex's **campaign archive**: a public site where every
Stardust (artist-led) and Horizon (community-led) campaign lives as a long-form record.
The landing page is a WebGL globe; each record is a static, shareable article.

## Where to read

| Doc | What it is |
|-----|------------|
| [architecture.md](architecture.md) | **The current spec.** The 4-layer model, data flow, the backend rationale, and how the system is meant to scale. Start here. |
| [data-schema.md](data-schema.md) | The contracts: campaign frontmatter, `campaigns.json`, and the structured-geo schema. |
| [decisions.md](decisions.md) | The decision log (ADR-lite). Every locked choice, with *why*. |
| [roadmap.md](roadmap.md) | Build order + the questions that are still genuinely open. |
| [archive/](archive/) | History, not spec: the round-by-round build log and the living issue tracker. |

## Run it

```bash
./dev.sh           # dev server (hot-reload) — for working
./dev.sh preview   # production build + preview — "what actually ships"
npm test           # node:test — locks the build's campaigns.json output (no deps)
```

## Keeping docs fresh

Docs rot. Run `/doc-minder` (a project Claude command) to re-check the docs against
the actual code + decisions and update what has drifted.
