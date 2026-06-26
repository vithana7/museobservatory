// Muse Observatory globe — tile FOREGROUND atlas (round 5).
//
// The coloured disc (radial gradient + film grain + AA edge) is now drawn PROCEDURALLY
// in the fragment shader (globe-shaders.js) from a per-instance accent colour — sharp at
// any size/zoom. So this atlas holds ONLY the foreground that's composited over that disc:
// the white muse symbol (engraved) or the campaign type-number label, on a TRANSPARENT
// background. A simple white glyph survives minification far better than a baked gradient+
// grain disc did (the round-4 Safari blur), and the atlas is now small (CELL 512 → 2048²).

// 512: globe tiles render only ~200px on-screen even zoomed in (probe round 4), so a 512
// cell downsamples the ~933px source symbols cleanly and keeps the atlas tiny. (Was 1024,
// which only existed to give the baked disc headroom — no longer baked.)
const CELL = 512;

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    // NOTE: do NOT set crossOrigin for our same-origin assets — Safari taints the canvas
    // (same-origin image fetched with crossOrigin but no CORS headers) → texImage2D throws.
    img.onload = async () => {
      try { await img.decode?.(); } catch { /* decode is best-effort */ }
      resolve(img);
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// ── grain tile (round 6 #1) ─────────────────────────────────────────────────────
// The EXACT muse-popup grain: feTurbulence fractalNoise baseFrequency 0.8 / numOctaves 2,
// stitched, 160px tile (verbatim the SVG in .muse-card-inside::after). Baked once to a
// canvas and sampled SCREEN-stably in TILE_FRAG so the globe disc grain reads identically
// to the popup — soft/organic, not the round-5 per-pixel hash static.
const NOISE_SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E";
const NOISE_SIZE = 160; // match the popup's 160px CSS tile so REPEAT period == popup period

export async function buildNoiseTile() {
  const img = await loadImage(NOISE_SVG);
  const canvas = document.createElement('canvas');
  canvas.width = NOISE_SIZE;
  canvas.height = NOISE_SIZE;
  const ctx = canvas.getContext('2d');
  // opaque white base, then the noise over it → an OPAQUE grain tile (no alpha ambiguity
  // on upload); the shader reads .rgb. The browser renders feTurbulence identically per
  // the SVG spec, so this is the same pattern the popup shows.
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, NOISE_SIZE, NOISE_SIZE);
  if (img) ctx.drawImage(img, 0, 0, NOISE_SIZE, NOISE_SIZE);
  return canvas;
}

// draw an image cover-fit (centre-crop) into a CELL×CELL box at (ox, oy). Kept for future
// campaign hero photos (none yet) — a hero would be opaque, replacing the procedural disc.
function drawCover(ctx, img, ox, oy) {
  const ar = img.width / img.height;
  let sw = img.width;
  let sh = img.height;
  if (ar > 1) sw = img.height;
  else sh = img.width;
  const sx = (img.width - sw) / 2;
  const sy = (img.height - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, ox, oy, CELL, CELL);
}

// white muse symbol, engraved, on transparent — composited over the procedural disc.
function drawMuseCell(ctx, ox, oy, symbol) {
  if (!symbol) return;
  const cx = ox + CELL / 2;
  const cy = oy + CELL / 2;
  const s = CELL * 0.8; // ~80% of the disc, matching the popup symbol-to-disc ratio
  ctx.save();
  // soft dark engrave shadow so the white glyph holds on light hues (Thunor/Rabu)
  ctx.shadowColor = 'rgba(0,0,0,0.32)';
  ctx.shadowBlur = CELL * 0.03;
  ctx.shadowOffsetY = CELL * 0.012;
  ctx.drawImage(symbol, cx - s / 2, cy - s / 2, s, s);
  ctx.restore();
}

// "Stardust 001" / "Horizon 002" — type + zero-padded number; cause is implied by colour.
function typeNumberLabel(item) {
  const type = item.type === 'horizon' ? 'Horizon' : 'Stardust';
  const num = typeof item.number === 'number' ? String(item.number).padStart(3, '0') : '';
  return num ? `${type} ${num}` : type;
}

// #rrggbb / #rgb → rgba() string at alpha a.
function hexToRgba(hex, a) {
  const h = (hex || '').replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (n.length < 6) return `rgba(0,0,0,${a})`;
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// Hero duotone tint — the muse-colour treatment over a campaign photo, kept in lockstep with the
// flip card's CSS (.tile-flip-hero / -hero-wash / .has-hero::before) so the morph hand-off shows
// no jump. "Tamed duotone" (chosen on the ?tint live compare, 2026-06-25 / decision V-4): the
// photo is SOFTENED first (contrast/brightness) so the full-strength `color` blend recolours it
// into the muse hue boldly but without the harsh contrast the raw blend had. `blend` is a Canvas2D
// composite op with a matching CSS mix-blend-mode. Eyeball-tunable — keep the CSS values in sync.
const HERO_TINT = {
  blend: 'color',                                  // duotone blend; canvas globalCompositeOperation === CSS mix-blend-mode
  alpha: 1.0,                                      // muse shade strength (CSS: .tile-flip-hero-wash opacity)
  photoFilter: 'contrast(0.82) brightness(1.06)',  // soften the photo BEFORE the blend (CSS: .tile-flip-hero filter)
  scrimCenter: 0.29,                               // dark label-scrim centre alpha (CSS: .has-hero::before)
};

// centred type+number label, white with a soft dark shadow.
function drawCampaignLabel(ctx, ox, oy, item) {
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.97)';
  ctx.font = `700 ${CELL * 0.1}px canela, Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.85)';
  ctx.shadowBlur = CELL * 0.06;
  ctx.fillText(typeNumberLabel(item), ox + CELL / 2, oy + CELL / 2);
  ctx.restore();
}

function drawCampaignCell(ctx, ox, oy, item, hero) {
  if (hero) {
    // hero photo (cover-fit) → contrast-soften → duotone tint → label scrim → label. The cell is
    // fully OPAQUE, so the shader composite (col = disc·(1−fg.a) + fg.rgb, fg.a=1) replaces the
    // procedural disc with the photo, circle-clipped.
    ctx.save();
    ctx.filter = HERO_TINT.photoFilter;          // "tamed": soften the photo BEFORE the colour blend
    drawCover(ctx, hero, ox, oy);
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = HERO_TINT.blend; // DUOTONE: matches .tile-flip-hero-wash mix-blend-mode
    ctx.fillStyle = hexToRgba(item.hex || '#000000', HERO_TINT.alpha);
    ctx.fillRect(ox, oy, CELL, CELL);
    ctx.restore();                                // restore() resets the composite op before the label
    // Soft dark scrim behind the centred label so white text seats on the bright photo while the
    // disc RIM stays vibrant. The centre alpha drives the falloff (0.44× at 40%, 0 at 66%).
    // Matches .tile-flip-front.has-hero::before.
    const lx = ox + CELL / 2, ly = oy + CELL / 2;
    const c = HERO_TINT.scrimCenter;
    const scrim = ctx.createRadialGradient(lx, ly, 0, lx, ly, CELL * 0.66);
    scrim.addColorStop(0, `rgba(0,0,0,${c})`);
    scrim.addColorStop(0.40, `rgba(0,0,0,${c * 0.44})`);
    scrim.addColorStop(0.66, 'rgba(0,0,0,0)');
    ctx.fillStyle = scrim;
    ctx.fillRect(ox, oy, CELL, CELL);
    drawCampaignLabel(ctx, ox, oy, item);
    return;
  }
  // no hero → label on transparent, reads over the procedural disc behind it.
  drawCampaignLabel(ctx, ox, oy, item);
}

/**
 * @param {Array} items  globe items: { kind:'muse'|'campaign', symbol?, hero?, type?, number? }
 * @returns {Promise<{canvas: HTMLCanvasElement, atlasSize: number}>}
 */
export async function buildAtlas(items) {
  // NOTE: do NOT block on document.fonts.ready here — on Safari that stalled the whole
  // atlas on Typekit. Globe.loadAtlas re-builds + re-uploads once Canela resolves so the
  // baked campaign labels sharpen serif → Canela.

  const count = Math.max(1, items.length);
  const atlasSize = Math.ceil(Math.sqrt(count));
  const canvas = document.createElement('canvas');
  canvas.width = atlasSize * CELL;
  canvas.height = atlasSize * CELL;
  const ctx = canvas.getContext('2d'); // starts fully transparent — the disc is procedural

  // preload every cell's foreground image (muse symbol or campaign hero)
  const imgs = await Promise.all(items.map((it) => {
    const src = it.kind === 'muse' ? it.symbol : it.hero;
    return src ? loadImage(src) : Promise.resolve(null);
  }));

  items.forEach((item, i) => {
    const ox = (i % atlasSize) * CELL;
    const oy = Math.floor(i / atlasSize) * CELL;
    if (item.kind === 'muse') drawMuseCell(ctx, ox, oy, imgs[i]);
    else drawCampaignCell(ctx, ox, oy, item, imgs[i]);
  });

  return { canvas, atlasSize };
}
