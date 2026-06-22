// Probe #4 (round 6 #2) — measure SYMBOL-edge acutance on the REAL live globe framebuffer,
// across foreground-sampling configs, on Chrome (baseline) + Safari (beacon). The disc is
// procedural (config-independent) now, so any acutance DIFFERENCE between configs is the
// white symbol/label — the remaining Safari blur suspect. Pick the config sharp on BOTH.
//
// Method: build the live Globe, let it settle (focused tile stable), STOP the loop, then for
// each config set the foreground bias + min-filter, force one synchronous render, and
// gl.readPixels the focused-tile box. Acutance = mean adjacent-pixel |Δluma|; we report the
// mean of the TOP 5% gradients too (isolates the strong symbol edges from the soft grain).
import { Globe } from '/src/observatory/globe.js';
import { MUSES } from '/src/data.js';

const LOGGER = 'http://localhost:7777/log';
const MUSE_HEX = { lunes:'#5783A6', ares:'#D54D2E', rabu:'#8CB07F', thunor:'#F8D86A', shukra:'#7F49A2', dosei:'#5E47A1', solis:'#D48348' };
const log = (m) => { const e = document.getElementById('status'); if (e) e.textContent = m; };
const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// configs to sweep (foreground/symbol sampling only)
const CONFIGS = [
  { id: 'mml b0',     filter: 'mml',         bias: 0.0 },
  { id: 'mml b-0.5',  filter: 'mml',         bias: -0.5 },  // round 4/5 current
  { id: 'mml b-1.5',  filter: 'mml',         bias: -1.5 },
  { id: 'mml b-10',   filter: 'mml',         bias: -10.0 }, // ≈ force mip 0
  { id: 'linear',     filter: 'linear',      bias: 0.0 },   // no mips at all
  { id: 'mmlNearest', filter: 'mml-nearest', bias: -0.5 },
];

function acutance(px, w, h, cx, cy, rad) {
  const luma = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    luma[i] = 0.299 * px[i*4] + 0.587 * px[i*4+1] + 0.114 * px[i*4+2];
  }
  const grads = [];
  let sum = 0, n = 0;
  const r2 = (rad * 0.92) * (rad * 0.92);
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const dxp = (x - cx), dyp = (y - cy);
      if (dxp*dxp + dyp*dyp > r2) continue;     // inside the disc only
      const i = y * w + x;
      const g = Math.abs(luma[i+1] - luma[i]) + Math.abs(luma[i+w] - luma[i]);
      sum += g; n++; grads.push(g);
    }
  }
  grads.sort((a, b) => b - a);
  const top = grads.slice(0, Math.max(1, Math.floor(grads.length * 0.05)));
  const topMean = top.reduce((a, b) => a + b, 0) / top.length;
  return { meanAll: +(sum / Math.max(1, n)).toFixed(3), top5: +topMean.toFixed(3), samples: n };
}

async function measureScale(items, scale, label) {
  const canvas = document.getElementById('globe');
  const globe = new Globe(canvas, items, { scale });
  globe.resize(); globe.start(); await globe.loadAtlas();
  await sleep(2600);                 // settle + let the font re-upload finish
  const gl = globe.gl;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const s = globe.getActiveTileScreen();
  if (!s) { globe.dispose(); return { label, scale, error: 'no active tile' }; }

  // focused-tile box in DEVICE px (readPixels origin = bottom-left → flip Y)
  const W = canvas.width, H = canvas.height;
  let rD = Math.round(s.r * dpr);
  let bx = Math.round(s.cx * dpr - rD);
  let by = Math.round(H - (s.cy * dpr) - rD);   // bottom-left corner
  let bw = rD * 2, bh = rD * 2;
  // clamp to framebuffer
  bx = Math.max(0, bx); by = Math.max(0, by);
  bw = Math.min(bw, W - bx); bh = Math.min(bh, H - by);
  const cxBox = (s.cx * dpr) - bx, cyBox = (H - (s.cy * dpr)) - by;

  // stop the loop so nothing else touches the buffer between render and readback
  globe.running = false;

  const buf = new Uint8Array(bw * bh * 4);
  const results = {};
  for (const cfg of CONFIGS) {
    globe.setForegroundMinFilter(cfg.filter);
    globe.setForegroundBias(cfg.bias);
    globe._probeRender();             // synchronous render with this config
    gl.readPixels(bx, by, bw, bh, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    results[cfg.id] = acutance(buf, bw, bh, cxBox, cyBox, rD);
  }
  globe.dispose();
  return { label, scale, dpr, focusedR_css: Math.round(s.r), box: { bw, bh }, results };
}

async function run() {
  const campaigns = await (await fetch('/campaigns.json', { cache: 'no-store' })).json();
  const items = [
    ...MUSES.map((m) => ({ kind:'muse', name:m.name, hex:MUSE_HEX[m.name.toLowerCase()], symbol:`/assets/images/muse/${m.name.toLowerCase()}-white.png` })),
    ...campaigns.map((c) => ({ kind:'campaign', title:c.title, hex:c.hex, hero:c.hero?`/${c.hero}`:null, type:c.type, number:c.number })),
  ];
  document.body.classList.add('globe-active');

  log('measuring default zoom (scale 2.0)…');
  const def = await measureScale(items, 2.0, 'default(2.0)');
  log('measuring zoomed-in (scale 1.2)…');
  const zin = await measureScale(items, 1.2, 'zoomed-in(1.2)');

  const payload = { tag: 'probe4', browser: navigator.userAgent, metric: 'symbol-edge acutance (mean |Δluma|; higher=sharper)', default: def, zoomedIn: zin };
  document.getElementById('out').innerHTML = `<pre>${JSON.stringify(payload, null, 2)}</pre>`;
  log('DONE — beaconing…');
  try { await fetch(LOGGER, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) }); log('DONE ✓ (beaconed)'); }
  catch (e) { log('beacon failed (read the JSON above): ' + e.message); }
}
run().catch((e) => { log('ERR ' + (e.message || e)); document.getElementById('out').innerHTML = `<pre>${(e.stack||e)}</pre>`; });
