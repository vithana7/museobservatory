# Data schema — contracts

> The shapes that flow between layers. Frontmatter (authored) → `campaigns.json`
> (compiled) → views (consumed). Cause + colour are always *derived* from `muse`,
> never authored per campaign.

> **Authoring a new campaign?** Run `/create-new-event` — it auto-numbers, interviews for
> the fields it can't derive, writes the correctly-named file, and creates the image folder.
> The contract below is what it produces.

## Identity comes from the filename (not frontmatter)

A campaign's `type`, `number`, and `slug` are **derived from its filename** — the
single authority. Frontmatter must **not** restate them (the build warns and ignores
if it does).

```
content/campaigns/STARDUST001.md
                  ^^^^^^^^ ^^^
                  type     number (zero-padded, 3 digits)

  type   = stardust            # lowercased prefix
  number = 1                   # parsed from "001"
  slug   = stardust001         # lowercased filename — also the URL: /stardust001/
```

- **Pattern (enforced by warning):** `^(STARDUST|HORIZON)\d{3}\.md$`. A non-matching
  filename still builds, but warns and degrades identity to the bare basename.
- **Rename = retype/renumber.** To change a campaign's type or number, rename the file;
  the slug, URL, type, and number all move with it. Nothing to keep in sync.
- **Why uppercase on disk, lowercase URL:** the filename reads as a clear ID
  (`STARDUST001`), the public URL stays lowercase-conventional (`/stardust001/`).

## Campaign frontmatter (authored in `content/campaigns/*.md`)

### Shared fields (both types)

```yaml
# type / number / slug are NOT here — they come from the filename (see above).
title: Cantine Volpi
muse: rabu                         # → cause + hex, derived from the MUSES map
status: closed | ongoing | upcoming
year: 2025
location:                          # LIST — one entry per place (even a single place is a 1-item list)
  - Volpedo, Alessandria · Italy   #   multi-place event: one line per place (e.g. Berlin / Krefeld / …)
hero: 00-hero.jpg                  # BARE filename → assets/images/<slug>/00-hero.jpg (cover circle)
images: []                         # bare filenames, same folder — SHOWN IN FILENAME ORDER (1, 2 … 10)
```

> **Images live in `public/assets/images/<slug>/`** (decision D-4) — one folder per
> campaign, named exactly the slug (so `STARDUST004.md` → `public/assets/images/stardust004/`).
> Vite serves `public/` at the domain root, so they're referenced at runtime as root-absolute
> `/assets/images/<slug>/<file>`. `hero` and `images` entries are **bare filenames**, resolved
> into that folder by the build — the author never writes a path. A `hero` missing from that
> folder warns (never fails). Drop **web-sized** images here; raw originals stay out of the repo
> (automated downscaling is the deferred P2.1 `sharp` step).
>
> **Slideshow order = filename order.** `build.mjs` sorts `images[]` by filename, numeric-aware
> (so `2` precedes `10`) — the order they're *listed* in frontmatter is ignored. To reorder the
> record-page slideshow, rename the files; you don't edit the list. Convention used by the imported
> footage: `00-hero.*` = the cover, `1.jpg`, `2.jpg`, … = the slides in order. The `hero` is a
> separate banner and is **not** repeated in the slideshow (it's not in `images[]`).
>
> **Web copies** are downscaled with `sips` to **≤2400px** long edge, JPG quality ~85
> (HEIC/PNG → JPG), imported from the cocoex-website `comet-collabs/campaign-footage/` originals.

> **`location` is a list of free strings (one per place).** A single-place campaign is a
> one-item list; a multi-place event (e.g. HORIZON002 across Berlin · Krefeld · Salzburg ·
> Tortona) lists each place. The build emits `locations` (the array) **and** `location` (the
> `" · "`-joined display string) so views render the string directly without re-joining. A
> bare string is still tolerated (wrapped into a 1-item list) but warns — author it as a list.
>
> **Target geo schema (decision A-1 — not yet built).** This is the *planned* shape,
> tracked in [questions.md](questions.md). Each place is currently a free string; A-1
> would make each a structured `{city, region, country, display}` so places are filterable.
> When migrated, an entry becomes:
>
> ```yaml
> location:
>   city: Volpedo
>   region: Piedmont               # administrative region (the filterable facet)
>   country: Italy
>   display: Volpedo, Alessandria · Italy   # human-readable; shown on pages, never parsed
> ```
>
> The old single `location:` string is
> human-readable but not machine-filterable ("Colli Tortonesi" is a wine-area,
> "Alessandria" a province — different levels in one slot). Filters need discrete fields.
>
> - `city` / `region` / `country` are the **filterable facets**. `region` means the
>   **administrative** region (e.g. Piedmont) — consistent and predictable for filtering.
> - `display` is **free editorial text**, shown verbatim on tiles/pages and **never
>   parsed**. Cultural/territorial names (e.g. "Colli Tortonesi") live here.
> - **Authority:** structured fields are authoritative for filtering; `display` is
>   cosmetic. They can drift — the template guides Memo to keep them consistent.
> - **Degrades gracefully:** an early campaign may have `country` only; filters simply
>   don't offer region/city for it.

### Stardust factual block

```yaml
artist: Memose Vithana (Memo)
partner: Cantine Volpi, Volpedo
ngo: Anffas Tortona
fundSplit: 50% artist / 50% NGO
fundsRaised:
transferred: { amount: €2,500, to: Anffas Tortona, date: 2025-12-11 }
event: { name: , date: , location: }
```

### Horizon factual block

```yaml
host: Pro Loco Carezzano
partner: Slow Food Tortona
festival: { name: Vinili e Vinelli, date: September 2024, location: Carezzano }
embeddedArtist: Memose Vithana (Memo)
participants: { total: 34, community: 33, embeddedArtists: 1, nationalities: 10 }
question: How do we imagine models of sustainable tourism for the Colli Tortonesi?
```

### Body (markdown)

The narrative sections. Render only sections that have content (no empty headers).
- **Stardust:** The work · The event · The Comet · Impact · Images
- **Horizon:** The question · The Future Lab · What the community proposed · The artworks ·
  The report · What came after · Impact · Images

## `campaigns.json` (compiled by `build.mjs`, consumed by the client)

The complete index — *every* campaign, no sampling/filtering at build time.

```jsonc
[{
  "slug": "stardust001",                     // = lowercased filename (STARDUST001.md)
  "type": "stardust", "number": 1, "title": "Cantine Volpi",
  "muse": "rabu", "cause": "Human Rights", "hex": "#8CB07F",   // null,null if muse-less
  "status": "closed", "year": 2025,
  "locations": ["Volpedo, Alessandria · Italy"], // the real list (filter/count later)
  "location": "Volpedo, Alessandria · Italy", //  " · "-joined display string
  "hero": "/assets/images/stardust001/img-2364.jpg", // root-absolute; null → muse-colour placeholder
  "summary": "Memo — co-founder of cocoex…",  // first prose paragraph, capped
  "hasPage": true,                           // false = tile-only (no nav target)
  "draft": true,                             // OMITTED unless a page-worthy record is a held-back draft
  "filler": true,                            // OMITTED unless a globe-only density tile
  "url": "/stardust001/"                     // null when !hasPage
}]
```

> The authoritative field list is the `CampaignIndex` JSDoc `@typedef` in `build.mjs`
> (next to the emit) — keep this example in step with it. `draft`/`filler` are omitted
> entirely when not set (not emitted as `false`).
>
> **Still the target, not built (decision A-1):** each `locations` entry is a free
> string; the structured per-place `{city, region, country, display}` schema below is the
> *planned* shape for filtering, not the current emit.

## Derivation & degradation rules

- **Muse → cause + hex:** `muse` slug joins to cause (from `MUSES` in `src/data.js`) and
  hex (from `tokens.css`) at build. Unknown/blank muse → `cause: null, hex: null` (neutral
  tile, excluded from cause filters). Warns, never crashes.
- **Draft gating (the one hard gate):** a record with `[confirm]` markers or `draft: true`
  is held out of production builds; previewed in dev with a `noindex` banner. Detection is
  stateless (`hasConfirmMarker`) so it can't drift. Drafts never reach `dist/`.
- **Page-worthy vs tile-only:** body has real prose → emit a record page; comment-only stub
  (or `page: false`) → tile-only (no page, no `url`). `page: false` is *not* a draft.
- **Validation is warn-only (never fails the build), in `validateCampaign()`.** One grouped
  warning list for: off-pattern filename, redundant `type`/`number`/`slug` in frontmatter,
  unknown `muse`, unknown `status`, a `hero` missing under `public/assets/images/<slug>/`, a
  page-worthy record with no `title`, a bare-string `location`, and a duplicate slug (two
  files resolving to the same slug). The build still completes — warnings are a checklist,
  not a gate.
- **Locked by tests.** `scripts/observatory/build.test.mjs` (`npm test`, `node:test`, no
  deps) pins identity derivation, the draft gate, the muse join, location normalization, and
  the exact `campaigns.json` key set — so refactors can't silently change the emit.

## Open schema questions

Tracked in [questions.md](questions.md): the `filler` density-tile concept currently in
`build.mjs` (a precursor to layer-3 sampling) needs reconciling with the selection layer.
