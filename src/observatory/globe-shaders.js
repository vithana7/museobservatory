// Muse Observatory globe — GLSL ES 3.00 (WebGL2) tile shaders.
//
// Ported from reactbits InfiniteMenu with cocoex changes:
//   • the unused aModelNormal attribute is dropped;
//   • ALL tiles are circles — the fragment shader clips the quad to its inscribed circle.
//   • ROUND 5 — PROCEDURAL DISC: the tile's coloured disc (radial gradient + film grain +
//     anti-aliased edge) is computed IN THE FRAGMENT SHADER from a per-instance accent
//     colour, NOT baked into the atlas. Baked disc tiles render only ~200px on-screen (5×
//     minified from the 1024 cell) → soft on Safari no matter the texture filter (probe
//     round 4). A procedural disc is razor-sharp at ANY size/zoom. The atlas now holds ONLY
//     the foreground (white muse symbol / campaign label on transparent), composited over
//     the procedural disc — the only thing still sampled, and a simple white glyph survives
//     minification far better than a full gradient+grain disc.
//   • ROUND 6 — NOISE: round 5's per-pixel hash() grain read as harsh DIGITAL STATIC.
//     Replaced with the EXACT muse-popup grain — a baked feTurbulence tile (uNoise),
//     sampled SCREEN-stably (uNoiseScale = 1/(160·dpr), matching the popup's 160px CSS
//     tile so it can't minify/mip away) and composited with the popup's real CSS blend
//     math (overlay @0.18 on colour discs, screen @0.13 on black) → soft, organic.

export const TILE_VERT = /* glsl */ `#version 300 es

uniform mat4 uWorldMatrix;
uniform mat4 uViewMatrix;
uniform mat4 uProjectionMatrix;
uniform vec4 uRotationAxisVelocity;

in vec3 aModelPosition;
in vec2 aModelUvs;
in mat4 aInstanceMatrix;
in vec4 aInstanceColor;   // rgb = disc accent (0..1), a = isBlack flag (1 = muse-less)

out vec2 vUvs;
out float vAlpha;
out vec4 vColor;
flat out int vInstanceId;

void main() {
    vec4 worldPosition = uWorldMatrix * aInstanceMatrix * vec4(aModelPosition, 1.);

    vec3 centerPos = (uWorldMatrix * aInstanceMatrix * vec4(0., 0., 0., 1.)).xyz;
    float radius = length(centerPos.xyz);

    // Rim vertices (gl_VertexID > 0) smear along the rotation direction — a subtle
    // motion blur that scales with angular velocity. Centre vertex (0) stays put.
    if (gl_VertexID > 0) {
        vec3 rotationAxis = uRotationAxisVelocity.xyz;
        float rotationVelocity = min(.15, uRotationAxisVelocity.w * 15.);
        vec3 stretchDir = normalize(cross(centerPos, rotationAxis));
        vec3 relativeVertexPos = normalize(worldPosition.xyz - centerPos);
        float strength = dot(stretchDir, relativeVertexPos);
        float invAbsStrength = min(0., abs(strength) - 1.);
        strength = rotationVelocity * sign(strength) * abs(invAbsStrength * invAbsStrength * invAbsStrength + 1.);
        worldPosition.xyz += stretchDir * strength;
    }

    worldPosition.xyz = radius * normalize(worldPosition.xyz);

    gl_Position = uProjectionMatrix * uViewMatrix * worldPosition;

    vAlpha = smoothstep(0.5, 1., normalize(worldPosition.xyz).z) * .9 + .1;
    vUvs = aModelUvs;
    vColor = aInstanceColor;
    vInstanceId = gl_InstanceID;
}
`;

export const TILE_FRAG = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D uTex;    // FOREGROUND only: white symbol / label on transparent
uniform sampler2D uNoise;  // baked feTurbulence grain tile (the EXACT muse-popup noise)
uniform float uNoiseScale; // 1 / (160 * dpr): sample uNoise at a SCREEN-stable 160px period
uniform float uFgBias;     // LOD bias for the foreground (symbol/label) sample — round 6 #2
                           // (uniform so the probe can sweep it live; default set in globe.js)
uniform int uItemCount;
uniform int uAtlasSize;

out vec4 outColor;

in vec2 vUvs;
in float vAlpha;
in vec4 vColor;          // rgb = accent, a = isBlack flag
flat in int vInstanceId;

// CSS blend modes, matching the muse popup's grain compositing exactly.
//   coloured disc → mix-blend-mode: overlay @ 0.18   (.muse-card-inside::after)
//   black disc    → mix-blend-mode: screen  @ 0.13   (.muse-orbit-face--back …::after)
vec3 blendOverlay(vec3 b, vec3 s) {
    return mix(2.0 * b * s, 1.0 - 2.0 * (1.0 - b) * (1.0 - s), step(0.5, b));
}
vec3 blendScreen(vec3 b, vec3 s) {
    return 1.0 - (1.0 - b) * (1.0 - s);
}

void main() {
    // ── inscribed-circle clip (AA via fwidth) ──────────────────────────────────
    float d = length(vUvs - 0.5) * 2.0;        // 0 centre, 1 edge mid-points
    float fw = fwidth(d) * 1.5;
    float mask = 1.0 - smoothstep(1.0 - fw, 1.0, d);
    if (mask <= 0.0) discard;

    // ── PROCEDURAL disc: radial gradient (origin 50% 38%, matches the popup disc) ──
    float gd = clamp(length(vUvs - vec2(0.5, 0.38)) / 0.8, 0.0, 1.0);
    vec3 base, edge;
    if (vColor.a > 0.5) {                       // muse-less / black disc (#1d1d1d → #000)
        base = vec3(0.114); edge = vec3(0.0);
    } else {
        base = vColor.rgb;                      // full hue at centre
        edge = vColor.rgb * 0.7;               // −30% at the rim (matches darken(hex,0.3))
    }
    vec3 disc = mix(base, edge, gd);

    // ── film grain = the BAKED muse-popup feTurbulence, sampled SCREEN-stably (so it
    //    can't be minified/mip-averaged away on Safari — round 3/5 failure) and blended
    //    with the popup's real CSS blend math (organic, soft — NOT the round-5 hash). ──
    vec3 grain = texture(uNoise, gl_FragCoord.xy * uNoiseScale).rgb;
    if (vColor.a > 0.5) {                       // black disc → screen @ 0.13
        disc = mix(disc, blendScreen(disc, grain), 0.13);
    } else {                                    // coloured disc → overlay @ 0.18
        disc = mix(disc, blendOverlay(disc, grain), 0.18);
    }

    // ── foreground glyph/label (the ONLY sampled layer) ───────────────────────
    int itemIndex = vInstanceId % uItemCount;
    int cpr = uAtlasSize;
    int cellX = itemIndex % cpr;
    int cellY = itemIndex / cpr;
    vec2 cellSize = vec2(1.0) / vec2(float(cpr));
    vec2 cellOffset = vec2(float(cellX), float(cellY)) * cellSize;
    const float INSET = 0.012;                  // stop atlas mip cross-bleed
    vec2 cuv = vec2(vUvs.x, 1.0 - vUvs.y);
    cuv = cuv * (1.0 - 2.0 * INSET) + INSET;
    vec2 st = cuv * cellSize + cellOffset;
    vec4 fg = texture(uTex, st, uFgBias);       // PREMULTIPLIED (clean mips, no edge fringe)

    vec3 col = disc * (1.0 - fg.a) + fg.rgb;    // composite premultiplied symbol/engrave over disc
    outColor = vec4(col, vAlpha * mask);
}
`;
