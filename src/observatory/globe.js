// Muse Observatory globe — InfiniteGridMenu ported to vanilla WebGL2 (`Globe`).
//
// Faithful port of reactbits InfiniteMenu's renderer, de-Reacted, with cocoex
// changes: a QuadGeometry tile face + per-instance `aIsCircle` flag (muse=circle,
// campaign=square — decision F1); the cell images are drawn by our tile-atlas
// builder; the canvas is alpha:true + blended so tiles float over the page/star
// backdrop; and a `setItems()` seam is exposed for Phase-4 filtering.

import { mat4, quat, vec2, vec3, vec4 } from 'gl-matrix';
import { TILE_VERT, TILE_FRAG } from './globe-shaders.js';
import { IcosahedronGeometry, QuadGeometry } from './globe-geometry.js';
import { ArcballControl } from './globe-controls.js';
import { buildAtlas, buildNoiseTile } from './tile-atlas.js';
import { arrangeOnGraph } from './selection.js';

const DPR = () => Math.min(2, window.devicePixelRatio || 1);

// read-only constants for the per-frame matrix math (targetTo never mutates them)
const ORIGIN = vec3.fromValues(0, 0, 0);
const UP = vec3.fromValues(0, 1, 0);

// ── tiny GL helpers (WebGL2-local; the shared gl-context.js is WebGL1) ──────────
function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  console.error(gl.getShaderInfoLog(shader));
  gl.deleteShader(shader);
  return null;
}

function createProgram(gl, sources, attribLocations) {
  const program = gl.createProgram();
  [gl.VERTEX_SHADER, gl.FRAGMENT_SHADER].forEach((type, i) => {
    const s = createShader(gl, type, sources[i]);
    if (s) gl.attachShader(program, s);
  });
  if (attribLocations) {
    for (const name in attribLocations) gl.bindAttribLocation(program, attribLocations[name], name);
  }
  gl.linkProgram(program);
  if (gl.getProgramParameter(program, gl.LINK_STATUS)) return program;
  console.error(gl.getProgramInfoLog(program));
  gl.deleteProgram(program);
  return null;
}

function makeBuffer(gl, data, usage) {
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, data, usage);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  return buf;
}

function resizeCanvasToDisplaySize(canvas) {
  const dpr = DPR();
  const w = Math.round(canvas.clientWidth * dpr);
  const h = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    return true;
  }
  return false;
}

// aInstanceMatrix occupies 4 consecutive locations (2,3,4,5); aInstanceColor follows at 6.
const ATTRIB = { aModelPosition: 0, aModelUvs: 1, aInstanceMatrix: 2, aInstanceColor: 6 };

// per-tile size: muses are anchors/filters → half the size of campaign tiles.
// Round 8 — narrowed the muse↔campaign size gap (was 0.5 / 1.0 = 2×). A 2× gap meant NO single
// zoom could keep a centred campaign tile inside the frame AND keep a centred muse from looking
// tiny (Memo: "not bleeding, not too small"). 0.66 / 0.9 (≈1.36×) gives a usable zoom range.
const SIZE_BY_KIND = { muse: 0.66, campaign: 0.9 };

// #rrggbb / #rgb → [r,g,b] in 0..1 (for the procedural-disc accent attribute).
function hexToRgb(hex) {
  const h = (hex || '').replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (n.length < 6) return [0.5, 0.5, 0.5];
  return [parseInt(n.slice(0, 2), 16) / 255, parseInt(n.slice(2, 4), 16) / 255, parseInt(n.slice(4, 6), 16) / 255];
}

export class Globe {
  TARGET_FRAME_DURATION = 1000 / 60;
  SPHERE_RADIUS = 2;

  #time = 0;
  #deltaTime = 0;
  #rafId = 0;
  running = false;

  camera = {
    matrix: mat4.create(),
    near: 0.1,
    far: 40,
    fov: Math.PI / 4,
    aspect: 1,
    position: vec3.fromValues(0, 0, 3),
    up: vec3.fromValues(0, 1, 0),
    matrices: { view: mat4.create(), projection: mat4.create() },
  };

  smoothRotationVelocity = 0;
  scaleFactor = 1.0;
  fgBias = -1.5;   // foreground (symbol/label) LOD bias. Round 6 #2 (probe4, live globe): −1.5 ties
                   // the no-mip / mip-0 ceiling for symbol-edge acutance (Chrome 171.5 vs −0.5's
                   // 145.4) while KEEPING mips for far tiles (AA). Round 5 had silently reverted
                   // round 4's −1.5 → −0.5 in the procedural-disc rewrite = the residual blur.
  movementActive = false;
  activeIndex = -1;
  activeVertexIndex = -1; // the sphere vertex the active tile snapped to (for screen projection)

  constructor(canvas, items = [], { onActiveItemChange, onMovementChange, onFrame, scale = 1.0 } = {}) {
    this.canvas = canvas;
    this.items = items;
    this.onActiveItemChange = onActiveItemChange || (() => {});
    this.onMovementChange = onMovementChange || (() => {});
    this.onFrame = onFrame || null; // per-frame hook (e.g. a shared starfield backdrop)
    this.scaleFactor = scale;
    this.camera.position[2] = 3 * scale;
    this.#initGL();
  }

  #initGL() {
    const gl = this.canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: false });
    if (!gl) throw new Error('No WebGL2 context');
    this.gl = gl;

    // NOTE: anisotropic filtering was tried (round 3) as the Safari blur fix and REMOVED
    // (round 4) — these tiles are camera-facing billboards (isotropic screen footprint),
    // which anisotropy doesn't help. The real fix is the strong negative LOD bias in
    // TILE_FRAG (clamps near/focused tiles to mip 0). Probe data: museobservatory.md §13.17.
    this.program = createProgram(gl, [TILE_VERT, TILE_FRAG], ATTRIB);
    this.loc = {
      uWorldMatrix: gl.getUniformLocation(this.program, 'uWorldMatrix'),
      uViewMatrix: gl.getUniformLocation(this.program, 'uViewMatrix'),
      uProjectionMatrix: gl.getUniformLocation(this.program, 'uProjectionMatrix'),
      uRotationAxisVelocity: gl.getUniformLocation(this.program, 'uRotationAxisVelocity'),
      uTex: gl.getUniformLocation(this.program, 'uTex'),
      uNoise: gl.getUniformLocation(this.program, 'uNoise'),
      uNoiseScale: gl.getUniformLocation(this.program, 'uNoiseScale'),
      uFgBias: gl.getUniformLocation(this.program, 'uFgBias'),
      uItemCount: gl.getUniformLocation(this.program, 'uItemCount'),
      uAtlasSize: gl.getUniformLocation(this.program, 'uAtlasSize'),
    };

    // tile face (quad) + index buffer
    this.geo = new QuadGeometry(1);
    this.buffers = this.geo.data;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    gl.bindBuffer(gl.ARRAY_BUFFER, makeBuffer(gl, this.buffers.vertices, gl.STATIC_DRAW));
    gl.enableVertexAttribArray(ATTRIB.aModelPosition);
    gl.vertexAttribPointer(ATTRIB.aModelPosition, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, makeBuffer(gl, this.buffers.uvs, gl.STATIC_DRAW));
    gl.enableVertexAttribArray(ATTRIB.aModelUvs);
    gl.vertexAttribPointer(ATTRIB.aModelUvs, 2, gl.FLOAT, false, 0, 0);

    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.buffers.indices, gl.STATIC_DRAW);

    // sphere of instance positions (42 vertices after one subdivision)
    this.ico = new IcosahedronGeometry();
    this.ico.subdivide(1).spherize(this.SPHERE_RADIUS);
    this.instancePositions = this.ico.vertices.map((v) => v.position);
    this.instanceCount = this.ico.vertices.length;
    this.adjacency = this.#buildAdjacency();
    // Arrange the item pool onto the vertices so no two ADJACENT circles show the same photo
    // (Memo: no "same background next to each other"), then same-campaign neighbours are
    // minimised too. Makes items.length === instanceCount so the shader's vInstanceId % count
    // becomes an identity map (vertex v → items[v]). See #arrangeItems.
    this.items = this.#arrangeItems(this.items);

    this.#initInstances();
    gl.bindVertexArray(null);

    // 1×1 transparent placeholder until the atlas resolves
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    this.atlasSize = 1;

    // grain texture (round 6 #1): the baked muse-popup feTurbulence tile, on its own unit.
    // REPEAT + LINEAR + NO mips — it's sampled SCREEN-stably (≈1:1), never minified, so it
    // stays crisp on Safari (unlike the round-3 cell-UV grain that mips averaged away). 128
    // mid-grey placeholder until the SVG bakes so an unsampled tile reads neutral (overlay
    // of 0.5 = identity → no grain flash before the real tile arrives).
    this.noiseTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.noiseTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 128, 255]));
    this.#loadNoise();

    this.worldMatrix = mat4.create();
    this.control = new ArcballControl(this.canvas, (dt) => this.#onControlUpdate(dt));

    this.#updateCameraMatrix();
    this.#updateProjectionMatrix();
    this.resize();
  }

  #initInstances() {
    const gl = this.gl;
    const count = this.instanceCount;

    // per-instance model matrices (rewritten every frame)
    this.instMatricesArray = new Float32Array(count * 16);
    this.instMatrices = [];
    for (let i = 0; i < count; ++i) {
      const view = new Float32Array(this.instMatricesArray.buffer, i * 16 * 4, 16);
      view.set(mat4.create());
      this.instMatrices.push(view);
    }
    this.instMatrixBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instMatrixBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.instMatricesArray.byteLength, gl.DYNAMIC_DRAW);
    const bytesPerMatrix = 16 * 4;
    for (let j = 0; j < 4; ++j) {
      const loc = ATTRIB.aInstanceMatrix + j;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, bytesPerMatrix, j * 4 * 4);
      gl.vertexAttribDivisor(loc, 1);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    // per-instance disc accent colour (rgb + a=isBlack flag) — drives the PROCEDURAL disc
    // in the shader. Static per item set; data uploaded by #computeInstanceColors.
    this.instColorArray = new Float32Array(count * 4);
    this.instColorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instColorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.instColorArray.byteLength, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(ATTRIB.aInstanceColor);
    gl.vertexAttribPointer(ATTRIB.aInstanceColor, 4, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(ATTRIB.aInstanceColor, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    this.#computeInstanceScales();
    this.#computeInstanceColors();
  }

  // fill + upload the per-instance accent colour from the current item set.
  #computeInstanceColors() {
    if (!this.instColorBuffer) return;
    const gl = this.gl;
    const len = Math.max(1, this.items.length);
    const arr = this.instColorArray;
    for (let i = 0; i < this.instanceCount; ++i) {
      const item = this.items[i % len];
      const hex = item?.hex;
      const isBlack = !hex || hex === '#000' || hex === '#000000';
      const [r, g, b] = isBlack ? [0, 0, 0] : hexToRgb(hex);
      arr[i * 4] = r; arr[i * 4 + 1] = g; arr[i * 4 + 2] = b; arr[i * 4 + 3] = isBlack ? 1 : 0;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instColorBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, arr);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  // per-instance size factor (muse 0.5 / campaign 1.0), applied in #animate. Kept in
  // JS rather than a GPU attribute since the model-matrix scale lives there anyway.
  #computeInstanceScales() {
    const len = Math.max(1, this.items.length);
    this.instanceScale = new Float32Array(this.instanceCount);
    for (let i = 0; i < this.instanceCount; ++i) {
      const item = this.items[i % len];
      this.instanceScale[i] = SIZE_BY_KIND[item?.kind] ?? 1.0;
    }
    // live per-instance world size (depth × baseScale × instanceScale), written each
    // frame in #animate — read by getActiveTileScreen() to size the flip anchor.
    this.instanceFinalScale = new Float32Array(this.instanceCount);
  }

  // Vertex adjacency of the spherised icosahedron: adjacency[v] = Set of vertices sharing an
  // edge with v (from the triangle faces). Drives #arrangeItems' "no same background adjacent".
  #buildAdjacency() {
    const adj = Array.from({ length: this.instanceCount }, () => new Set());
    for (const f of this.ico.faces) {
      adj[f.a].add(f.b); adj[f.a].add(f.c);
      adj[f.b].add(f.a); adj[f.b].add(f.c);
      adj[f.c].add(f.a); adj[f.c].add(f.b);
    }
    return adj;
  }

  // Place the item pool onto the vertices so no two ADJACENT circles share a background
  // (delegates to the pure, tested selection.arrangeOnGraph using this sphere's adjacency).
  #arrangeItems(pool) {
    return arrangeOnGraph(pool, this.adjacency, this.instanceCount);
  }

  // ── public seam: swap the item set (Phase-4 filtering) ────────────────────────
  async setItems(items) {
    this.items = this.#arrangeItems(items || []);
    this.activeIndex = -1;
    this.#computeInstanceScales(); // muse/campaign sizes for the new set
    this.#computeInstanceColors(); // procedural-disc accent colours for the new set
    await this.loadAtlas();
  }

  // ── public: zoom (the draggable pill slider drives this) ──────────────────────
  // scaleFactor multiplies the camera's target distance; #onControlUpdate dollies
  // toward 3 * scaleFactor, so the change eases in for free.
  setScale(s) {
    this.scaleFactor = Math.max(0.6, s);
  }

  async loadAtlas() {
    if (!this.items.length) return;
    const itemsAtBuild = this.items;     // guard against a setItems() swap racing us
    await this.#uploadAtlas(itemsAtBuild);

    // buildAtlas no longer blocks on document.fonts.ready (Safari stalled the whole atlas
    // on Typekit), so the first bake may use the serif fallback → fuzzy campaign labels.
    // Re-bake + re-upload ONCE Canela is available so the baked labels sharpen serif→Canela.
    if (this._fontReupload) return;
    this._fontReupload = true;
    const hasCanela = () => { try { return !!document.fonts?.check('700 1em canela'); } catch { return false; } };
    if (hasCanela()) return;             // first bake already had Canela — nothing to redo
    let done = false;
    const reupload = () => {
      if (done) return;
      done = true;
      if (this.items === itemsAtBuild) this.#uploadAtlas(itemsAtBuild);
    };
    // Re-upload on whichever resolves first: an explicit face load, document.fonts.ready,
    // OR a 3s timeout (belt-and-suspenders — the probe showed fonts.ready DOES fire on
    // Safari 26, but a timeout guarantees the sharpen even if neither promise ever settles).
    Promise.resolve(document.fonts?.load?.('700 1em canela')).then(reupload).catch(() => {});
    document.fonts?.ready?.then(reupload).catch(() => {});
    setTimeout(reupload, 3000);
  }

  async #uploadAtlas(items) {
    const { canvas, atlasSize } = await buildAtlas(items);
    if (this.items !== items) return;    // a newer setItems() won the race; drop this upload
    const gl = this.gl;
    this.atlasSize = atlasSize;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    // PREMULTIPLY: the atlas is now a transparent foreground (symbol/label) → premultiplied
    // alpha keeps mip minification from dark-fringing the white glyph edges. The shader
    // composites it premultiplied over the procedural disc.
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    // Keep the full trilinear mip chain so genuinely-minified far tiles anti-alias; the
    // strong negative uFgBias (this.fgBias = -1.5) in TILE_FRAG clamps the near/focused
    // symbol to ~mip 0 = crisp (round 6 #2, probe4-confirmed Safari fix).
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  }

  // bake + upload the popup feTurbulence grain tile (once). Opaque → premultiply is moot.
  async #loadNoise() {
    const canvas = await buildNoiseTile();
    if (!this.gl || !this.noiseTex) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.noiseTex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    // no generateMipmap: REPEAT + LINEAR, sampled ~1:1 at a fixed screen scale.
  }

  // ── loop ─────────────────────────────────────────────────────────────────────
  start() {
    if (this.running) return;
    this.running = true;
    this.#time = performance.now();
    this.#rafId = requestAnimationFrame((t) => this.#frame(t));
    if (!this._onVis) {
      this._onVis = () => { if (!document.hidden && this.running) { this.#time = performance.now(); } };
      document.addEventListener('visibilitychange', this._onVis);
    }
  }

  #frame(time) {
    if (!this.running) return;
    if (!document.hidden) {
      this.#deltaTime = Math.min(32, time - this.#time);
      this.#time = time;
      // _frozen (during a flip): hold the globe perfectly still so the focused tile stays
      // exactly under the flip card → open + close anchor to the SAME spot, no jump. The
      // globe is opacity:0 then anyway, so we skip animate+render but keep onFrame
      // (starfield/cloud/halo still breathe behind the card).
      if (!this._frozen) {
        this.#animate(this.#deltaTime);
        this.#render();
      }
      this.onFrame?.(time);
    }
    this.#rafId = requestAnimationFrame((t) => this.#frame(t));
  }

  // freeze/thaw the globe animation (the flip uses this so the tile can't drift away).
  freeze() { this._frozen = true; }
  thaw() { this._frozen = false; this.#time = performance.now(); } // reset to avoid a dt jump

  // ── round 6 #2 probe hooks: sweep the foreground (symbol) sampling on the LIVE globe ──
  setForegroundBias(b) { this.fgBias = b; }
  // mode: 'mml' (trilinear) | 'linear' (no-mip) | 'mml-nearest'
  setForegroundMinFilter(mode) {
    const gl = this.gl;
    const f = mode === 'linear' ? gl.LINEAR
      : mode === 'mml-nearest' ? gl.LINEAR_MIPMAP_NEAREST
      : gl.LINEAR_MIPMAP_LINEAR;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
  }
  // force a synchronous render so the probe can readPixels the SAME frame (the context has
  // no preserveDrawingBuffer). Stop the loop first so nothing else touches the buffer.
  _probeRender() { this.#render(); }

  dispose() {
    this.running = false;
    cancelAnimationFrame(this.#rafId);
    if (this._onVis) document.removeEventListener('visibilitychange', this._onVis);
    this.control?.dispose();
    // Release the GL resources we created (textures/buffers/program/VAO) so a disposed
    // globe doesn't leak GPU memory. Window/document listener teardown is deliberately
    // NOT built — no in-place re-init exists today (that's speculative SPA plumbing).
    const gl = this.gl;
    if (gl) {
      gl.deleteTexture(this.tex);
      gl.deleteTexture(this.noiseTex);
      gl.deleteBuffer(this.instMatrixBuffer);
      gl.deleteBuffer(this.instColorBuffer);
      gl.deleteProgram(this.program);
      gl.deleteVertexArray(this.vao);
    }
  }

  resize() {
    const gl = this.gl;
    if (resizeCanvasToDisplaySize(gl.canvas)) {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    }
    this.#updateProjectionMatrix();
  }

  #animate(deltaTime) {
    const gl = this.gl;
    this.control.update(deltaTime, this.TARGET_FRAME_DURATION);

    // Reused scratch — building these per instance per frame (~300 allocs/frame)
    // caused GC stutter on Safari. Allocate once; behaviour is identical.
    const sc = this._scratch || (this._scratch = {
      p: vec3.create(), neg: vec3.create(), sv: vec3.create(),
      m: mat4.create(), r: mat4.create(), s: mat4.create(),
      back: vec3.fromValues(0, 0, -this.SPHERE_RADIUS),
    });
    const baseScale = 0.275;   // +10% (Memo: bigger circles, less negative space — verify no halo bleed)
    const SCALE_INTENSITY = 0.6;
    const orient = this.control.orientation;

    for (let ndx = 0; ndx < this.instancePositions.length; ++ndx) {
      const p = vec3.transformQuat(sc.p, this.instancePositions[ndx], orient);
      const depth = (Math.abs(p[2]) / this.SPHERE_RADIUS) * SCALE_INTENSITY + (1 - SCALE_INTENSITY);
      const finalScale = depth * baseScale * this.instanceScale[ndx];
      this.instanceFinalScale[ndx] = finalScale;

      // model matrix = T(-p) · targetTo(origin→p) · S(finalScale) · T(0,0,-R)
      mat4.fromTranslation(sc.m, vec3.negate(sc.neg, p));
      mat4.targetTo(sc.r, ORIGIN, p, UP);
      mat4.multiply(sc.m, sc.m, sc.r);
      vec3.set(sc.sv, finalScale, finalScale, finalScale);
      mat4.fromScaling(sc.s, sc.sv);
      mat4.multiply(sc.m, sc.m, sc.s);
      mat4.translate(sc.m, sc.m, sc.back);
      mat4.copy(this.instMatrices[ndx], sc.m);
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, this.instMatrixBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.instMatricesArray);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    this.smoothRotationVelocity = this.control.rotationVelocity;
  }

  #render() {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.uniformMatrix4fv(this.loc.uWorldMatrix, false, this.worldMatrix);
    gl.uniformMatrix4fv(this.loc.uViewMatrix, false, this.camera.matrices.view);
    gl.uniformMatrix4fv(this.loc.uProjectionMatrix, false, this.camera.matrices.projection);
    gl.uniform4f(
      this.loc.uRotationAxisVelocity,
      this.control.rotationAxis[0],
      this.control.rotationAxis[1],
      this.control.rotationAxis[2],
      this.smoothRotationVelocity * 1.1,
    );
    gl.uniform1i(this.loc.uItemCount, Math.max(1, this.items.length));
    gl.uniform1i(this.loc.uAtlasSize, this.atlasSize);
    gl.uniform1i(this.loc.uTex, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);

    // grain on unit 1, sampled at a SCREEN-stable 160 CSS-px period (× dpr → device px,
    // since gl_FragCoord is device px) so it matches the popup's 160px CSS tile exactly.
    gl.uniform1i(this.loc.uNoise, 1);
    gl.uniform1f(this.loc.uNoiseScale, 1 / (160 * DPR()));
    gl.uniform1f(this.loc.uFgBias, this.fgBias);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.noiseTex);
    gl.activeTexture(gl.TEXTURE0);

    gl.bindVertexArray(this.vao);
    gl.drawElementsInstanced(gl.TRIANGLES, this.buffers.indices.length, gl.UNSIGNED_SHORT, 0, this.instanceCount);
    gl.bindVertexArray(null);
  }

  #updateCameraMatrix() {
    mat4.targetTo(this.camera.matrix, this.camera.position, [0, 0, 0], this.camera.up);
    mat4.invert(this.camera.matrices.view, this.camera.matrix);
  }

  #updateProjectionMatrix() {
    const gl = this.gl;
    // Aspect from the ACTUALLY-RENDERED buffer (the same dimensions gl.viewport uses — see
    // resize()), not the CSS box. On iOS Safari the two can diverge (backing-store clamp/rounding
    // or a stale client read), which skews the projection against the viewport and renders the
    // round, uniform-scaled billboard tiles as ellipses. Guard the pre-visible 0×0 case (→ NaN).
    const bw = gl.drawingBufferWidth, bh = gl.drawingBufferHeight;
    this.camera.aspect = bh > 0 ? bw / bh : 1;
    const height = this.SPHERE_RADIUS * 0.35;
    const distance = this.camera.position[2];
    this.camera.fov = this.camera.aspect > 1
      ? 2 * Math.atan(height / distance)
      : 2 * Math.atan(height / this.camera.aspect / distance);
    mat4.perspective(this.camera.matrices.projection, this.camera.fov, this.camera.aspect, this.camera.near, this.camera.far);
  }

  #onControlUpdate(deltaTime) {
    const timeScale = deltaTime / this.TARGET_FRAME_DURATION + 0.0001;
    let damping = 5 / timeScale;
    let cameraTargetZ = 3 * this.scaleFactor;

    const isMoving = this.control.isPointerDown || Math.abs(this.smoothRotationVelocity) > 0.01;
    if (isMoving !== this.movementActive) {
      this.movementActive = isMoving;
      this.onMovementChange(isMoving);
    }

    if (!this.control.isPointerDown) {
      const nearestVertexIndex = this.#findNearestVertexIndex();
      this.activeVertexIndex = nearestVertexIndex;
      const itemIndex = nearestVertexIndex % Math.max(1, this.items.length);
      if (itemIndex !== this.activeIndex) {
        this.activeIndex = itemIndex;
        this.onActiveItemChange(this.items[itemIndex], itemIndex);
      }
      const snapDirection = vec3.normalize(vec3.create(), this.#getVertexWorldPosition(nearestVertexIndex));
      this.control.snapTargetDirection = snapDirection;
    } else {
      cameraTargetZ += this.control.rotationVelocity * 80 + 2.5;
      damping = 7 / timeScale;
    }

    this.camera.position[2] += (cameraTargetZ - this.camera.position[2]) / damping;
    this.#updateCameraMatrix();
  }

  #findNearestVertexIndex() {
    const n = this.control.snapDirection;
    const inv = quat.conjugate(quat.create(), this.control.orientation);
    const nt = vec3.transformQuat(vec3.create(), n, inv);
    let maxD = -1;
    let nearest = 0;
    for (let i = 0; i < this.instancePositions.length; ++i) {
      const d = vec3.dot(nt, this.instancePositions[i]);
      if (d > maxD) { maxD = d; nearest = i; }
    }
    return nearest;
  }

  #getVertexWorldPosition(index) {
    return vec3.transformQuat(vec3.create(), this.instancePositions[index], this.control.orientation);
  }

  // Public: the globe sphere's on-screen radius in CSS px (the tiles sit on radius
  // SPHERE_RADIUS; the sphere centre is always screen-centre since the camera looks down
  // the z-axis at the origin). Drives the halo so it hugs the circumference + scales with
  // zoom. Approximated by projecting the front equator point (R,0,0) — close enough for a
  // soft glow, and it tracks the camera dolly for free.
  getSphereScreenRadius() {
    const vp = mat4.multiply(mat4.create(), this.camera.matrices.projection, this.camera.matrices.view);
    const cssW = this.gl.canvas.clientWidth;
    const cssH = this.gl.canvas.clientHeight;
    const proj = (x, y, z) => {
      const clip = vec4.transformMat4(vec4.create(), [x, y, z, 1], vp);
      if (clip[3] <= 0) return null;
      return [(clip[0] / clip[3] * 0.5 + 0.5) * cssW, (1 - (clip[1] / clip[3] * 0.5 + 0.5)) * cssH];
    };
    const c = proj(0, 0, 0);
    const e = proj(this.SPHERE_RADIUS, 0, 0);
    if (!c || !e) return null;
    return Math.hypot(e[0] - c[0], e[1] - c[1]);
  }

  // Public: the sphere centre's on-screen position in CSS px (projection of the origin).
  // The halo is centred at the viewport centre, so comparing this against
  // (clientWidth/2, clientHeight/2) exposes any globe↔halo OFFSET — the heart of the
  // Safari misalignment (the ?viewprobe reads it; the alignment fix can anchor to it).
  getSphereScreenCenter() {
    const vp = mat4.multiply(mat4.create(), this.camera.matrices.projection, this.camera.matrices.view);
    const cssW = this.gl.canvas.clientWidth;
    const cssH = this.gl.canvas.clientHeight;
    const clip = vec4.transformMat4(vec4.create(), [0, 0, 0, 1], vp);
    if (clip[3] <= 0) return null;
    return { cx: (clip[0] / clip[3] * 0.5 + 0.5) * cssW, cy: (1 - (clip[1] / clip[3] * 0.5 + 0.5)) * cssH };
  }

  // Public: the active (centre-snapped) tile's on-screen circle in CSS px → { cx, cy, r }.
  // Drives the flip's grow-from-tile anchor + the click-only-on-the-disc hit-test. Returns
  // null if there's no active tile or it's behind the camera.
  getActiveTileScreen() {
    const idx = this.activeVertexIndex;
    if (idx == null || idx < 0) return null;
    const world = this.#getVertexWorldPosition(idx);
    const vp = mat4.multiply(mat4.create(), this.camera.matrices.projection, this.camera.matrices.view);
    const cssW = this.gl.canvas.clientWidth;
    const cssH = this.gl.canvas.clientHeight;

    const project = (wx, wy, wz) => {
      const clip = vec4.transformMat4(vec4.create(), [wx, wy, wz, 1], vp);
      if (clip[3] <= 0) return null;
      return [
        (clip[0] / clip[3] * 0.5 + 0.5) * cssW,
        (1 - (clip[1] / clip[3] * 0.5 + 0.5)) * cssH,
      ];
    };

    const c = project(world[0], world[1], world[2]);
    if (!c) return null;
    // radius: offset the centre by the tile's world half-extent (≈ finalScale, since the
    // quad spans ±1) along the camera's right axis, project, and measure the pixel gap.
    const half = this.instanceFinalScale?.[idx] || 0.25;
    const right = vec3.fromValues(this.camera.matrix[0], this.camera.matrix[1], this.camera.matrix[2]);
    const e = project(world[0] + right[0] * half, world[1] + right[1] * half, world[2] + right[2] * half);
    const r = e ? Math.hypot(e[0] - c[0], e[1] - c[1]) : cssW * 0.08;
    return { cx: c[0], cy: c[1], r };
  }

  // Public: orient the globe so the FIRST item matching `pred` becomes the focused (centre) tile.
  // Drives the homepage "Explore campaigns" deep-link (?focus=stardust|horizon). The snap pulls the
  // nearest vertex to snapDirection (0,0,-1), so we rotate the chosen vertex's world position onto
  // that direction; the snap then holds it. Returns true if a match was found + focused.
  focusItem(pred) {
    if (!this.instancePositions || !this.items.length) return false;
    const len = Math.max(1, this.items.length);
    let vi = -1;
    for (let i = 0; i < this.instancePositions.length; ++i) {
      const it = this.items[i % len];
      if (it && pred(it, i % len)) { vi = i; break; }
    }
    if (vi < 0) return false;
    const p = vec3.normalize(vec3.create(), this.instancePositions[vi]);
    const q = quat.rotationTo(quat.create(), p, vec3.fromValues(0, 0, -1));
    quat.copy(this.control.orientation, q);
    quat.identity(this.control.pointerRotation);
    quat.identity(this.control._combinedQuat);
    this.control.rotationVelocity = 0;
    this.control.snapTargetDirection = null; // recompute the snap from the new orientation
    this.activeVertexIndex = vi;
    this.activeIndex = vi % len;
    this.onActiveItemChange(this.items[vi % len], vi % len);
    return true;
  }
}
