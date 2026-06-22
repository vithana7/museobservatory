---
# ── Muse Observatory campaign template ───────────────────────────────
# Copy to content/campaigns/TYPE+NNN.md (e.g. STARDUST004.md or HORIZON003.md),
# fill in, rebuild.
#
# FILENAME IS THE IDENTITY. type, number, and slug are ALL derived from the
# filename — never written here:
#   STARDUST001.md  →  type: stardust · number: 1 · slug + URL: /stardust001/
# To renumber or retype a campaign, rename the file. Pattern: (STARDUST|HORIZON)NNN.
#
# Cause + colour are DERIVED from `muse` via the MUSES map — never retype them.
# Leave a field blank (or delete it) if N/A; the record page renders only
# the sections/fields that have content.
#
# IMAGES live in public/assets/images/<slug>/ (folder named the slug, e.g.
# public/assets/images/stardust004/) — served at /assets/images/<slug>/<file>. hero +
# images entries are BARE FILENAMES resolved into that folder — never a path.
# Blank hero → muse-colour placeholder tile.

title:                 # campaign title
muse:                  # lunes | ares | rabu | thunor | shukra | dosei | solis
status:                # ongoing | closed | upcoming
year:                  # e.g. 2026
location:              # LIST — one entry per place (build joins them with " · " for display):
  # - Volpedo, Alessandria · Italy        # single place → a one-entry list
  # - Berlin                              # multi-place event → one line each
  # - Krefeld
hero:                  # bare filename in assets/images/<slug>/ (e.g. cover.jpg); blank → placeholder tile
images: []             # record-page gallery, bare filenames, e.g. [a.jpg, b.jpg]

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
