import { VERTEX_QUAD } from './shaders/glsl-utils.js';
import { INTRO_FRAG } from './shaders/intro-frag.js';
import { getGL, createProgram, bindFullscreenQuad, sizeCanvas } from './gl-context.js';

// Intro-only cosmic-noise field with the dispersive big-bang pulse.
export function createIntroStarfield(canvasId) {
  return {
    canvasId,
    canvas: null,
    gl: null,
    program: null,
    startTime: performance.now(),
    pulse: 0,
    _u: {},
    _contextLost: false,

    init() {
      this.canvas = document.getElementById(this.canvasId);
      if (!this.canvas) return;
      this.gl = getGL(this.canvas);
      if (!this.gl) {
        console.warn('WebGL not supported, intro background disabled');
        return;
      }
      this.canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        this._contextLost = true;
      });
      this.canvas.addEventListener('webglcontextrestored', () => {
        this._contextLost = false;
        this._build();
      });
      this.resize();
      this._build();
    },

    _build() {
      const gl = this.gl;
      this.program = createProgram(gl, VERTEX_QUAD, INTRO_FRAG);
      if (!this.program) return;
      this._u = {
        res: gl.getUniformLocation(this.program, 'u_resolution'),
        time: gl.getUniformLocation(this.program, 'u_time'),
        pulse: gl.getUniformLocation(this.program, 'u_pulse'),
      };
      bindFullscreenQuad(gl, this.program);
    },

    resize() {
      if (this.canvas) sizeCanvas(this.canvas, this.gl);
    },

    setPulse(v) {
      this.pulse = v;
    },

    render(now) {
      const gl = this.gl;
      if (!gl || !this.program || this._contextLost) return;
      gl.useProgram(this.program);
      gl.uniform2f(this._u.res, this.canvas.width, this.canvas.height);
      gl.uniform1f(this._u.time, (now - this.startTime) / 1000);
      gl.uniform1f(this._u.pulse, this.pulse);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },
  };
}
