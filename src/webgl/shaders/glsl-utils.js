// Shared GLSL chunks. Concatenated into shader sources verbatim — keep byte-identical
// to the original so the visual output is unchanged.

export const SIMPLEX_NOISE = `
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                       -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m*m*m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }
`;

export const STAR_FIELD = `
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float stars(vec2 uv, float time) {
    float starField = 0.0;

    for (float i = 0.0; i < 4.0; i++) {
      vec2 gridUv = uv * (30.0 + i * 25.0);
      vec2 gridId = floor(gridUv);
      vec2 gridFract = fract(gridUv);

      float starHash = hash(gridId + i * 100.0);

      if (starHash > 0.85) {
        vec2 starPos = vec2(hash(gridId + 0.1), hash(gridId + 0.2));
        float dist = length(gridFract - starPos);

        float twinkle = sin(time * (0.75 + starHash * 1.25) + starHash * 6.28) * 0.5 + 0.5;
        twinkle = 0.3 + twinkle * 0.7;

        float starSize = 0.03 + starHash * 0.04;
        float starBright = smoothstep(starSize, 0.0, dist) * twinkle * (0.5 + starHash * 0.5);
        starField += starBright;
      }
    }

    return starField;
  }
`;

// Cheap ordered/triangular dither for fullscreen near-black gradients. The cosmic backdrop
// outputs brightness values around 0.003–0.05 into an 8-bit RGBA backbuffer; Chrome dithers
// it (smooth), Safari does NOT (visible banding that reads as grain). A hash-based triangular
// dither in roughly [-0.5,0.5] LSB breaks the bands without reading as static. Apply as
// `col += dither(gl_FragCoord.xy) / 255.0;` right before the final clamp/write. Keep it at
// ~one 8-bit step — over-applying makes visible static (round 5 failure mode).
export const DITHER = `
  float dither(vec2 fragCoord) {
    // triangular PDF noise: difference of two uniform hashes → values in ~[-0.5, 0.5]
    float a = fract(sin(dot(fragCoord, vec2(127.1, 311.7))) * 43758.5453);
    float b = fract(sin(dot(fragCoord + 17.0, vec2(269.5, 183.3))) * 43758.5453);
    return (a + b) - 1.0;
  }
`;

export const VERTEX_QUAD = `
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;
