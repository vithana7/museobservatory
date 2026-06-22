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

const esc = (s) =>
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
 * @param {{ meta: object, joined: {cause,hex}|null, bodyHtml: string, draft: boolean }} args
 * @returns {string} full <!doctype html> document
 */
export function renderRecordPage({ meta, joined, bodyHtml, draft }) {
  const accent = joined?.hex || 'var(--color-black)';
  const typeLabel = meta.type === 'horizon' ? 'Horizon' : 'Stardust';
  const numLabel = blank(meta.number) ? '' : ` ${String(meta.number).padStart(3, '0')}`;
  const cause = joined?.cause || null;
  const eyebrow = present(`${typeLabel}${numLabel}`, cause).join(' · ');
  const meta2 = present(meta.year, meta.location).join(' · ');
  const desc = present(cause, `${typeLabel}${numLabel}`, meta.location).join(' · ');

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
<link rel="icon" href="/assets/images/logowhite.png" type="image/png">
<link rel="preconnect" href="https://use.typekit.net">
<link rel="stylesheet" href="https://use.typekit.net/afs8ors.css">
<style>${inlineCss()}</style>
</head>
<body class="observatory-record" style="--accent:${accent}">
${draftBanner}
<a class="record-back" href="/">← Observatory</a>
<article class="record">
<header class="record-header">
<p class="record-eyebrow">${esc(eyebrow)}</p>
<h1>${esc(meta.title || meta.slug)}</h1>
${meta2 ? `<p class="record-meta">${esc(meta2)}</p>` : ''}
</header>
${renderFacts(meta)}
<div class="record-body">
${bodyHtml}
</div>
</article>
</body>
</html>
`;
}
