---
name: doc-minder
description: Reconcile the docs/ set with the actual code, decisions, and content so the documentation doesn't rot. Reports drift and updates what's stale.
user-invocable: true
allowed-tools: Bash, Read, Edit, Grep, Glob
argument-hint: "[optional: a specific doc or area to focus on, e.g. 'data-schema' or 'globe']"
---

# /doc-minder — keep the docs honest

The `docs/` set is the project's current spec. Code drifts away from it. This command
re-checks the docs against reality and fixes what's stale. **Documentation, not code** —
never change `src/` here; only the docs.

## What the docs are (the source of truth to maintain)

- `docs/architecture.md` — 4-layer model, data flow, backend/frontend rationale, scaling.
- `docs/data-schema.md` — frontmatter + `campaigns.json` contracts + structured geo.
- `docs/frontend.md` — views (globe + grid) + the selection layer (layer 3) + securing plan.
- `docs/decisions.md` — the decision log (ADR-lite), with *why*.
- `docs/questions.md` — the living list of open questions + known things to sort.
- `docs/archive/` — history; **read-only**, do not edit (except appending finished rounds).
- `CLAUDE.md` (root) — the short orientation; keep it in sync with the docs.

## Workflow

### 1. Detect drift
Compare the docs against the live code + content. Check, at minimum:

- **Schema:** does `docs/data-schema.md` match the real frontmatter in
  `content/campaigns/*.md` and the JSON shape emitted by `scripts/observatory/build.mjs`?
  (Run `./dev.sh preview` or read `build.mjs` to confirm the actual `campaigns.json` shape.)
  Check the filename-identity rule (D-1), the `assets/images/<slug>/` bare-filename hero
  convention, and the warn-only validation list still match `build.mjs`.
- **Authoring commands:** does `.claude/commands/create-new-event.md` still match the schema
  it scaffolds (fields asked, derived fields skipped, filename + asset-folder rules)?
- **Modules:** does `docs/architecture.md`'s module map match `src/observatory/*` and
  `src/webgl/*`? New/renamed/deleted files?
- **Decisions:** are any decisions in `docs/decisions.md` now contradicted by the code
  (e.g. a "frozen" thing was changed, a "deferred" thing was built)?
- **Questions:** are any "open questions" in `docs/questions.md` now resolved in code, or any
  "not built" items now built? (Resolved ones move to `decisions.md` with their *why*.)
- **Stale references:** grep the docs for file paths, function names, and flags; flag any
  that no longer exist (see the OBS-8 class of stale-comment drift in the audit).
- **Commands/run:** does `CLAUDE.md` / `docs/README.md` still describe the real
  `package.json` scripts and `dev.sh` modes?

### 2. Report
Before editing, summarise the drift found as a short list: `doc → what's stale → proposed fix`.
Keep it tight. If a decision *changed* (not just code detail), surface it — that may need a
new `docs/decisions.md` entry, which is a judgement call worth confirming.

### 3. Update
Apply the fixes to the docs. Rules:
- **Preserve the *why*** in `decisions.md` — update the decision, keep its rationale.
- **Don't rewrite `docs/archive/`** — it's history. A superseded decision gets a note in
  the current docs, not a rewrite of the archive.
- **Don't invent decisions.** If the code does something no decision covers, flag it as an
  open question in `questions.md` rather than back-filling a decision.
- Keep each doc to its purpose (don't merge spec into history or vice versa).

### 4. Confirm
List what changed, one line each. Note anything you flagged but did *not* change (e.g. a
real decision shift that needs Memo's call).

## Scope argument
If given an argument (e.g. `data-schema` or `globe`), focus the drift-check there instead
of the full sweep.
