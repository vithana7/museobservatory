// Muse Observatory — record-page HTML template (Phase 1, minimal/correct).
// Visual design is Phase 2; this renders a clean, self-contained static page.
//
// CSS is INLINED (tokens.css + record.css) so each record is fully standalone —
// no dependency on Vite's bundle graph or any /src path that won't exist in dist.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');

// Inline tokens + record CSS. Read fresh each call (cheap; keeps dev preview in
// sync when either stylesheet is edited).
function inlineCss() {
  const tokens = fs.readFileSync(path.join(ROOT, 'src/styles/tokens.css'), 'utf8');
  const record = fs.readFileSync(path.join(ROOT, 'src/observatory/record.css'), 'utf8');
  return `${tokens}\n${record}`;
}

export const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const blank = (v) => v == null || v === '';
const present = (...parts) => parts.filter((p) => !blank(p));

// One <dt>/<dd> row, or '' when the value is blank.
function fact(label, value) {
  if (blank(value)) return '';
  return `<div class="fact"><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;
}

// Render the type-specific factual block from frontmatter (present fields only).
function renderFacts(meta) {
  const rows = [];
  if (meta.type === 'stardust') {
    rows.push(fact('Artist', meta.artist));
    rows.push(fact('Partner', meta.partner));
    rows.push(fact('NGO', meta.ngo));
    rows.push(fact('Fund split', meta.fundSplit));
    rows.push(fact('Funds raised', meta.fundsRaised));
    if (meta.transferred && !blank(meta.transferred.amount)) {
      const t = meta.transferred;
      rows.push(fact('Transferred', present(t.amount, t.to && `→ ${t.to}`, t.date && `(${t.date})`).join(' ')));
    }
    if (meta.event && present(meta.event.name, meta.event.date, meta.event.location).length) {
      const e = meta.event;
      rows.push(fact('Event', present(e.name, e.date, e.location).join(' · ')));
    }
  } else if (meta.type === 'horizon') {
    rows.push(fact('Host', meta.host));
    rows.push(fact('Partner', meta.partner));
    if (meta.festival && present(meta.festival.name, meta.festival.date, meta.festival.location).length) {
      const f = meta.festival;
      rows.push(fact('Festival', present(f.name, f.date, f.location).join(' · ')));
    }
    rows.push(fact('Embedded artist', meta.embeddedArtist));
    if (meta.participants && !blank(meta.participants.total)) {
      const p = meta.participants;
      const bits = present(
        p.total && `${p.total} total`,
        p.community && `${p.community} community`,
        p.embeddedArtists && `${p.embeddedArtists} embedded`,
        p.nationalities && `${p.nationalities} nationalities`,
      );
      rows.push(fact('Participants', bits.join(' · ')));
    }
    rows.push(fact('Question', meta.question));
  }
  const html = rows.filter(Boolean).join('\n');
  return html ? `<aside class="record-facts"><dl>${html}</dl></aside>` : '';
}

/**
 * @param {{ meta: object, joined: {cause,hex}|null, bodyHtml: string, draft: boolean,
 *          base?: string, hero?: string|null, images?: string[] }} args
 *        base = Vite's base path ('/' or '/museobservatory/'); always trailing-slashed.
 *        hero/images = root-absolute /assets/images/<slug>/<file> paths (re-rooted onto base here).
 * @returns {string} full <!doctype html> document
 */
export function renderRecordPage({ meta, joined, bodyHtml, draft, base = '/', hero = null, images = [] }) {
  const accent = joined?.hex || 'var(--color-black)';
  const typeLabel = meta.type === 'horizon' ? 'Horizon' : 'Stardust';
  const numLabel = blank(meta.number) ? '' : ` ${String(meta.number).padStart(3, '0')}`;
  const cause = joined?.cause || null;
  const eyebrow = present(`${typeLabel}${numLabel}`, cause).join(' · ');
  const meta2 = present(meta.year, meta.location).join(' · ');
  const desc = present(cause, `${typeLabel}${numLabel}`, meta.location).join(' · ');
  const title = meta.title || meta.slug;

  // root-absolute (/assets/…) → base-rooted (subpath-safe on GitHub Pages), same as the favicon.
  const asset = (p) => `${base}${String(p).replace(/^\//, '')}`;
  const heroFig = hero
    ? `<figure class="record-hero"><img src="${esc(asset(hero))}" alt="${esc(title)}" loading="lazy"></figure>`
    : '';
  const galleryImgs = (Array.isArray(images) ? images : []).filter(Boolean);
  const multi = galleryImgs.length > 1;
  // Swipeable, auto-LOOPING slideshow: scroll-snap track (native swipe) + minimal ‹ › arrows + dots,
  // plus a continuous auto-advance that loops seamlessly — all wired by the inlined script below.
  // Each photo shows WHOLE (contain; page-coloured letterbox) so artworks aren't cropped.
  const gallery = galleryImgs.length
    ? `<section class="record-gallery" aria-label="Campaign images">
<div class="gallery-viewport">
<ul class="gallery-track" id="gallery-track">
${galleryImgs.map((src, i) => `<li class="gallery-slide"><img src="${esc(asset(src))}" alt="${esc(title)} — image ${i + 1}" loading="lazy"></li>`).join('\n')}
</ul>
${multi ? `<button type="button" class="gallery-arrow gallery-prev" aria-label="Previous image"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 6 9 12 15 18"/></svg></button>
<button type="button" class="gallery-arrow gallery-next" aria-label="Next image"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18"/></svg></button>` : ''}
</div>
${multi ? '<div class="gallery-dots" role="tablist" aria-label="Choose image"></div>' : ''}
</section>`
    : '';

  // cocoex footer — mirrors the main site (dark band: mission · socials · wordmark · legal).
  const footer = `<footer class="record-footer">
<p class="footer-mission">Art moves people.<br>People move the world.</p>
<div class="footer-social" aria-label="Social media links">
<a href="https://t.me/coco_ex" target="_blank" rel="noopener noreferrer" aria-label="Telegram"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg></a>
<a href="https://instagram.com/cocoex_" target="_blank" rel="noopener noreferrer" aria-label="Instagram"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z"/></svg></a>
<a href="https://www.linkedin.com/company/cocoex/" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg></a>
</div>
<img src="${base}assets/images/cocoex-text.png" alt="cocoex" class="footer-wordmark" loading="lazy">
<p class="footer-legal">cocoex e.V. · Berlin<br>Non-profit registered association</p>
</footer>`;

  // Inlined slideshow controller (only with >1 photo). Keeps each record page standalone (same
  // reason the CSS is inlined). Native scroll-snap does the swipe; this auto-advances + loops
  // CONTINUOUSLY (seamless via a trailing clone of slide 0), builds the dots, syncs on manual
  // swipe, pauses during an active drag, and honours reduced-motion (no auto-play).
  const galleryScript = multi
    ? `<script>
(function () {
  var track = document.getElementById('gallery-track');
  if (!track) return;
  var slides = Array.prototype.slice.call(track.children);
  var N = slides.length;
  if (N < 2) return;
  var dotsWrap = document.querySelector('.gallery-dots');
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DELAY = 3500;
  var idx = 0, timer = null;
  // Seamless loop: a clone of slide 0 trails the last real slide, so advancing past the end
  // glides into an identical frame, then we snap back to the real first invisibly.
  var clone = slides[0].cloneNode(true);
  clone.setAttribute('aria-hidden', 'true');
  track.appendChild(clone);
  var dots = slides.map(function (s, i) {
    var d = document.createElement('button');
    d.type = 'button'; d.className = 'gallery-dot';
    d.setAttribute('aria-label', 'Go to image ' + (i + 1));
    d.addEventListener('click', function () { stop(); go(i); start(); });
    dotsWrap.appendChild(d); return d;
  });
  function nearest() {
    var n = 0, best = Infinity, ch = track.children;
    for (var i = 0; i < ch.length; i++) {
      var d = Math.abs(ch[i].offsetLeft - track.scrollLeft);
      if (d < best) { best = d; n = i; }
    }
    return n;
  }
  function setDots(a) {
    for (var i = 0; i < dots.length; i++) dots[i].setAttribute('aria-selected', String(i === a));
  }
  function go(i) {
    idx = i;
    track.scrollTo({ left: track.children[i].offsetLeft, behavior: reduce ? 'auto' : 'smooth' });
    setDots(i % N);
  }
  function next() { go(idx >= N ? 1 : idx + 1); }
  function prev() { go(idx <= 0 ? N - 1 : idx - 1); }
  function advance() { if (!document.hidden) next(); }
  function start() { if (!reduce && !timer) timer = setInterval(advance, DELAY); }
  function stop() { clearInterval(timer); timer = null; }
  var settle;
  track.addEventListener('scroll', function () {
    clearTimeout(settle);
    settle = setTimeout(function () {
      var n = nearest();
      if (n === N) { track.scrollTo({ left: 0, behavior: 'auto' }); idx = 0; setDots(0); }
      else { idx = n; setDots(n % N); }
    }, 120);
  }, { passive: true });
  track.addEventListener('pointerdown', stop, { passive: true });
  window.addEventListener('pointerup', function () { setTimeout(start, 800); }, { passive: true });
  var prevBtn = document.querySelector('.gallery-prev');
  var nextBtn = document.querySelector('.gallery-next');
  if (prevBtn) prevBtn.addEventListener('click', function () { stop(); prev(); start(); });
  if (nextBtn) nextBtn.addEventListener('click', function () { stop(); next(); start(); });
  setDots(0);
  start();
})();
</script>`
    : '';

  const draftBanner = draft
    ? `<p class="record-draft-banner">Draft — contains unverified <code>[confirm]</code> notes; not published.</p>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(meta.title || meta.slug)} — cocoex Observatory</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="${draft ? 'noindex' : 'index, follow'}">
<link rel="icon" href="${base}assets/images/logowhite.png" type="image/png">
<link rel="preconnect" href="https://use.typekit.net">
<link rel="stylesheet" href="https://use.typekit.net/afs8ors.css">
<style>${inlineCss()}</style>
</head>
<body class="observatory-record" style="--accent:${accent}">
${draftBanner}
<a class="record-back" href="${base}">← Observatory</a>
<article class="record">
<header class="record-header">
<p class="record-eyebrow">${esc(eyebrow)}</p>
<h1>${esc(title)}</h1>
${meta2 ? `<p class="record-meta">${esc(meta2)}</p>` : ''}
</header>
${heroFig}
${renderFacts(meta)}
<div class="record-body">
${bodyHtml}
</div>
${gallery}
</article>
${footer}
${galleryScript}
</body>
</html>
`;
}
