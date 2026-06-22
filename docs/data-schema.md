# Data schema — contracts

> The shapes that flow between layers. Frontmatter (authored) → `campaigns.json`
> (compiled) → views (consumed). Cause + colour are always *derived* from `muse`,
> never authored per campaign.

## Campaign frontmatter (authored in `content/campaigns/*.md`)

### Shared fields (both types)

```yaml
type: stardust | horizon
number: 1
slug: stardust-001-cantine-volpi   # also the URL + filename
title: Cantine Volpi
muse: rabu                         # → cause + hex, derived from the MUSES map
status: closed | ongoing | upcoming
year: 2025
location:                          # STRUCTURED (see below) — replaces the old freeform string
  city: Volpedo
  region: Piedmont                 # administrative region (the filterable facet)
  country: Italy
  display: Volpedo, Alessandria · Italy   # human-readable; shown on pages, never parsed
hero: heroes/cantine-volpi.jpg     # downscaled web image; blank → muse-colour placeholder
images: []
```

> **Geo is structured (decision A-1).** The old single `location:` string was
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
  "slug": "stardust-001-cantine-volpi",
  "type": "stardust", "number": 1, "title": "Cantine Volpi",
  "muse": "rabu", "cause": "Human Rights", "hex": "#8CB07F",   // null,null if muse-less
  "status": "closed", "year": 2025,
  "location": {                              // structured (A-1)
    "city": "Volpedo", "region": "Piedmont", "country": "Italy",
    "display": "Volpedo, Alessandria · Italy"
  },
  "hero": "assets/images/heroes/cantine-volpi.jpg",   // null → muse-colour placeholder
  "hasPage": true,                           // false = tile-only (no nav target)
  "url": "/observatory/stardust-001-cantine-volpi/"   // null when !hasPage
}]
```

## Derivation & degradation rules

- **Muse → cause + hex:** `muse` slug joins to cause (from `MUSES` in `src/data.js`) and
  hex (from `tokens.css`) at build. Unknown/blank muse → `cause: null, hex: null` (neutral
  tile, excluded from cause filters). Warns, never crashes.
- **Draft gating:** a record with `[confirm]` markers (or `draft: true` / `page: false`)
  is held out of production builds; previewed in dev with a `noindex` banner.
- **Page-worthy:** body has real prose → emit a record page; comment-only stub → tile-only.

## Open schema questions

Tracked in [roadmap.md](roadmap.md): the `filler` density-tile concept currently in
`build.mjs` (a precursor to layer-3 sampling) needs reconciling with the selection layer.
