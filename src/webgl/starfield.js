import { VERTEX_QUAD } from './shaders/glsl-utils.js';
import { STARFIELD_FRAG } from './shaders/intro-frag.js';
import { getGL, createProgram, bindFullscreenQuad, sizeCanvas } from './gl-context.js';

// Reusable twinkling-starfield surface. One shader, parameterised by color +
// invert + intensity. Canonical white-on-black, or inverted black-on-offwhite.
export function createStarfield(canvasId, options = {}) {
  return {
    canvasId,
    canvas: null,
    gl: null,
    program: null,
    bgColor: options.bgColor || [0, 0, 0],
    starColor: options.starColor || [1, 1, 1],
    invert: options.invert ? 1.0 : 0.0,
    intensity: options.intensity != null ? options.intensity : 0.25,
    startTime: performance.now(),
    _u: {},

    init() {
      this.canvas = document.getElementById(this.canvasId);
      if (!this.canvas) return;
      this.gl = getGL(this.canvas);
      if (!this.gl) return;
      this.resize();
      this.program = createProgram(this.gl, VERTEX_QUAD, STARFIELD_FRAG);
      if (!this.program) return;
      const gl = this.gl;
      this._u = {
        res: gl.getUniformLocation(this.program, 'u_resolution'),
        time: gl.getUniformLocation(this.program, 'u_time'),
        bg: gl.getUniformLocation(this.program, 'u_bgColor'),
        star: gl.getUniformLocation(this.program, 'u_starColor'),
        invert: gl.getUniformLocation(this.program, 'u_invert'),
        intensity: gl.getUniformLocation(this.program, 'u_intensity'),
      };
      bindFullscreenQuad(gl, this.program);
    },

    resize() {
      if (this.canvas) sizeCanvas(this.canvas, this.gl);
    },

    // Drawn by the central renderer. `now` is the shared RAF timestamp (ms).
    render(now) {
      const gl = this.gl;
      if (!gl || !this.program) return;
      gl.useProgram(this.program);
      gl.uniform2f(this._u.res, this.canvas.width, this.canvas.height);
      gl.uniform1f(this._u.time, (now - this.startTime) / 1000);
      gl.uniform3fv(this._u.bg, this.bgColor);
      gl.uniform3fv(this._u.star, this.starColor);
      gl.uniform1f(this._u.invert, this.invert);
      gl.uniform1f(this._u.intensity, this.intensity);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },
  };
}
