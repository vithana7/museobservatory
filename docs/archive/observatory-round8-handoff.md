# Muse Observatory — ROUND 8 handoff (paste into a fresh chat)

> Created 2026-06-22. Round 6 is built & Chrome-verified but **NOT accepted** — Memo reviewed it on
> Safari + mobile and flagged halo/flip/pinch issues, and a full code audit found a 73MB publish
> blocker. Round 8 = fix these. This is the migration prompt — start the new chat with everything below.

---

Continue the cocoex Muse Observatory (branch `memo-edits-1906`, **all uncommitted — don't commit
unless I ask**). Read FIRST, before any code:
- **`website-audit.md`** (repo root) — the living issue tracker; OBSERVATORY section, issues **OBS-1…13**
  with severity + files + fixes. This is the round-8 to-do list. Keep it updated (move fixed items to
  *Resolved*, don't delete; bump *Last updated*).
- `museobservatory.md` §13 — esp. **§13.22** (round-7 audit + Memo's review → round-8 agenda),
  §13.21 (what round 6 built), §13.20 (the locked forks).
- memories: `website-audit-living-tracker`, `safari-billboard-texture-sharpness`, `muse-observatory-plan`,
  `proof-everything-verification`, `plan-first-workflow`, `long-chat-checkpoint-law`.

## ROUND 8 — the work (plan-first, proof-don't-assume)

**Publish blockers (independent of any review — can start immediately):**
- **OBS-1/2/3 — dist bloat.** `dist/` ships 73MB: Vite copies the whole
  `public/assets/images/comet-collabs/campaign-footage/` folder (unused A4 JPEGs + a `.heic` + a PDF +
  `.DS_Store`), and one *used* hero is a **19MB PNG drawn at ~200px**. Curate/downscale the 3 used
  heroes to ~768px web JPEGs (PIL, not ImageMagick) + keep raw footage OUT of `public/`. Confirm
  `dist/` shrinks (`npm run build` + `du -sh dist`). Files: the footage folder, `content/campaigns/*.md`
  `hero:`, `scripts/observatory/build.mjs`.

**Memo's round-7 review (round 6 rejected — these are the felt issues):**
1. **OBS-10 — HALO too dominant.** Lower `HALO_FIT` (`observatory.js`, currently 0.78) and/or dim the
   `#observatory-halo` gradient alphas (`observatory.css`) — it should be a soft glow on the cloud edge,
   not a big bright ring. (Root: the equator projects ~1081px vs ~700px half-frame → the sphere
   overflows the frame at every zoom.) Tune by eye with Memo.
2. **OBS-11 — FLIP card too big + text spills the circle.** `FLIP_GROW 1.6` / `FLIP_MIN_PX 260`
   (`observatory.js`) overshoot; back-face copy overflows the inscribed circle. Shrink the card and/or
   tighten back-face type+padding (`observatory.css` `.tile-flip-back`/`.tile-flip-desc`) so ALL copy
   fits inside the circle at every size.
3. **OBS-12 — FLIP open/close glitches.** The anchored grow/shrink (double-rAF transform + freeze/thaw,
   `openFlip`/`closeFlip`) isn't clean — re-derive for a smooth "tile turns" transition; verify
   `freeze()` engages before the first painted frame.
4. **OBS-13 — mobile PINCH-to-zoom.** Add a 2-pointer pinch gesture → drives the same zoom `frac`/scale
   the pill drives; must coexist with / suppress Arcball rotate while two fingers are down. Files:
   `globe-controls.js`, `observatory.js` `initZoomControl`.

**Still in flight (don't lose):** Safari **symbol blur** — the probe4 acutance gate (§13.21 #2,
`fgBias −1.5`). Re-confirm on Safari under round 8 (logger + `observatory-probe4.html`). Memo will keep
discussing more items in the new chat.

## Setup
- Dev: `npm run dev` (Vite :5173); observatory at `/observatory/`. A second `--host` instance can serve
  mobile over the LAN (`192.168.2.108:5175/observatory/`). `npm run build` must stay clean (57 modules;
  probe files excluded). Bump the `BUILD` stamp (`observatory.js`, bottom-left + console) on each change.
- **Verify empirically:** Chrome headless (SwiftShader WebGL2) + PIL crops for desktop; Safari/mobile =
  Memo's eyeball + the readPixels beacon (`node scripts/observatory/probe-logger.mjs` :7777). The host
  CANNOT screencapture Safari.

**Working agreement (standing LAWS — honor without being asked):** plan into `museobservatory.md §13.x`
+ get my sign-off BEFORE implementing; verify empirically, never claim "solved" without proof; keep
`website-audit.md` current as we work; and **if the chat gets dense/long, PROACTIVELY checkpoint all
md/memory + hand me a fresh new-chat prompt** (this round-8 doc is the template). Nothing committed.
