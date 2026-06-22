import { SIMPLEX_NOISE, STAR_FIELD } from './glsl-utils.js';

// Intro cosmic-noise starfield + a muse-spectrum "big bang" RIPPLE burst.
// The pulse moment (u_pulse 0→1, fired when the constellation explodes) now drives a
// concentric-ring ripple (ported from the 21st.dev/aliimam shader: glowing rings via
// 1/abs(fract(t)*5 - length(uv) + mod(...)) with an irregular diagonal term) — tinted
// across the 7 muse hues and enveloped by sin(pulse*PI) so it swells with the burst and
// fades out, layered over the monochrome cosmic noise. NOT continuous: it's a one-shot.
export const INTRO_FRAG = `
  precision highp float;
  #define PI 3.14159265359
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform float u_pulse;

  ${SIMPLEX_NOISE}
  ${STAR_FIELD}

  // Smooth palette across the 7 muse hues (Ares→Solis→Thunor→Rabu→Lunes→Shukra→Dosei).
  vec3 museTint(float t) {
    t = clamp(t, 0.0, 1.0) * 6.0;
    vec3 c = mix(vec3(0.835,0.302,0.180), vec3(0.831,0.514,0.282), clamp(t,       0.0, 1.0));
    c = mix(c, vec3(0.973,0.847,0.416), clamp(t - 1.0, 0.0, 1.0));
    c = mix(c, vec3(0.549,0.690,0.498), clamp(t - 2.0, 0.0, 1.0));
    c = mix(c, vec3(0.341,0.514,0.651), clamp(t - 3.0, 0.0, 1.0));
    c = mix(c, vec3(0.369,0.278,0.631), clamp(t - 4.0, 0.0, 1.0));
    c = mix(c, vec3(0.498,0.286,0.635), clamp(t - 5.0, 0.0, 1.0));
    return c;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    float aspect = u_resolution.x / u_resolution.y;
    vec2 uvAspect = vec2(uv.x * aspect, uv.y);

    float noise1 = snoise(uvAspect * 3.0 + u_time * 0.05);
    float noise2 = snoise(uvAspect * 5.0 - u_time * 0.03 + 50.0);
    float noise3 = snoise(uvAspect * 2.0 + u_time * 0.02 + 100.0);
    float combined = (noise1 + noise2 * 0.6 + noise3 * 0.8) / 2.4;
    combined = combined * 0.5 + 0.5;

    float base = 0.003;
    float highlight = combined * 0.025;
    float clouds = pow(combined, 2.0) * 0.02;
    float detail = pow(snoise(uvAspect * 7.0 + u_time * 0.08) * 0.5 + 0.5, 2.5) * 0.01;
    float brightness = base + highlight + clouds + detail;

    float starLight = stars(uv, u_time);
    brightness += starLight * 0.25;

    vec3 col = vec3(brightness);

    if (u_pulse > 0.0) {
      // Aspect-correct, centered coords (matches the reference shader's normalisation).
      vec2 ruv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
      // burst envelope, broadened peak so the rings stay bright as they travel out then fade.
      // max(…,0) is REQUIRED: sin(π) lands at a tiny NEGATIVE float at pulse=1, and
      // pow(negative, 0.6) = NaN → a black-pixel flash. Clamp the base to keep it safe.
      float env = pow(max(sin(u_pulse * PI), 0.0), 0.6);
      float r = length(ruv);

      // Concentric wavefront EXPANDING from center, radius driven by the pulse (NOT page
      // time — so the ring positions are identical no matter when the burst fires). The
      // radius uses an ease-OUT (1-(1-p)^2) so the wave races out then DECELERATES as it
      // widens — like a real shockwave — and reaches 1.6 (past the screen corners) so it
      // ripples to ALL ends of the page. 1/abs = glowing thin rings; the snoise wobble
      // perturbs the radius for ORGANIC irregularity (the reference's hard mod() seam read
      // as a glitch — replaced).
      float rad = (1.0 - pow(1.0 - u_pulse, 2.0)) * 1.6;
      float wob = snoise(ruv * 1.6 + u_pulse * 3.0) * 0.12;
      float rings = 0.0;
      for (int i = 0; i < 5; i++) {
        float fi = float(i);
        rings += 0.0016 * fi * fi / abs((rad - fi * 0.16) - r + wob);
      }
      rings = min(rings, 1.6);                 // tame the 1/abs spikes (no blow-out)

      vec3 tint = museTint(fract(r * 0.6 + u_pulse));
      col += rings * tint * env * 0.45;

      // faint white core flash for the "bang"
      col += vec3(env * env * exp(-r * 3.0) * 0.12);
    }

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  }
`;

// Standalone, TRANSPARENT version of the intro ripple — the same muse-spectrum "big
// bang" wavefront, but with no starfield/noise behind it and centred on a configurable
// point (u_center, in 0..1 uv). Used as an overlay for the comet dive so the constellation
// burst rides outward from the logo. Premultiplied output (rgb already == a*hue), cleared
// transparent each frame so the scene shows through where there are no rings.
export const BURST_RIPPLE_FRAG = `
  precision highp float;
  #define PI 3.14159265359
  uniform vec2 u_resolution;
  uniform float u_pulse;
  uniform vec2 u_center;

  ${SIMPLEX_NOISE}

  vec3 museTint(float t) {
    t = clamp(t, 0.0, 1.0) * 6.0;
    vec3 c = mix(vec3(0.835,0.302,0.180), vec3(0.831,0.514,0.282), clamp(t,       0.0, 1.0));
    c = mix(c, vec3(0.973,0.847,0.416), clamp(t - 1.0, 0.0, 1.0));
    c = mix(c, vec3(0.549,0.690,0.498), clamp(t - 2.0, 0.0, 1.0));
    c = mix(c, vec3(0.341,0.514,0.651), clamp(t - 3.0, 0.0, 1.0));
    c = mix(c, vec3(0.369,0.278,0.631), clamp(t - 4.0, 0.0, 1.0));
    c = mix(c, vec3(0.498,0.286,0.635), clamp(t - 5.0, 0.0, 1.0));
    return c;
  }

  void main() {
    if (u_pulse <= 0.0) { gl_FragColor = vec4(0.0); return; }
    // Centred, aspect-correct coords relative to the focal point (min-dim normalised,
    // matching the intro ripple so the ring spacing reads identically).
    vec2 ruv = (gl_FragCoord.xy - u_center * u_resolution) * 2.0 / min(u_resolution.x, u_resolution.y);
    float env = pow(max(sin(u_pulse * PI), 0.0), 0.6);   // swell then fade (NaN-guarded)
    float r = length(ruv);
    float rad = (1.0 - pow(1.0 - u_pulse, 2.0)) * 3.0;    // ease-out shockwave PAST every edge
    float wob = snoise(ruv * 1.6 + u_pulse * 3.0) * 0.12; // organic irregularity
    float rings = 0.0;
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      rings += 0.0016 * fi * fi / abs((rad - fi * 0.22) - r + wob);
    }
    rings = min(rings, 1.6);

    vec3 tint = museTint(fract(r * 0.6 + u_pulse));
    vec3 col = rings * tint * env * 0.6;
    // NOTE: no white core flash here (the intro has one) — at this focal-centred zoom it
    // read as a "white dot forming". The rings alone carry the burst.
    col = clamp(col, 0.0, 1.0);

    // a == max channel => col is already premultiplied (col == a * hue), so it composites
    // cleanly over the page where rings exist and is fully transparent where they don't.
    float a = clamp(max(max(col.r, col.g), col.b), 0.0, 1.0);
    gl_FragColor = vec4(col, a);
  }
`;

export const STARFIELD_FRAG = `
  precision highp float;
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform vec3 u_bgColor;
  uniform vec3 u_starColor;
  uniform float u_invert;
  uniform float u_intensity;

  ${STAR_FIELD}

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    float starLight = stars(uv, u_time);
    float brightness = clamp(starLight * u_intensity, 0.0, 1.0);
    vec3 color = mix(u_bgColor, u_starColor, brightness);
    color = mix(color, vec3(1.0) - color, u_invert);
    gl_FragColor = vec4(color, 1.0);
  }
`;
