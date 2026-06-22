---
# ── Muse Observatory campaign template ───────────────────────────────
# Copy to content/campaigns/<slug>.md, fill in, rebuild.
# Cause + colour are DERIVED from `muse` via the MUSES map — never retype them.
# Leave a field blank (or delete it) if N/A; the record page renders only
# the sections/fields that have content.

type:                  # stardust | horizon
number:                # sequential within the type (1, 2, 3 …)
slug:                  # e.g. stardust-004-... — also the URL + this filename
title:                 # campaign title
muse:                  # lunes | ares | rabu | thunor | shukra | dosei | solis
status:                # ongoing | closed | upcoming
year:                  # e.g. 2026
location:              # e.g. Volpedo, Alessandria · Italy
hero:                  # tile image filename (else images[0]); blank on upcoming → muse-colour placeholder tile
images: []             # record-page gallery, e.g. [a.jpg, b.jpg]

# ── Stardust factual block (delete this block for a Horizon entry) ──
artist:
partner:
ngo:
fundSplit:             # e.g. 50% artist / 50% NGO  (per-cycle, not a default)
fundsRaised:
transferred: { amount: , to: , date: }     # date = YYYY-MM-DD
event: { name: , date: , location: }

# ── Horizon factual block (delete this block for a Stardust entry) ──
host:
partner:
festival: { name: , date: , location: }
embeddedArtist:
participants: { total: , community: , embeddedArtists: , nationalities: }
question:              # the Future Lab question
---

<!-- BODY = narrative sections (markdown). The factual block above renders separately.
     STARDUST sections:  The work · The event · The Comet · Impact · Images
     HORIZON  sections:  The question · The Future Lab · What the community proposed ·
                         The artworks · The report · What came after · Impact · Images
     Omit any section you have no content for. -->

## ...
